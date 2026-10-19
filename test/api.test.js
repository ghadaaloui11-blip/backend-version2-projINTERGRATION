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
    body: { nom: "Asso", email, motDePasse: "Secret123!", role: "association" },
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
    body: { nom: "Test", prenom: "Citoyen", email, motDePasse: "Secret123!", role: "citoyen" },
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

test("connexion : mauvais identifiants -> 400", async () => {
  const { status, json } = await api("POST", "/api/auth/connexion", {
    body: { email: "inconnu@test.tn", motDePasse: "mauvais" },
  });
  assert.equal(status, 400);
  assert.ok(json.erreur);
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
