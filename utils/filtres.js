// Construction de filtres SQL reutilisable par les differentes listes (US38,
// US37). Le but est d'eviter quatre implementations divergentes du couple
// "lecture de req.query / construction du WHERE".
const { echec } = require("./http");

const estVide = (valeur) =>
  valeur === undefined || valeur === null || String(valeur).trim() === "";

const nettoyer = (valeur) => (estVide(valeur) ? null : String(valeur).trim());

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const validerDate = (valeur, libelle) => {
  const date = nettoyer(valeur);
  if (!date) return null;
  if (!DATE_ISO.test(date) || Number.isNaN(Date.parse(date))) {
    throw echec(400, `${libelle} invalide : le format attendu est AAAA-MM-JJ.`);
  }
  return date;
};

// La pagination n'est ajoutee a la requete que si le client l'a demandee :
// les listes historiques (ex. evenements) continuent a renvoyer tous les
// resultats lorsqu'aucun parametre n'est fourni.
const lirePagination = (query = {}) => {
  const actif = query.page !== undefined || query.limit !== undefined;
  let page = 1;
  let limit = 20;

  if (query.page !== undefined) {
    page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      throw echec(400, "Le parametre page doit etre un entier positif.");
    }
  }
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw echec(400, "Le parametre limit doit etre un entier entre 1 et 100.");
    }
  }

  return { actif, page, limit, offset: (page - 1) * limit };
};

class ConstructeurFiltres {
  constructor() {
    this.parametres = [];
    this.conditions = [];
  }

  _ajouter(motif, valeurs) {
    const debut = this.parametres.length;
    const marqueurs = valeurs.map((_, index) => `$${debut + index + 1}`);
    this.parametres.push(...valeurs);
    let curseur = 0;
    this.conditions.push(motif.replace(/\?/g, () => marqueurs[curseur++]));
    return this;
  }

  exact(colonne, valeur, valeursIgnores = []) {
    const v = nettoyer(valeur);
    if (v === null || valeursIgnores.includes(v)) return this;
    return this._ajouter(`${colonne} = ?`, [v]);
  }

  nombre(colonne, valeur) {
    if (estVide(valeur)) return this;
    const n = Number(valeur);
    if (!Number.isFinite(n)) throw echec(400, `${colonne} doit etre numerique.`);
    return this._ajouter(`${colonne} = ?`, [n]);
  }

  ilike(colonne, valeur) {
    const v = nettoyer(valeur);
    if (v === null) return this;
    return this._ajouter(`${colonne} ILIKE ?`, [`%${v}%`]);
  }

  recherche(colonnes, valeur) {
    const v = nettoyer(valeur);
    if (v === null) return this;
    const colonnesValidees = colonesValides(colonnes);
    const motif = colonnesValidees.map((colonne) => `${colonne} ILIKE ?`).join(" OR ");
    return this._ajouter(`(${motif})`, colonnesValidees.map(() => `%${v}%`));
  }

  dateExacte(colonne, valeur) {
    const date = validerDate(valeur, colonne);
    if (!date) return this;
    return this._ajouter(`DATE(${colonne}) = ?::date`, [date]);
  }

  entre(colonne, debut, fin) {
    const d = validerDate(debut, "date_debut");
    const f = validerDate(fin, "date_fin");
    if (d && f && d > f) {
      throw echec(400, "date_debut ne peut pas etre posterieure a date_fin.");
    }
    if (d) this._ajouter(`${colonne} >= ?::date`, [d]);
    if (f) this._ajouter(`${colonne} < (?::date + INTERVAL '1 day')`, [f]);
    return this;
  }

  brut(motif, valeurs = []) {
    return this._ajouter(motif, valeurs);
  }

  clause() {
    return this.conditions.length ? `WHERE ${this.conditions.join(" AND ")}` : "";
  }
};

const colonesValides = (colonnes) =>
  colonnes.map((colonne) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(colonne)) {
      throw echec(400, "Colonne de filtre invalide.");
    }
    return colonne;
  });

const repondreListe = (res, lignes, total) => {
  if (total !== undefined && total !== null) {
    res.setHeader("X-Total-Count", String(total));
  }
  return res.json(lignes);
};

module.exports = {
  ConstructeurFiltres,
  lirePagination,
  repondreListe,
  estVide,
  nettoyer,
  validerDate,
};
