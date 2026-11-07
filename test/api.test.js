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
