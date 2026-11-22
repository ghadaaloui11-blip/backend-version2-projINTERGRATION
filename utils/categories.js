// Source unique des categories cote backend (decision Q10 / risque R8).
// Les valeurs doivent rester alignees avec la contrainte ck_signalement_categorie.
const CATEGORIES_SIGNALEMENT = Object.freeze([
  'Environnement',
  'Infrastructure',
  'Santé',
  'Éducation',
  'Social',
  'Urgence',
  'Autre',
]);

const CATEGORIES_EVENEMENT = Object.freeze([
  'Distribution alimentaire',
  'Maraude solidaire',
  'Collecte de dons',
  'Aide aux devoirs',
  'Nettoyage écologique',
  'Visite aux personnes isolées',
  'Autre',
]);

const CATEGORIES_CAMPAGNE = Object.freeze([
  'Environnement',
  'Social',
  'Santé',
  'Éducation',
  'Urgence',
  'Autre',
]);

module.exports = { CATEGORIES_SIGNALEMENT, CATEGORIES_EVENEMENT, CATEGORIES_CAMPAGNE };
