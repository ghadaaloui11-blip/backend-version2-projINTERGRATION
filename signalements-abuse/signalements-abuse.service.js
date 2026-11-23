// US30 / US31 / US32 : signalement, instruction et suppression d'un CONTENU
// abusif. Ce module est volontairement distinct de `reports/` : un signalement
// de besoin n'est pas un signalement de contenu.
const pool = require('../config/db');
const { echec } = require('../utils/http');

const TYPES_CIBLES = Object.freeze({
  campagne: { table: 'campagnes', colonneTitre: 'titre', libelle: 'campagne' },
  evenement: { table: 'evenements', colonneTitre: 'titre', libelle: 'événement' },
  signalement: { table: 'signalement', colonneTitre: 'titre', libelle: 'signalement' },
  association: { table: 'association', colonneTitre: 'nom_association', libelle: 'association' },
});

const MOTIFS = Object.freeze([
  'haine',
  'harcelement',
  'fraude',
  'contenu_inapproprie',
  'spam',
  'autre',
]);

const STATUTS = Object.freeze(['recu', 'en_cours', 'resolu', 'rejete']);

const nettoyer = (valeur) =>
  valeur === undefined || valeur === null ? null : String(valeur).trim();

const lireCible = async (executeur, type, id) => {
  const config = TYPES_CIBLES[type];
  if (!config) throw echec(400, 'Type de contenu invalide.');
  const { rows } = await executeur.query(
    `SELECT id, ${config.colonneTitre} AS titre FROM ${config.table} WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

const notifierSansCasser = async ({ userId, titre, message }) => {
  if (!userId) return;
  try {
    const notifications = require('../notifications/notifications.service');
    // Canal "push" = notification visible dans le centre. On evite le canal
    // email :SMTP n'est pas configure en dev et ne doit pas bloquer l'action.
    await notifications.notifier({
      userId,
      type: 'signalement_abuse',
      titre,
      message,
      canaux: ['push'],
    });
  } catch (err) {
    console.error('[signalement_abuse] notification impossible :', err.message);
  }
};

const alerterAdmins = async (titreCible) => {
  try {
    const { rows: admins } = await pool.query("SELECT id FROM utilisateur WHERE role = 'admin'");
    for (const admin of admins) {
      await notifierSansCasser({
        userId: admin.id,
        titre: 'Nouveau contenu signalé',
        message: `Un contenu a été signalé comme abusif : ${titreCible || 'sans titre'}.`,
      });
    }
  } catch (err) {
    console.error('[signalement_abuse] alerte administrateurs impossible :', err.message);
  }
};

exports.TYPES_CIBLES = TYPES_CIBLES;
exports.MOTIFS = MOTIFS;
exports.STATUTS = STATUTS;

// ---------------------------------------------------------------------------
// US30 : création d'un signalement de contenu abusif (utilisateur connecté).
// ---------------------------------------------------------------------------
exports.creer = async (signalantId, data = {}) => {
  const type = nettoyer(data.type_cible);
  const motif = nettoyer(data.motif);
  const description = nettoyer(data.description);
  const idBrut = data.cible_id;

  if (!type || !idBrut || !motif) {
    throw echec(400, 'type_cible, cible_id et motif sont obligatoires.');
  }
  if (!MOTIFS.includes(motif)) {
    throw echec(400, `Motif invalide. Valeurs acceptées : ${MOTIFS.join(', ')}.`);
  }
  if (description && description.length > 2000) {
    throw echec(400, 'La description ne peut pas dépasser 2000 caractères.');
  }

  const cibleId = Number(idBrut);
  if (!Number.isInteger(cibleId) || cibleId < 1) {
    throw echec(400, 'cible_id doit être un entier positif.');
  }

  const cible = await lireCible(pool, type, cibleId);
  if (!cible) throw echec(404, 'Contenu introuvable.');

  let insertion;
  try {
    const { rows } = await pool.query(
      `INSERT INTO signalement_abuse
         (type_cible, cible_id, titre_cible, motif, description, signalant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [type, cibleId, cible.titre || null, motif, description, signalantId]
    );
    insertion = rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw echec(409, 'Vous avez déjà signalé ce contenu. Votre signalement est en cours d’examen.');
    }
    throw err;
  }

  await alerterAdmins(insertion.titre_cible);
  return insertion;
};

// ---------------------------------------------------------------------------
// Suivi côté utilisateur : ses propres signalements.
// ---------------------------------------------------------------------------
exports.listerMes = async (signalantId, page = 1, limit = 20) => {
  const p = Math.max(Number.parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const { rows } = await pool.query(
    `SELECT * FROM signalement_abuse
      WHERE signalant_id = $1
      ORDER BY date_creation DESC
      LIMIT $2 OFFSET $3`,
    [signalantId, l, (p - 1) * l]
  );
  const { rows: count } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM signalement_abuse WHERE signalant_id = $1',
    [signalantId]
  );
  return { signalements: rows, total: count[0].total };
};

