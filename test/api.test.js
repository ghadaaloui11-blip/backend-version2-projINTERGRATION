/**
 * Tests de fumee de l'API (node:test + fetch, sans dependance externe).
 * Usage : npm test
 *
 * Le serveur est demarre sur un port ephemere et interroge en HTTP reel.
 * Les ecritures eventuelles sont nettoyees en fin de test.
 */
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../app");
const pool = require("../config/db");

let baseUrl;
let server;

const api = async (methode, chemin, { token, body } = {}) => {
  const entetes = {};
  if (token) entetes.Authorization = `Bearer ${token}`;
  if (body !== undefined) entetes["Content-Type"] = "application/json";
  const reponse = await fetch(baseUrl + chemin, {
    method: methode,
    headers: entetes,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texte = await reponse.text();
  let json = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* reponse non JSON */
  }
  return { status: reponse.status, json, texte, headers: reponse.headers };
};

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await pool.end();
});

test("sante : les campagnes publiques repondent en JSON", async () => {
  const { status, json } = await api("GET", "/api/campagnes?statut=all");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
});

test("types : les montants sont des nombres (NUMERIC cast en float8)", async () => {
  const { status, json } = await api("GET", "/api/campagnes?statut=all");
  assert.equal(status, 200);
  if (json.length > 0) {
    assert.equal(typeof json[0].objectif_montant, "number");
    assert.equal(typeof json[0].montant_collecte, "number");
  }
});

test("routes protegees : 401 sans token", async () => {
  const { status, json } = await api("GET", "/api/signalement");
  assert.equal(status, 401);
  assert.ok(json.erreur);
});

test("route inconnue : 404 au format JSON", async () => {
  const { status, json, headers } = await api("GET", "/api/inexistant");
  assert.equal(status, 404);
  assert.equal(json.erreur, "Route introuvable.");
  assert.match(headers.get("content-type") || "", /application\/json/);
});

test("inscription : le role admin est refuse", async () => {
  const { status, json } = await api("POST", "/api/auth/inscription", {
    body: {
      nom: "Pirate",
      email: `pirate_${Date.now()}@test.tn`,
      motDePasse: "Secret123!",
      role: "admin",
    },
  });
  assert.equal(status, 400);
  assert.match(json.erreur, /Rôle invalide/);
});

