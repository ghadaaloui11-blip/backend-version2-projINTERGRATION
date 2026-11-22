// US24 : regles d'attribution, uniquement cote serveur. Aucune valeur
// provenant du corps d'une requete ne peut modifier ces chiffres.

// Decision Q1 : seules les actions de don / contribution donnent des points.
const POINTS_PAR_TYPE = Object.freeze({
  don: 10,
  inscription_evenement_acceptee: 20,
  don_nature_collecte: 15,
  benevolat: 10,
  signalement: 5,
  // Une demande d'aide est tracee mais ne rapporte rien (0 point).
  demande_aide: 0,
  // Les points d'un defi sont definis par sa recompense (US26).
  defi_complete: 0,
});

// Decision Q4 : plafond quotidien par type (signalement = 1/jour).
const PLAFONDS_QUOTIDIENS = Object.freeze({ signalement: 1 });

const pointsPour = (type, dejaAujourdhui) => {
  const base = POINTS_PAR_TYPE[type] ?? 0;
  if (base === 0) return 0;
  const plafond = PLAFONDS_QUOTIDIENS[type];
  if (plafond !== undefined && dejaAujourdhui >= plafond) return 0;
  return base;
};

// Decision Q3 : catalog de six badges, evalue sur les actions enregistrees.
const REGLES_BADGES = Object.freeze([
  {
    code: 'premier_pas',
    test: ({ nbActions }) => nbActions >= 1,
  },
  {
    code: 'generieux',
    test: ({ parType }) => (parType.don || 0) >= 3,
  },
  {
    code: 'benevole_engage',
    test: ({ parType }) =>
      (parType.benevolat || 0) >= 1 &&
      (parType.inscription_evenement_acceptee || 0) >= 1,
  },
  {
    code: 'citoyen_vigilant',
    test: ({ parType }) => (parType.signalement || 0) >= 3,
  },
  {
    code: 'pilier',
    test: ({ nbActions }) => nbActions >= 10,
  },
  {
    code: 'legende_solidaire',
    test: ({ nbActions, totalPoints }) => nbActions >= 50 || totalPoints >= 500,
  },
]);

module.exports = { POINTS_PAR_TYPE, PLAFONDS_QUOTIDIENS, pointsPour, REGLES_BADGES };