// ---------------------------------------------------------------------------
// US31 : file d'examen administrateur.
// ---------------------------------------------------------------------------
exports.lister = async ({ statut, type, page = 1, limit = 20 } = {}) => {
  const p = Math.max(Number.parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

  const conditions = [];
  const params = [];
  const statutPropre = nettoyer(statut);
  const typePropre = nettoyer(type);

  if (statutPropre) {
    if (!STATUTS.includes(statutPropre)) throw echec(400, 'Statut invalide.');
    params.push(statutPropre);
    conditions.push(`a.statut = $${params.length}`);
  }
  if (typePropre) {
    if (!TYPES_CIBLES[typePropre]) throw echec(400, 'Type de contenu invalide.');
    params.push(typePropre);
    conditions.push(`a.type_cible = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const projection = `
    SELECT a.*,
           u.nom AS signalant_nom, u.prenom AS signalant_prenom, u.email AS signalant_email,
           adm.nom AS admin_nom,
           COUNT(*) OVER() AS total
      FROM signalement_abuse a
      JOIN utilisateur u ON u.id = a.signalant_id
      LEFT JOIN utilisateur adm ON adm.id = a.admin_id
      ${where}
      ORDER BY a.date_creation DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  const { rows } = await pool.query(projection, [...params, l, (p - 1) * l]);
  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    total,
    page: p,
    limit: l,
    signalements: rows.map(({ total: _, ...reste }) => reste),
  };
};

const voirInterne = async (id) => {
  const { rows } = await pool.query(
    `SELECT a.*,
            u.nom AS signalant_nom, u.prenom AS signalant_prenom, u.email AS signalant_email,
            adm.nom AS admin_nom
       FROM signalement_abuse a
       JOIN utilisateur u ON u.id = a.signalant_id
       LEFT JOIN utilisateur adm ON adm.id = a.admin_id
      WHERE a.id = $1`,
    [id]
  );
  if (!rows.length) throw echec(404, 'Signalement de contenu introuvable.');
  return rows[0];
};

exports.voir = voirInterne;

// ---------------------------------------------------------------------------
// US31 : décision de l'administrateur (prise en charge / résolution / rejet).
// ---------------------------------------------------------------------------
exports.changerStatut = async (adminId, id, statut, decision) => {
  const statutPropre = nettoyer(statut);
  if (!statutPropre || !STATUTS.includes(statutPropre)) {
    throw echec(400, `Statut invalide. Valeurs acceptées : ${STATUTS.join(', ')}.`);
  }
  const texteDecision = nettoyer(decision);
  if (texteDecision && texteDecision.length > 2000) {
    throw echec(400, 'La décision ne peut pas dépasser 2000 caractères.');
  }

  // Les JWT de test peuvent porter un id admin fictif : on ne remplit la FK
  // que si le compte existe reellement.
  const { rows: adminRows } = await pool.query('SELECT id FROM utilisateur WHERE id = $1', [adminId]);
  const adminRef = adminRows.length ? adminId : null;

  const { rows } = await pool.query(
    `UPDATE signalement_abuse
        SET statut = $1::varchar,
            admin_id = $2,
            decision = CASE
              WHEN $3::text IS NULL OR btrim($3::text) = '' THEN decision
              ELSE $3::text
            END,
            date_traitement = CASE WHEN $1::varchar = 'recu' THEN NULL ELSE NOW() END
      WHERE id = $4
      RETURNING *`,
    [statutPropre, adminRef, texteDecision, id]
  );
  if (!rows.length) throw echec(404, 'Signalement de contenu introuvable.');

  const misAJour = rows[0];
  if (statutPropre === 'resolu' || statutPropre === 'rejete') {
    await notifierSansCasser({
      userId: misAJour.signalant_id,
      titre: 'Votre signalement a été traité',
      message: `Le signalement concernant « ${misAJour.titre_cible || 'un contenu'} » est maintenant : ${statutPropre}.`,
    });
  }

  return voirInterne(id);
};

// ---------------------------------------------------------------------------
// US32 : suppression effective du contenu jugé abusif.
// Transaction + SELECT ... FOR UPDATE : pas de double suppression, et le
// signalement est clôt dans le même mouvement que la suppression.
// ---------------------------------------------------------------------------
exports.supprimerContenu = async (adminId, id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: found } = await client.query(
      'SELECT * FROM signalement_abuse WHERE id = $1 FOR UPDATE',
      [id]
    );
    const signalement = found[0];
    if (!signalement) throw echec(404, 'Signalement de contenu introuvable.');
    if (signalement.statut === 'rejete') {
      throw echec(400, 'Ce signalement a été classé sans suite : suppression refusée.');
    }
    if (signalement.contenu_supprime) {
      throw echec(409, 'Le contenu a déjà été supprimé pour ce signalement.');
    }

    const config = TYPES_CIBLES[signalement.type_cible];
    if (!config) throw echec(400, 'Type de contenu non supprimable.');

    const { rows: adminRows } = await client.query(
      'SELECT id FROM utilisateur WHERE id = $1',
      [adminId]
    );
    const adminRef = adminRows.length ? adminId : null;

    const { rowCount } = await client.query(
      `DELETE FROM ${config.table} WHERE id = $1`,
      [signalement.cible_id]
    );

    const note = rowCount
      ? 'Contenu supprimé par un administrateur pour abus.'
      : 'Contenu déjà absent au moment de la suppression.';

    await client.query(
      `UPDATE signalement_abuse
          SET statut = 'resolu',
              decision = CASE
                WHEN decision IS NULL OR btrim(decision) = '' THEN $2::text
                ELSE decision || E'\n' || $2::text
              END,
              admin_id = $3,
              date_traitement = NOW(),
              contenu_supprime = TRUE
        WHERE id = $1`,
      [id, note, adminRef]
    );

    await client.query('COMMIT');

    await notifierSansCasser({
      userId: signalement.signalant_id,
      titre: 'Contenu abusif supprimé',
      message: `Le contenu signalé (« ${signalement.titre_cible || 'sans titre'} ») a été supprimé par l'équipe d'administration.`,
    });

    return await voirInterne(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