test("inscription association sans nom d'association : 400 et aucune ligne orpheline", async () => {
  const avant = await pool.query("SELECT count(*)::int AS n FROM utilisateur");
  const email = `asso_sans_nom_${Date.now()}@test.tn`;

  const { status, json } = await api("POST", "/api/auth/inscription", {
    body: { nom: "Asso", prenom: "Responsable", telephone: "01234567", email, motDePasse: "Secret123!", role: "association" },
  });

  assert.equal(status, 400);
  assert.match(json.erreur, /nom de l'association/i);

  const apres = await pool.query("SELECT count(*)::int AS n FROM utilisateur");
  assert.equal(apres.rows[0].n, avant.rows[0].n, "aucun utilisateur ne doit rester (rollback)");

  const orphelin = await pool.query("SELECT id FROM utilisateur WHERE email = $1", [email]);
  assert.equal(orphelin.rows.length, 0);
});

test("parcours citoyen : inscription 201 -> connexion 200 (nettoye ensuite)", async () => {
  const email = `citoyen_${Date.now()}@test.tn`;

  const inscription = await api("POST", "/api/auth/inscription", {
    body: {
      nom: "Test",
      prenom: "Citoyen",
      telephone: "01234567",
      email,
      motDePasse: "Secret123!",
      role: "citoyen",
    },
  });
  assert.equal(inscription.status, 201);

  const connexion = await api("POST", "/api/auth/connexion", {
    body: { email, motDePasse: "Secret123!" },
  });
  assert.equal(connexion.status, 200);
  assert.ok(connexion.json.token);

  const supprime = await pool.query("DELETE FROM utilisateur WHERE email = $1 RETURNING id", [email]);
  assert.equal(supprime.rows.length, 1);
});

test("connexion : mauvais identifiants -> 401", async () => {
  const { status, json } = await api("POST", "/api/auth/connexion", {
    body: { email: "inconnu@test.tn", motDePasse: "mauvais" },
  });
  assert.equal(status, 401);
  assert.ok(json.erreur);
});

test("connexion : les espaces autour du mot de passe sont ignores", async () => {
  const email = `trim_${Date.now()}@test.tn`;

  const inscription = await api("POST", "/api/auth/inscription", {
    body: {
      nom: "Test",
      prenom: "Citoyen",
      telephone: "01234567",
      email,
      motDePasse: " Secret123! ",
      role: "citoyen",
    },
  });
  assert.equal(inscription.status, 201);

  const connexion = await api("POST", "/api/auth/connexion", {
    body: { email, motDePasse: "Secret123!" },
  });
  assert.equal(connexion.status, 200);
  assert.ok(connexion.json.token);

  const supprime = await pool.query("DELETE FROM utilisateur WHERE email = $1 RETURNING id", [email]);
  assert.equal(supprime.rows.length, 1);
});

test("don : montant invalide -> 400", async () => {
  const { status, json } = await api("POST", "/api/campagnes/1/don", {
    body: { montant: 0, est_anonyme: true },
  });
  assert.equal(status, 400);
  assert.ok(json.erreur);
});

test("don : campagne inexistante -> 404", async () => {
  const { status, json } = await api("POST", "/api/campagnes/999999/don", {
    body: { montant: 10, est_anonyme: true },
  });
  assert.equal(status, 404);
  assert.ok(json.erreur);
});

test("documents : telechargement sans token -> 401", async () => {
  const { status, json } = await api("GET", "/api/documents/1/file");
  assert.equal(status, 401);
  assert.ok(json.erreur);
});

test("roles : un citoyen ne peut pas lister les signalements (403)", async () => {
  const jwt = require("jsonwebtoken");
  const token = jwt.sign({ id: 999999, role: "citoyen" }, process.env.JWT_SECRET);
  const { status, json } = await api("GET", "/api/signalement", { token });
  assert.equal(status, 403);
  assert.ok(json.erreur);
});

// ---------------------------------------------------------------------------
// Regles metier : dons (roles) et creation de campagne (validation admin)
// ---------------------------------------------------------------------------

const jwt = require("jsonwebtoken");

const emailTemporaire = (prefixe) =>
  `${prefixe}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.tn`;

const inscrireAssociationTemporaire = async ({ approuvee = false } = {}) => {
  const email = emailTemporaire("asso_tmp");
  const inscription = await api("POST", "/api/auth/inscription", {
    body: {
      nom: "Asso Temporaire",
      prenom: "Responsable",
      telephone: "01234567",
      email,
      motDePasse: "Secret123!",
      role: "association",
      nomAssociation: "Association temporaire",
    },
  });
  assert.equal(inscription.status, 201, inscription.texte);
  const id = inscription.json.utilisateur.id;

  if (approuvee) {
    await pool.query("UPDATE association SET statut_validation = 'approuve' WHERE id = $1", [id]);
  }

  const connexion = await api("POST", "/api/auth/connexion", {
    body: { email, motDePasse: "Secret123!" },
  });
  assert.equal(connexion.status, 200, connexion.texte);
  return { id, email, token: connexion.json.token };
};

const campagneValide = () => {
  const iso = (date) => date.toISOString().slice(0, 10);
  return {
    titre: "Campagne temporaire",
    description: "Campagne creee par les tests",
    objectif_montant: 1000,
    date_debut: iso(new Date()),
    date_fin: iso(new Date(Date.now() + 30 * 24 * 3600 * 1000)),
  };
};

const supprimerUtilisateur = (id) => pool.query("DELETE FROM utilisateur WHERE id = $1", [id]);

test("campagne : association en attente de validation -> 403", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: false });
  try {
    const avant = await pool.query("SELECT count(*)::int AS n FROM campagnes");
    const { status, json } = await api("POST", "/api/campagnes", {
      token: asso.token,
      body: campagneValide(),
    });
    assert.equal(status, 403);
    assert.match(json.erreur, /validée par un administrateur/);

    const apres = await pool.query("SELECT count(*)::int AS n FROM campagnes");
    assert.equal(apres.rows[0].n, avant.rows[0].n, "aucune campagne ne doit etre creee");
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("campagne : association approuvee -> 201 (nettoyee ensuite)", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const { status, json } = await api("POST", "/api/campagnes", {
      token: asso.token,
      body: campagneValide(),
    });
    assert.equal(status, 201, json && json.erreur);
    assert.equal(json.campagne.association_id, asso.id);
    assert.equal(json.campagne.statut, "active");
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("don : admin connecte -> 403", async () => {
  const token = jwt.sign({ id: 999999, role: "admin" }, process.env.JWT_SECRET);
  const { status, json } = await api("POST", "/api/campagnes/1/don", {
    token,
    body: { montant: 10, est_anonyme: true },
  });
  assert.equal(status, 403);
  assert.ok(json.erreur);
});

test("don : association connectee -> 403", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const { status, json } = await api("POST", "/api/campagnes/1/don", {
      token: asso.token,
      body: { montant: 10, est_anonyme: true },
    });
    assert.equal(status, 403);
    assert.ok(json.erreur);
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("don : anonyme sans token -> 201 (nettoye ensuite)", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const campagne = await api("POST", "/api/campagnes", {
      token: asso.token,
      body: campagneValide(),
    });
    assert.equal(campagne.status, 201);

    const { status, json } = await api(
      "POST",
      `/api/campagnes/${campagne.json.campagne.id}/don`,
      { body: { montant: 15, est_anonyme: true } }
    );
    assert.equal(status, 201);
    assert.match(json.reference, /^DON-/);
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("don : token invalide -> 401", async () => {
  const { status, json } = await api("POST", "/api/campagnes/1/don", {
    token: "token-bidon",
    body: { montant: 10, est_anonyme: true },
  });
  assert.equal(status, 401);
  assert.ok(json.erreur);
});

// ---------------------------------------------------------------------------
// US06 / US32 / US33 : visibilite publique, prise en charge, suivi du statut
// ---------------------------------------------------------------------------

const inscrireCitoyenTemporaire = async () => {
  const email = emailTemporaire("citoyen_tmp");
  const inscription = await api("POST", "/api/auth/inscription", {
    body: {
      nom: "Citoyen Temporaire",
      prenom: "Citoyen",
      telephone: "01234567",
      email,
      motDePasse: "Secret123!",
      role: "citoyen",
    },
  });
  assert.equal(inscription.status, 201, inscription.texte);
  const id = inscription.json.utilisateur.id;
  const connexion = await api("POST", "/api/auth/connexion", {
    body: { email, motDePasse: "Secret123!" },
  });
  assert.equal(connexion.status, 200, connexion.texte);
  return { id, email, token: connexion.json.token };
};

const creerSignalementTemporaire = async (citoyenId, options = {}) => {
  const { rows } = await pool.query(
    `INSERT INTO signalement (description, statut, est_anonyme, citoyen_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      options.description ?? "Nid de papiers dans un terrain vide",
      options.statut ?? "recu",
      options.est_anonyme ?? false,
      citoyenId,
    ]
  );
  return rows[0];
};

const supprimerSignalement = (id) => pool.query("DELETE FROM signalement WHERE id = $1", [id]);

// Creation via le vrai endpoint (multipart) : garantit le journal "recu".
const creerSignalementViaApi = async (token, description) => {
  const form = new FormData();
  // US07 : le titre est obligatoire (5 caracteres minimum).
  form.append("titre", "Signalement de test");
  form.append("description", description);
  const reponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await reponse.json();
  assert.equal(reponse.status, 201, JSON.stringify(json));
  return json.signalement;
};

// (1)(2)(3) Publication citoyen -> consultation publique sans aucun token
test("signalement public : visible sans token, sans citoyen_id", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  const signalement = await creerSignalementTemporaire(citoyen.id);
  try {
    const liste = await api("GET", "/api/signalement/public");
    assert.equal(liste.status, 200);
    assert.ok(Array.isArray(liste.json));
    const vu = liste.json.find((s) => s.id === signalement.id);
    assert.ok(vu, "le signalement publie doit apparaitre dans la liste publique");
    assert.equal(vu.statut, "recu");

    // (12) aucune donnee privee du citoyen dans la projection publique
    for (const s of liste.json) {
      assert.ok(!Object.hasOwn(s, "citoyen_id"), "citoyen_id ne doit pas etre expose");
    }

    const detail = await api("GET", `/api/signalement/public/${signalement.id}`);
    assert.equal(detail.status, 200);
    assert.ok(!Object.hasOwn(detail.json, "citoyen_id"), "citoyen_id ne doit pas etre expose");

    // filtre invalide -> 400 JSON
    const filtreInvalide = await api("GET", "/api/signalement/public?statut=bidon");
    assert.equal(filtreInvalide.status, 400);
    assert.ok(filtreInvalide.json.erreur);

    // detail inconnu -> 404
    const inconnu = await api("GET", "/api/signalement/public/999999");
    assert.equal(inconnu.status, 404);
  } finally {
    await supprimerSignalement(signalement.id);
    await supprimerUtilisateur(citoyen.id);
  }
});

// (10) les actions d'ecriture restent protegees : 401 sans token, 403 hors role
test("prise en charge : securite 401/403", async () => {
  const sansToken = await api("POST", "/api/signalement/1/prendre-en-charge", { body: {} });
  assert.equal(sansToken.status, 401);

  const sansTokenStatut = await api("PATCH", "/api/signalement/1/statut", {
    body: { statut: "resolu" },
  });
  assert.equal(sansTokenStatut.status, 401);

  // un citoyen ne peut ni prendre en charge, ni changer un statut
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const citoyenAttempt = await api("POST", "/api/signalement/1/prendre-en-charge", {
      token: citoyen.token,
      body: {},
    });
    assert.equal(citoyenAttempt.status, 403);
    const citoyenStatut = await api("PATCH", "/api/signalement/1/statut", {
      token: citoyen.token,
      body: { statut: "resolu" },
    });
    assert.equal(citoyenStatut.status, 403);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

// (4)(5)(6)(7)(8)(9)(11) : parcours complet avec deux associations
test("prise en charge : une seule association gagne, les autres recoivent 409", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  const assoA = await inscrireAssociationTemporaire({ approuvee: true });
  const assoB = await inscrireAssociationTemporaire({ approuvee: true });
  const signalement = await creerSignalementViaApi(
    citoyen.token,
    "Terrain inonde apres les pluies"
  );
  try {
    // (5) A prend en charge -> statut passe automatiquement a en_cours
    const priseA = await api("POST", `/api/signalement/${signalement.id}/prendre-en-charge`, {
      token: assoA.token,
      body: {},
    });
    assert.equal(priseA.status, 201, priseA.texte);
    assert.equal(priseA.json.signalement.statut, "en_cours");
    assert.equal(priseA.json.signalement.association_id, assoA.id);
    assert.ok(priseA.json.signalement.date_prise_en_charge);

    // (6) B revendique le meme signalement -> 409, jamais d'ecriture
    const priseB = await api("POST", `/api/signalement/${signalement.id}/prendre-en-charge`, {
      token: assoB.token,
      body: {},
    });
    assert.equal(priseB.status, 409);
    assert.match(priseB.json.erreur, /déjà été pris en charge/);

    // (7) le suivi est desynchronise : seuls les reports de A sont listes chez A
    const mesA = await api("GET", "/api/signalement/mes-prises-en-charge", { token: assoA.token });
    assert.equal(mesA.status, 200);
    assert.ok(mesA.json.some((s) => s.id === signalement.id));

    // Suite de (6) : B ne peut pas changer le statut d'un signalement sous la
    // responsabilité de A -> 403 generique
    const statutParB = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: assoB.token,
      body: { statut: "resolu" },
    });
    assert.equal(statutParB.status, 403);

    // transition invalide refusee -> 400
    const statutInvalide = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: assoA.token,
      body: { statut: "livre" },
    });
    assert.equal(statutInvalide.status, 400);

    // (8) A termine : en_cours -> resolu
    const resolution = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: assoA.token,
      body: { statut: "resolu" },
    });
    assert.equal(resolution.status, 200, resolution.texte);
    assert.equal(resolution.json.signalement.statut, "resolu");
    assert.ok(resolution.json.signalement.date_resolution);

    // resolution definitive : un second passage est refuse
    const doubleResolution = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: assoA.token,
      body: { statut: "resolu" },
    });
    assert.equal(doubleResolution.status, 409);

    // (9) le public voit le statut evolue et l'association responsable
    const detailPublic = await api("GET", `/api/signalement/public/${signalement.id}`);
    assert.equal(detailPublic.status, 200);
    assert.equal(detailPublic.json.statut, "resolu");
    assert.equal(detailPublic.json.association_id, assoA.id);
    assert.ok(detailPublic.json.nom_association);

    // Journal complet : recu -> en_cours -> resolu, horodate et attribue
    assert.deepEqual(
      detailPublic.json.historique.map((h) => h.statut),
      ["recu", "en_cours", "resolu"],
      "l'historique doit relater toutes les transitions"
    );
    assert.equal(detailPublic.json.historique[0].nom_association, null);
    assert.equal(detailPublic.json.historique[1].nom_association, "Association temporaire");

    // (11) assigne ET resolu : toujours visible publiquement
    const listeApres = await api("GET", "/api/signalement/public?statut=resolu");
    assert.equal(listeApres.status, 200);
    assert.ok(listeApres.json.some((s) => s.id === signalement.id));
  } finally {
    await supprimerSignalement(signalement.id);
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(assoA.id);
    await supprimerUtilisateur(assoB.id);
  }
});

// association en attente de validation : elle peut voir, pas agir
test("prise en charge : association non validee -> 403", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  const assoEnAttente = await inscrireAssociationTemporaire({ approuvee: false });
  const signalement = await creerSignalementTemporaire(citoyen.id);
  try {
    const prise = await api("POST", `/api/signalement/${signalement.id}/prendre-en-charge`, {
      token: assoEnAttente.token,
      body: {},
    });
    assert.equal(prise.status, 403);
    assert.match(prise.json.erreur, /validée par un administrateur/);

    const statut = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: assoEnAttente.token,
      body: { statut: "resolu" },
    });
    assert.equal(statut.status, 403);

    // le signalement est intact
    const { rows } = await pool.query("SELECT statut, association_id FROM signalement WHERE id = $1", [signalement.id]);
    assert.equal(rows[0].statut, "recu");
    assert.equal(rows[0].association_id, null);
  } finally {
    await supprimerSignalement(signalement.id);
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(assoEnAttente.id);
  }
});

// US06 : /api/signalement/mes ne renvoie que les signalements de l'appelant
test("suivi citoyen : /mes isole les proprietaires", async () => {
  const citoyenA = await inscrireCitoyenTemporaire();
  const citoyenB = await inscrireCitoyenTemporaire();
  const signalement = await creerSignalementTemporaire(citoyenA.id);
  try {
    const mesA = await api("GET", "/api/signalement/mes", { token: citoyenA.token });
    assert.equal(mesA.status, 200);
    assert.ok(mesA.json.some((s) => s.id === signalement.id));

    const mesB = await api("GET", "/api/signalement/mes", { token: citoyenB.token });
    assert.equal(mesB.status, 200);
    assert.ok(!mesB.json.some((s) => s.id === signalement.id), "le citoyen B ne voit pas les signalements du citoyen A");

    // sans token -> 401
    const sansToken = await api("GET", "/api/signalement/mes");
    assert.equal(sansToken.status, 401);

    // signalement anonyme : le proprietaire le voit quand meme (c'est le sien)
    const anonyme = await creerSignalementTemporaire(citoyenA.id, { est_anonyme: true });
    const mesAnonyme = await api("GET", "/api/signalement/mes", { token: citoyenA.token });
    assert.ok(mesAnonyme.json.some((s) => s.id === anonyme.id));
    await supprimerSignalement(anonyme.id);
  } finally {
    await supprimerSignalement(signalement.id);
    await supprimerUtilisateur(citoyenA.id);
    await supprimerUtilisateur(citoyenB.id);
  }
});

// UX du serveur : signalement inexistant -> 404 sur les deux actions
test("prise en charge : signalement inexistant -> 404", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const prise = await api("POST", "/api/signalement/999999/prendre-en-charge", {
      token: asso.token,
      body: {},
    });
    assert.equal(prise.status, 404);

    const statut = await api("PATCH", "/api/signalement/999999/statut", {
      token: asso.token,
      body: { statut: "resolu" },
    });
    assert.equal(statut.status, 404);
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

// US33 : un signalement resolu peut être rouvert par le responsable
// (la situation n'est finalement pas reglee), journalise et visible publiquement.
test("US33 : reouverture resolu -> en_cours + historique", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  const autreAsso = await inscrireAssociationTemporaire({ approuvee: true });
  const signalement = await creerSignalementViaApi(citoyen.token, "Depot sauvage recurrent");
  try {
    const prise = await api("POST", `/api/signalement/${signalement.id}/prendre-en-charge`, {
      token: asso.token,
      body: {},
    });
    assert.equal(prise.status, 201, prise.texte);

    const resolution = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: asso.token,
      body: { statut: "resolu" },
    });
    assert.equal(resolution.status, 200);

    // une autre association ne peut pas rouvrir a notre place
    const reouvertureInterdite = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: autreAsso.token,
      body: { statut: "en_cours" },
    });
    assert.equal(reouvertureInterdite.status, 403);

    // le responsable rouvre : date de resolution effacee, statut en_cours
    const reouverture = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: asso.token,
      body: { statut: "en_cours" },
    });
    assert.equal(reouverture.status, 200, reouverture.texte);
    assert.equal(reouverture.json.signalement.statut, "en_cours");
    assert.equal(reouverture.json.signalement.date_resolution, null);

    // deja en cours : second passage refuse
    const doubleReouverture = await api("PATCH", `/api/signalement/${signalement.id}/statut`, {
      token: asso.token,
      body: { statut: "en_cours" },
    });
    assert.equal(doubleReouverture.status, 409);

    // journal et visibilite publique synchronises
    const detailPublic = await api("GET", `/api/signalement/public/${signalement.id}`);
    assert.equal(detailPublic.json.statut, "en_cours");
    assert.deepEqual(
      detailPublic.json.historique.map((h) => h.statut),
      ["recu", "en_cours", "resolu", "en_cours"]
    );

    const disponibles = await api("GET", "/api/signalement/public?statut=en_cours");
    assert.ok(disponibles.json.some((s) => s.id === signalement.id));
  } finally {
    await supprimerSignalement(signalement.id);
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(asso.id);
    await supprimerUtilisateur(autreAsso.id);
  }
});

// US07 : la consultation association/admin ne doit exposer aucune identite
// de citoyen, anonyme ou non.
test("US07 : citoyen_id absent des reponses association/admin", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  const asso = await inscrireAssociationTemporaire({ approuvee: false });
  const signalement = await creerSignalementViaApi(citoyen.token, "Banc casse au parc");
  try {
    const liste = await api("GET", "/api/signalement", { token: asso.token });
    assert.equal(liste.status, 200);
    for (const s of liste.json) {
      assert.ok(!Object.hasOwn(s, "citoyen_id"), "la liste US07 ne doit pas exposer citoyen_id");
    }

    const detail = await api("GET", `/api/signalement/${signalement.id}`, { token: asso.token });
    assert.equal(detail.status, 200);
    assert.ok(!Object.hasOwn(detail.json, "citoyen_id"));
  } finally {
    await supprimerSignalement(signalement.id);
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(asso.id);
  }
});

// ---------------------------------------------------------------------------
// Corrections d'audit : roles, cycle de vie des campagnes, coordonnees,
// validation d'inscription, donnees publiques, upload et telechargement.
// ---------------------------------------------------------------------------

const creerCampagnePassee = async (asso) => {
  const campagne = await api("POST", "/api/campagnes", {
    token: asso.token,
    body: campagneValide(),
  });
  assert.equal(campagne.status, 201, campagne.texte);
  await pool.query(
    "UPDATE campagnes SET date_debut = CURRENT_DATE - 10, date_fin = CURRENT_DATE - 1 WHERE id = $1",
    [campagne.json.campagne.id]
  );
  return campagne.json.campagne.id;
};

test("signalement : une association ne peut pas en creer (403, aucune ligne)", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  const avant = await pool.query("SELECT count(*)::int AS n FROM signalement");
  try {
    const form = new FormData();
    form.append("description", "Faux signalement cree par une association");
    const reponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${asso.token}` },
      body: form,
    });
    assert.equal(reponse.status, 403);
    const json = await reponse.json();
    assert.ok(json.erreur);

    const apres = await pool.query("SELECT count(*)::int AS n FROM signalement");
    assert.equal(apres.rows[0].n, avant.rows[0].n);
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("signalement : coordonnees invalides refusees, valides acceptees", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const casInvalides = [
      ["NaN", "10.1815"],
      ["abc", "10.1815"],
      ["91", "10.1815"],
      ["36.8065", "181"],
    ];
    for (const [latitude, longitude] of casInvalides) {
      const form = new FormData();
      form.append("titre", "Coordonnees invalides");
      form.append("description", "Coordonnees invalides");
      form.append("latitude", latitude);
      form.append("longitude", longitude);
      const reponse = await fetch(`${baseUrl}/api/reports`, {
        method: "POST",
        headers: { Authorization: `Bearer ${citoyen.token}` },
        body: form,
      });
      assert.equal(reponse.status, 400, `lat=${latitude} lon=${longitude}`);
      const json = await reponse.json();
      assert.match(json.erreur, /invalide/i);
    }

    const form = new FormData();
    form.append("titre", "Coordonnees valides");
    form.append("description", "Coordonnees valides");
    form.append("latitude", "36.8065");
    form.append("longitude", "10.1815");
    const ok = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${citoyen.token}` },
      body: form,
    });
    assert.equal(ok.status, 201);
    const json = await ok.json();
    assert.equal(Number(json.signalement.latitude), 36.8065);
    assert.equal(Number(json.signalement.longitude), 10.1815);
    await supprimerSignalement(json.signalement.id);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

test("don : campagne terminee -> 400, aucun don ni montant collecte", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const campagneId = await creerCampagnePassee(asso);
    const avantDons = await pool.query("SELECT count(*)::int AS n FROM dons WHERE campagne_id = $1", [campagneId]);

    const { status, json } = await api("POST", `/api/campagnes/${campagneId}/don`, {
      body: { montant: 50, est_anonyme: true },
    });
    assert.equal(status, 400);
    assert.match(json.erreur, /terminée/i);

    const apresDons = await pool.query("SELECT count(*)::int AS n FROM dons WHERE campagne_id = $1", [campagneId]);
    assert.equal(apresDons.rows[0].n, avantDons.rows[0].n);

    const campagne = await pool.query("SELECT montant_collecte::float8 AS m FROM campagnes WHERE id = $1", [campagneId]);
    assert.equal(campagne.rows[0].m, 0);
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("utilisation : campagne terminee -> 400, aucune ligne creee", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const campagneId = await creerCampagnePassee(asso);
    const avant = await pool.query("SELECT count(*)::int AS n FROM utilisation_fonds WHERE campagne_id = $1", [campagneId]);

    const { status, json } = await api("POST", `/api/campagnes/${campagneId}/utilisation`, {
      token: asso.token,
      body: { libelle: "Frais de transport", montant: 10 },
    });
    assert.equal(status, 400);
    assert.match(json.erreur, /terminée/i);

    const apres = await pool.query("SELECT count(*)::int AS n FROM utilisation_fonds WHERE campagne_id = $1", [campagneId]);
    assert.equal(apres.rows[0].n, avant.rows[0].n);
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("campagnes/associations : aucune donnee de contact privee", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  try {
    const { status, json } = await api("GET", "/api/campagnes/associations");
    assert.equal(status, 200);
    assert.ok(json.some((a) => a.id === asso.id), "l'association doit rester listee");
    for (const a of json) {
      assert.ok(!Object.hasOwn(a, "email"), "email ne doit pas etre expose");
      assert.ok(!Object.hasOwn(a, "telephone"), "telephone ne doit pas etre expose");
      assert.ok(!Object.hasOwn(a, "nom_contact"), "nom du responsable ne doit pas etre expose");
    }
  } finally {
    await supprimerUtilisateur(asso.id);
  }
});

test("documents : le token en query string n'est plus accepte (401)", async () => {
  const token = jwt.sign({ id: 999999, role: "admin" }, process.env.JWT_SECRET);
  const { status, json } = await api(
    "GET",
    `/api/documents/1/file?token=${encodeURIComponent(token)}`
  );
  assert.equal(status, 401);
  assert.ok(json.erreur);
});

test("inscription : validation serveur du prenom, du telephone et du mot de passe", async () => {
  const base = {
    nom: "Valide",
    email: emailTemporaire("validation"),
    telephone: "01234567",
    prenom: "Jean",
    motDePasse: "Secret123!",
    role: "citoyen",
  };

  const sansPrenom = await api("POST", "/api/auth/inscription", {
    body: { ...base, prenom: undefined },
  });
  assert.equal(sansPrenom.status, 400);
  assert.match(sansPrenom.json.erreur, /prénom/i);

  const sansTelephone = await api("POST", "/api/auth/inscription", {
    body: { ...base, telephone: undefined },
  });
  assert.equal(sansTelephone.status, 400);
  assert.match(sansTelephone.json.erreur, /téléphone/i);

  const motDePasseCourt = await api("POST", "/api/auth/inscription", {
    body: { ...base, motDePasse: "123" },
  });
  assert.equal(motDePasseCourt.status, 400);
  assert.match(motDePasseCourt.json.erreur, /6 caractères/i);

  const emailInvalide = await api("POST", "/api/auth/inscription", {
    body: { ...base, email: "pas-un-email" },
  });
  assert.equal(emailInvalide.status, 400);
  assert.match(emailInvalide.json.erreur, /email/i);
});

test("inscription : email deja pris, insensible a la casse -> 400", async () => {
  const email = emailTemporaire("casse");
  const premier = await api("POST", "/api/auth/inscription", {
    body: {
      nom: "Doublon",
      prenom: "Jean",
      telephone: "01234567",
      email,
      motDePasse: "Secret123!",
      role: "citoyen",
    },
  });
  assert.equal(premier.status, 201, premier.texte);
  try {
    const second = await api("POST", "/api/auth/inscription", {
      body: {
        nom: "Doublon",
        prenom: "Jean",
        telephone: "01234567",
        email: email.toUpperCase(),
        motDePasse: "Secret123!",
        role: "citoyen",
      },
    });
    assert.equal(second.status, 400);
    assert.match(second.json.erreur, /déjà utilisé/i);
  } finally {
    await supprimerUtilisateur(premier.json.utilisateur.id);
  }
});

test("upload : contenu non conforme a l'extension -> 400 et fichier supprime", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const form = new FormData();
    form.append("description", "Photo falsifiee");
    form.append(
      "photo",
      new Blob(["#!/bin/sh\necho pirate"], { type: "image/jpeg" }),
      "faux.jpg"
    );
    const reponse = await fetch(`${baseUrl}/api/reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${citoyen.token}` },
      body: form,
    });
    assert.equal(reponse.status, 400);
    const json = await reponse.json();
    assert.match(json.erreur, /Contenu de fichier invalide/);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

// ---------------------------------------------------------------------------
// US38 : filtres combines sur les quatre listes publiques.
// ---------------------------------------------------------------------------

test("US38 campagnes : filtres combines returns tableau + X-Total-Count", async () => {
  const { status, json, headers } = await api(
    "GET",
    "/api/campagnes?statut=all&ville=Tunis&categorie=Social&search=aide&page=1&limit=5"
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.ok(headers.get("X-Total-Count") !== null);
});

test("US38 campagnes : categorie inconnue en lecture -> 200 et liste vide", async () => {
  const { status, json } = await api("GET", "/api/campagnes?statut=all&categorie=Inexistante");
  assert.equal(status, 200);
  assert.deepEqual(json, []);
});

test("US38 campagnes : date invalide -> 400", async () => {
  const { status } = await api("GET", "/api/campagnes?date_debut=2026-99-99");
  assert.equal(status, 400);
});

test("US38 associations publiques : filtres ville/categorie/recherche", async () => {
  const { status, json } = await api(
    "GET",
    "/api/associations/liste?ville=Tunis&categorie=Social&search=espoir"
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.ok(json.every((a) => !("telephone" in a)), "aucun telephone ne doit fuir");
});

test("US38 signalements publics : filtres combines + pagination", async () => {
  const { status, json, headers } = await api(
    "GET",
    "/api/signalement/public?categorie=Environnement&ville=Tunis&date_debut=2020-01-01&page=1&limit=10"
  );
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.ok(headers.get("X-Total-Count") !== null);
});

test("US38 signalements publics : categorie inconnue -> 200 et liste vide", async () => {
  const { status, json } = await api("GET", "/api/signalement/public?categorie=Inexistante");
  assert.equal(status, 200);
  assert.deepEqual(json, []);
});

test("US38 signalements publics : statut invalide reste refuse (400)", async () => {
  const { status } = await api("GET", "/api/signalement/public?statut=nimportequoi");
  assert.equal(status, 400);
});

// ---------------------------------------------------------------------------
// US37 : journal d'activite prive.
// ---------------------------------------------------------------------------

test("US37 : /api/activites/mes exige une session (401)", async () => {
  const { status } = await api("GET", "/api/activites/mes");
  assert.equal(status, 401);
});

test("US37 : /api/activites/mes renvoie un tableau pagine pour le JWT", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const { status, json, headers } = await api("GET", "/api/activites/mes?page=1&limit=5", {
      token: citoyen.token,
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json));
    assert.ok(headers.get("X-Total-Count") !== null);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

// ---------------------------------------------------------------------------
// US24 : points d'engagement et badges (regles serveur, ecritures
// transactionnelles, idempotence, plafond journalier et revocation).
// ---------------------------------------------------------------------------

test("US24 : /api/engagement/moi exige une session (401)", async () => {
  const { status } = await api("GET", "/api/engagement/moi");
  assert.equal(status, 401);
});

test("US24 : /api/engagement/moi renvoie solde/actions/badges pour le JWT", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const { status, json } = await api("GET", "/api/engagement/moi", {
      token: citoyen.token,
    });
    assert.equal(status, 200);
    assert.equal(json.solde, 0);
    assert.equal(json.actions, 0);
    assert.ok(Array.isArray(json.badges));
    assert.ok(Array.isArray(json.badges_restants));
    assert.ok(json.badges_restants.length >= 6, "le catalog de 6 badges doit etre present");
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US24 : un don donne 10 points, un seul point par activite, et ignore les points du client", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const campagne = await api("POST", "/api/campagnes", {
      token: asso.token,
      body: campagneValide(),
    });
    assert.equal(campagne.status, 201, campagne.texte);
    const campagneId = campagne.json.campagne.id;

    const don = await api("POST", `/api/campagnes/${campagneId}/don`, {
      token: citoyen.token,
      body: { montant: 25, est_anonyme: false, points: 9999 },
    });
    assert.equal(don.status, 201, don.texte);

    const { rows: activites } = await pool.query(
      "SELECT id FROM activite WHERE utilisateur_id = $1 AND type = 'don'",
      [citoyen.id]
    );
    assert.equal(activites.length, 1, "une seule activite de don");

    const { rows: points } = await pool.query(
      "SELECT points FROM point_engagement WHERE activite_id = $1",
      [activites[0].id]
    );
    assert.equal(points.length, 1, "une seule ligne de point par activite");
    assert.equal(points[0].points, 10, "les points du client (9999) doivent etre ignores");

    const { json } = await api("GET", "/api/engagement/moi", { token: citoyen.token });
    assert.equal(json.solde, 10);
    assert.equal(json.actions, 1);
    assert.ok(json.badges.some((b) => b.code === "premier_pas"), "premier badge debloque");
  } finally {
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(asso.id);
  }
});

test("US24 : idempotence — reenregistrer la meme source ne cree pas de second point", async () => {
  const engagementService = require("../engagement/engagement.service");
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const refId = 900000 + Math.floor(Math.random() * 100000);
    const sql = `INSERT INTO activite (utilisateur_id, type, ref_table, ref_id, libelle)
                 VALUES ($1, 'don_nature_collecte', 'dons_nature_test', $2, 'Don nature test')
                 ON CONFLICT (type, ref_table, ref_id) DO NOTHING
                 RETURNING id, utilisateur_id, type`;
    const premier = await pool.query(sql, [citoyen.id, refId]);
    assert.equal(premier.rows.length, 1);
    await engagementService.attribuerPoints(null, premier.rows[0]);

    // Meme source -> l'activite est ignoree (UNIQUE), aucun second point.
    const second = await pool.query(sql, [citoyen.id, refId]);
    assert.equal(second.rows.length, 0);
    if (second.rows[0]) await engagementService.attribuerPoints(null, second.rows[0]);

    const { rows } = await pool.query(
      "SELECT points FROM point_engagement WHERE utilisateur_id = $1",
      [citoyen.id]
    );
    assert.equal(rows.length, 1, "un seul point malgre le double enregistrement");
    assert.equal(rows[0].points, 15);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US24 : plafond quotidien — un seul signalement pointe par jour", async () => {
  const engagementService = require("../engagement/engagement.service");
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    // ref_id est un INTEGER : rester sous 2^31 (Date.now() est en millisecondes).
    const base = 1_000_000_000 + Math.floor(Math.random() * 100_000_000);
    const creer = async (offset) => {
      const { rows } = await pool.query(
        `INSERT INTO activite (utilisateur_id, type, ref_table, ref_id, libelle)
         VALUES ($1, 'signalement', 'signalement_test', $2, 'Signalement test')
         RETURNING id, utilisateur_id, type`,
        [citoyen.id, base + offset]
      );
      await engagementService.attribuerPoints(null, rows[0]);
    };
    await creer(0);
    await creer(1);

    const { rows } = await pool.query(
      "SELECT points FROM point_engagement WHERE utilisateur_id = $1 ORDER BY id",
      [citoyen.id]
    );
    assert.equal(rows.length, 2, "une ligne de point par activite");
    assert.equal(rows[0].points, 5, "premier signalement : 5 points");
    assert.equal(rows[1].points, 0, "deuxieme signalement le meme jour : plafond atteint");

    const { json } = await api("GET", "/api/engagement/moi", { token: citoyen.token });
    assert.equal(json.solde, 5);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US24 : revoquerPourSource retire points, activite et badge non merite", async () => {
  const engagementService = require("../engagement/engagement.service");
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const refId = 800000 + Math.floor(Math.random() * 100000);
    const { rows } = await pool.query(
      `INSERT INTO activite (utilisateur_id, type, ref_table, ref_id, libelle)
       VALUES ($1, 'inscription_evenement_acceptee', 'inscriptions_evenements', $2, 'Inscription test')
       RETURNING id, utilisateur_id, type`,
      [citoyen.id, refId]
    );
    await engagementService.attribuerPoints(null, rows[0]);

    let { json } = await api("GET", "/api/engagement/moi", { token: citoyen.token });
    assert.equal(json.solde, 20);
    assert.ok(json.badges.some((b) => b.code === "premier_pas"));

    // L'inscription est refusee -> revoquer points + activite + badges.
    await engagementService.revoquerPourSource(null, "inscriptions_evenements", refId);

    json = (await api("GET", "/api/engagement/moi", { token: citoyen.token })).json;
    assert.equal(json.solde, 0);
    assert.equal(json.actions, 0);
    assert.ok(!json.badges.some((b) => b.code === "premier_pas"), "le badge doit etre retire");

    const { rows: acts } = await pool.query(
      "SELECT id FROM activite WHERE ref_table = 'inscriptions_evenements' AND ref_id = $1",
      [refId]
    );
    assert.equal(acts.length, 0, "l'activite doit etre supprimee");
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

// ---------------------------------------------------------------------------
// US26 : defis — catalog, autorisations, idempotence, completion auto/manuelle.
// ---------------------------------------------------------------------------

const tokenAdmin = () => jwt.sign({ id: 999999, role: "admin" }, process.env.JWT_SECRET);

const creerDefi = async (data, token = tokenAdmin()) => {
  const r = await api("POST", "/api/defis", { token, body: data });
  assert.equal(r.status, 201, r.texte);
  return r.json;
};

test("US26 : le catalog des defis est public (200, tableau)", async () => {
  const { status, json } = await api("GET", "/api/defis");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
});

test("US26 : creation reservee aux admins (citoyen 403, admin 201)", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  let defiId;
  try {
    const refuse = await api("POST", "/api/defis", {
      token: citoyen.token,
      body: { titre: "Defi interdit", mode: "automatique", type_activite: "don", objectif: 1 },
    });
    assert.equal(refuse.status, 403);

    const ok = await api("POST", "/api/defis", {
      token: tokenAdmin(),
      body: { titre: "Defi admin", mode: "automatique", type_activite: "don", objectif: 1, recompense_points: 5 },
    });
    assert.equal(ok.status, 201, ok.texte);
    defiId = ok.json.id;
  } finally {
    if (defiId) await pool.query("DELETE FROM defi WHERE id = $1", [defiId]);
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US26 : rejoindre un defi est idempotent (une seule participation)", async () => {
  const defi = await creerDefi({
    titre: "Defi idempotence", mode: "manuelle", objectif: 1, recompense_points: 5,
  });
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const r1 = await api("POST", `/api/defis/${defi.id}/rejoindre`, { token: citoyen.token, body: {} });
    assert.equal(r1.status, 201, r1.texte);
    const r2 = await api("POST", `/api/defis/${defi.id}/rejoindre`, { token: citoyen.token, body: {} });
    assert.equal(r2.status, 201, r2.texte);
    assert.equal(r1.json.id, r2.json.id, "la meme participation doit etre renvoyee");

    const { rows } = await pool.query(
      "SELECT id FROM defi_participation WHERE defi_id = $1 AND utilisateur_id = $2",
      [defi.id, citoyen.id]
    );
    assert.equal(rows.length, 1, "une seule ligne de participation");
  } finally {
    await pool.query("DELETE FROM defi WHERE id = $1", [defi.id]);
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US26 : un defi automatique se complete et attribue sa recompense", async () => {
  const activitesService = require("../activites/activites.service");
  const defi = await creerDefi({
    titre: "Defi auto don", mode: "automatique", type_activite: "don",
    objectif: 1, recompense_points: 50,
  });
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const j = await api("POST", `/api/defis/${defi.id}/rejoindre`, { token: citoyen.token, body: {} });
    assert.equal(j.status, 201, j.texte);
    assert.equal(j.json.statut, "en_cours");

    // Une activite 'don' declenche la progression (hook transactionnel).
    const refId = 700000 + Math.floor(Math.random() * 100000);
    await activitesService.enregistrerActivite(null, {
      utilisateurId: citoyen.id,
      type: "don",
      refTable: "dons_test",
      refId,
      libelle: "Don test",
    });

    const { json: mes } = await api("GET", "/api/defis/mes", { token: citoyen.token });
    const participation = mes.find((p) => p.defi_id === defi.id);
    assert.ok(participation, "la participation doit etre presente");
    assert.equal(participation.statut, "complete", "le defi doit etre complete");
    assert.equal(participation.progression, 1);

    const { json: eng } = await api("GET", "/api/engagement/moi", { token: citoyen.token });
    assert.equal(eng.solde, 60, "10 points du don + 50 points de recompense");
  } finally {
    await pool.query("DELETE FROM defi WHERE id = $1", [defi.id]);
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US26 : preuve photo obligatoire puis validation admin (mode manuel)", async () => {
  const defisService = require("../defis/defis.service");
  const defi = await creerDefi({
    titre: "Defi manuel photo", mode: "manuelle", objectif: 1, recompense_points: 30,
  });
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const j = await api("POST", `/api/defis/${defi.id}/rejoindre`, { token: citoyen.token, body: {} });
    assert.equal(j.status, 201, j.texte);

    // Sans fichier joint -> 400 (aucune photo de preuve).
    const sansPhoto = await api("POST", `/api/defis/${defi.id}/preuve`, {
      token: citoyen.token, body: { commentaire: "sans photo" },
    });
    assert.equal(sansPhoto.status, 400);

    // Soumission via le service (multer n'est pas exerce par le helper JSON).
    const participation = await defisService.soumettrePreuve(
      defi.id, citoyen.id, { filename: "preuve.jpg" }, "Ma preuve"
    );
    assert.equal(participation.statut, "en_attente");

    // Un citoyen ne peut pas valider une preuve (admin seulement).
    const refuseValidation = await api(
      "PATCH", `/api/defis/participations/${participation.id}/validation`,
      { token: citoyen.token, body: { accepte: true } }
    );
    assert.equal(refuseValidation.status, 403);

    const validee = await api(
      "PATCH", `/api/defis/participations/${participation.id}/validation`,
      { token: tokenAdmin(), body: { accepte: true } }
    );
    assert.equal(validee.status, 200, validee.texte);
    assert.equal(validee.json.statut, "complete");

    const { json: eng } = await api("GET", "/api/engagement/moi", { token: citoyen.token });
    assert.equal(eng.solde, 30, "recompense du defi manuel");
  } finally {
    await pool.query("DELETE FROM defi WHERE id = $1", [defi.id]);
    await supprimerUtilisateur(citoyen.id);
  }
});

// ---------------------------------------------------------------------------
// US19 : partage d'evenements (page OG/Twitter, 404 hors ligne, visibilite).
// ---------------------------------------------------------------------------

const creerEvenement = async (token, overrides = {}) => {
  const r = await api("POST", "/api/evenements", {
    token,
    body: {
      titre: "Evenement partage test",
      description: "Evenement de test pour le partage",
      date_evenement: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      lieu: "Tunis",
      ville: "Tunis",
      places_disponibles: 10,
      ...overrides,
    },
  });
  assert.equal(r.status, 201, r.texte);
  return r.json;
};

test("US19 : page de partage d'un evenement publie -> 200 avec balises OG/Twitter", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  let eventId;
  try {
    const evenement = await creerEvenement(asso.token);
    eventId = evenement.id;

    const { status, texte, headers } = await api("GET", `/evenements/${eventId}/partage`);
    assert.equal(status, 200);
    assert.match(headers.get("content-type") || "", /text\/html/);
    assert.match(texte, /og:title/);
    assert.match(texte, /og:image/);
    assert.match(texte, /og:url/);
    assert.match(texte, /twitter:card/);
    assert.match(texte, /Evenement partage test/);
  } finally {
    if (eventId) await pool.query("DELETE FROM evenements WHERE id = $1", [eventId]);
    await supprimerUtilisateur(asso.id);
  }
});

test("US19 : page de partage -> 404 pour un evenement inexistant", async () => {
  const { status } = await api("GET", "/evenements/999999999/partage");
  assert.equal(status, 404);
});

test("US19 : un evenement annule n'est ni partageable ni visible par un anonyme", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  let eventId;
  try {
    const evenement = await creerEvenement(asso.token);
    eventId = evenement.id;

    const changement = await api("PATCH", `/api/evenements/${eventId}/statut`, {
      token: asso.token, body: { statut: "annule" },
    });
    assert.equal(changement.status, 200, changement.texte);

    const partage = await api("GET", `/evenements/${eventId}/partage`);
    assert.equal(partage.status, 404, "un evenement annule n'a pas de page de partage");

    const detail = await api("GET", `/api/evenements/${eventId}`);
    assert.equal(detail.status, 404, "un visiteur anonyme ne voit pas un evenement annule");
  } finally {
    if (eventId) await pool.query("DELETE FROM evenements WHERE id = $1", [eventId]);
    await supprimerUtilisateur(asso.id);
  }
});

// ---------------------------------------------------------------------------
// US30 / US31 / US32 : signalement et moderation d'un CONTENU abusif.
// ---------------------------------------------------------------------------

test("US30 : signaler un contenu abusif -> 201, doublon 409, liste admin reservee", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  const citoyen = await inscrireCitoyenTemporaire();
  let evenementId;

  try {
    const evenement = await creerEvenement(asso.token);
    evenementId = evenement.id;

    const signalement = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: {
        type_cible: "evenement",
        cible_id: evenementId,
        motif: "spam",
        description: "Evenement publicitaire",
      },
    });
    assert.equal(signalement.status, 201, signalement.texte);
    assert.equal(signalement.json.signalement.type_cible, "evenement");
    assert.equal(signalement.json.signalement.cible_id, evenementId);
    assert.equal(signalement.json.signalement.statut, "recu");
    assert.equal(signalement.json.signalement.titre_cible, "Evenement partage test");

    const doublon = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: { type_cible: "evenement", cible_id: evenementId, motif: "spam" },
    });
    assert.equal(doublon.status, 409, "un doublon ouvert doit etre refuse");

    const mesSignalements = await api("GET", "/api/signalements-abuse/mes", {
      token: citoyen.token,
    });
    assert.equal(mesSignalements.status, 200);
    assert.equal(mesSignalements.json.total, 1);

    const interdit = await api("GET", "/api/admin/signalements-abuse", {
      token: citoyen.token,
    });
    assert.equal(interdit.status, 403, "la file admin n'est pas publique");
  } finally {
    if (evenementId) await pool.query("DELETE FROM evenements WHERE id = $1", [evenementId]);
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(asso.id);
  }
});

test("US30 : motif invalide -> 400 et cible inexistante -> 404", async () => {
  const citoyen = await inscrireCitoyenTemporaire();
  try {
    const mauvaisMotif = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: { type_cible: "campagne", cible_id: 1, motif: "inconnu" },
    });
    assert.equal(mauvaisMotif.status, 400);

    const cibleAbsente = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: { type_cible: "campagne", cible_id: 999999999, motif: "fraude" },
    });
    assert.equal(cibleAbsente.status, 404);
  } finally {
    await supprimerUtilisateur(citoyen.id);
  }
});

test("US31/US32 : l'admin instruit le signalement puis supprime le contenu abusif", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  const citoyen = await inscrireCitoyenTemporaire();
  let evenementId;
  let abuseId;

  try {
    const evenement = await creerEvenement(asso.token);
    evenementId = evenement.id;

    const cree = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: { type_cible: "evenement", cible_id: evenementId, motif: "fraude" },
    });
    assert.equal(cree.status, 201, cree.texte);
    abuseId = cree.json.signalement.id;

    const file = await api("GET", "/api/admin/signalements-abuse?statut=recu", {
      token: tokenAdmin(),
    });
    assert.equal(file.status, 200, file.texte);
    assert.ok(
      file.json.signalements.some((s) => s.id === abuseId),
      "le signalement doit apparaitre dans la file admin"
    );

    const detail = await api("GET", `/api/admin/signalements-abuse/${abuseId}`, {
      token: tokenAdmin(),
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.signalant_email, citoyen.email);

    const enCours = await api("PATCH", `/api/admin/signalements-abuse/${abuseId}/statut`, {
      token: tokenAdmin(),
      body: { statut: "en_cours", decision: "Vérification en cours" },
    });
    assert.equal(enCours.status, 200, enCours.texte);
    assert.equal(enCours.json.signalement.statut, "en_cours");

    const suppression = await api("DELETE", `/api/admin/signalements-abuse/${abuseId}/contenu`, {
      token: tokenAdmin(),
    });
    assert.equal(suppression.status, 200, suppression.texte);
    assert.equal(suppression.json.signalement.statut, "resolu");
    assert.equal(suppression.json.signalement.contenu_supprime, true);

    const contenuRestant = await pool.query("SELECT id FROM evenements WHERE id = $1", [
      evenementId,
    ]);
    assert.equal(contenuRestant.rows.length, 0, "le contenu abusif doit etre supprime");
    evenementId = undefined;

    const apres = await api("GET", `/api/admin/signalements-abuse/${abuseId}`, {
      token: tokenAdmin(),
    });
    assert.equal(apres.json.statut, "resolu");
    assert.match(apres.json.decision, /supprimé/);
  } finally {
    if (evenementId) await pool.query("DELETE FROM evenements WHERE id = $1", [evenementId]);
    if (abuseId) await pool.query("DELETE FROM signalement_abuse WHERE id = $1", [abuseId]);
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(asso.id);
  }
});

test("US30/US31/US32 : un signalement rejete peut etre rouvert, puis la campagne supprimee", async () => {
  const asso = await inscrireAssociationTemporaire({ approuvee: true });
  const citoyen = await inscrireCitoyenTemporaire();
  let campagneId;
  const abuseIds = [];

  try {
    const campagne = await api("POST", "/api/campagnes", {
      token: asso.token,
      body: campagneValide(),
    });
    assert.equal(campagne.status, 201, campagne.texte);
    campagneId = campagne.json.campagne.id;

    const premier = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: { type_cible: "campagne", cible_id: campagneId, motif: "fraude" },
    });
    assert.equal(premier.status, 201, premier.texte);
    abuseIds.push(premier.json.signalement.id);

    const rejet = await api("PATCH", `/api/admin/signalements-abuse/${abuseIds[0]}/statut`, {
      token: tokenAdmin(),
      body: { statut: "rejete", decision: "Campagne conforme" },
    });
    assert.equal(rejet.status, 200, rejet.texte);

    const second = await api("POST", "/api/signalements-abuse", {
      token: citoyen.token,
      body: {
        type_cible: "campagne",
        cible_id: campagneId,
        motif: "contenu_inapproprie",
        description: "Nouveaux elements",
      },
    });
    assert.equal(second.status, 201, "un dossier close doit pouvoir etre signale a nouveau");
    abuseIds.push(second.json.signalement.id);

    const refusSuppression = await api(
      "DELETE",
      `/api/admin/signalements-abuse/${abuseIds[0]}/contenu`,
      { token: tokenAdmin() }
    );
    assert.equal(refusSuppression.status, 400, "un signalement rejete ne peut pas supprimer le contenu");

    const suppression = await api(
      "DELETE",
      `/api/admin/signalements-abuse/${abuseIds[1]}/contenu`,
      { token: tokenAdmin() }
    );
    assert.equal(suppression.status, 200, suppression.texte);

    const restant = await pool.query("SELECT id FROM campagnes WHERE id = $1", [campagneId]);
    assert.equal(restant.rows.length, 0);
    campagneId = undefined;
  } finally {
    if (campagneId) await pool.query("DELETE FROM campagnes WHERE id = $1", [campagneId]);
    for (const id of abuseIds) {
      await pool.query("DELETE FROM signalement_abuse WHERE id = $1", [id]);
    }
    await supprimerUtilisateur(citoyen.id);
    await supprimerUtilisateur(asso.id);
  }
});
