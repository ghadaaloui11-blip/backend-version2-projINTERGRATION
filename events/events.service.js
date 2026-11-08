const pool = require('../config/db');
const { echec } = require('../utils/http');

// Helper colonnes et jointures pour un événement
const SELECT_EVENEMENT = `
  SELECT
    e.id,
    e.titre,
    e.description,
    to_char(e.date_evenement, 'YYYY-MM-DD"T"HH24:MI:SS') AS date_evenement,
    e.lieu,
    e.ville,
    e.categorie,
    e.places_disponibles,
    e.statut,
    e.association_id,
    e.created_at,
    COALESCE(a.nom_association, u.nom) AS association_nom,
    COUNT(i.id) FILTER (WHERE i.statut = 'accepte')::int AS nb_inscrits_acceptes,
    COUNT(i.id) FILTER (WHERE i.statut = 'en_attente')::int AS nb_inscrits_attente,
    GREATEST(0, e.places_disponibles - COUNT(i.id) FILTER (WHERE i.statut = 'accepte'))::int AS places_restantes
  FROM evenements e
  JOIN association a ON a.id = e.association_id
  JOIN utilisateur u ON u.id = e.association_id
  LEFT JOIN inscriptions_evenements i ON i.evenement_id = e.id AND i.statut != 'annule'
`;

// US16 : Création et publication d'un événement (association)
exports.createEvent = async (data, associationId) => {
  const {
    titre,
    description,
    date_evenement,
    lieu,
    ville,
    categorie = 'Autre',
    places_disponibles,
  } = data;

  if (!titre || !date_evenement || !lieu || !ville || !places_disponibles) {
    throw echec(400, 'Titre, date, lieu, ville et nombre de places sont obligatoires.');
  }

  const places = parseInt(places_disponibles, 10);
  if (isNaN(places) || places <= 0) {
    throw echec(400, 'Le nombre de places disponibles doit être supérieur à zéro.');
  }

  const eventDate = new Date(date_evenement);
  if (isNaN(eventDate.getTime())) {
    throw echec(400, 'Date d\'événement invalide.');
  }

  const { rows } = await pool.query(
    `INSERT INTO evenements
       (association_id, titre, description, date_evenement, lieu, ville, categorie, places_disponibles, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'publie')
     RETURNING id, titre, description,
               to_char(date_evenement, 'YYYY-MM-DD"T"HH24:MI:SS') AS date_evenement,
               lieu, ville, categorie, places_disponibles, statut, association_id, created_at`,
    [associationId, titre.trim(), description?.trim() || null, eventDate, lieu.trim(), ville.trim(), categorie.trim(), places]
  );

  return rows[0];
};

// US17 : Consultation et filtres des événements (par ville, catégorie, date, mot-clé)
exports.findAllEvents = async ({ ville, categorie, date, search, statut = 'publie', association_id } = {}) => {
  const params = [];
  const where = [];

  if (statut && statut !== 'all') {
    params.push(statut);
    where.push(`e.statut = $${params.length}`);
  }

  if (association_id) {
    params.push(association_id);
    where.push(`e.association_id = $${params.length}`);
  }

  if (ville) {
    params.push(`%${ville.trim()}%`);
    where.push(`e.ville ILIKE $${params.length}`);
  }

  if (categorie && categorie !== 'Toutes') {
    params.push(categorie.trim());
    where.push(`e.categorie = $${params.length}`);
  }

  if (date) {
    params.push(date);
    where.push(`DATE(e.date_evenement) = $${params.length}::date`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    where.push(`(e.titre ILIKE $${params.length} OR e.description ILIKE $${params.length} OR e.lieu ILIKE $${params.length})`);
  }

  const clauseWhere = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    ${SELECT_EVENEMENT}
    ${clauseWhere}
    GROUP BY e.id, a.nom_association, u.nom
    ORDER BY e.date_evenement ASC
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
};

// Détail d'un événement avec vérification d'inscription pour l'utilisateur connecté
exports.findEventById = async (id, citoyenId = null) => {
  const params = [id];
  let joinCitoyen = '';
  let selectCitoyen = '';

  if (citoyenId) {
    params.push(citoyenId);
    selectCitoyen = `,
      mon_ins.statut AS statut_mon_inscription,
      mon_ins.id AS mon_inscription_id,
      mon_ins.message_motivation AS mon_message_motivation
    `;
    joinCitoyen = `LEFT JOIN inscriptions_evenements mon_ins ON mon_ins.evenement_id = e.id AND mon_ins.citoyen_id = $2`;
  }

  const sql = `
    SELECT
      e.id,
      e.titre,
      e.description,
      to_char(e.date_evenement, 'YYYY-MM-DD"T"HH24:MI:SS') AS date_evenement,
      e.lieu,
      e.ville,
      e.categorie,
      e.places_disponibles,
      e.statut,
      e.association_id,
      e.created_at,
      COALESCE(a.nom_association, u.nom) AS association_nom,
      u.email AS association_email,
      u.telephone AS association_telephone,
      COUNT(i.id) FILTER (WHERE i.statut = 'accepte')::int AS nb_inscrits_acceptes,
      COUNT(i.id) FILTER (WHERE i.statut = 'en_attente')::int AS nb_inscrits_attente,
      GREATEST(0, e.places_disponibles - COUNT(i.id) FILTER (WHERE i.statut = 'accepte'))::int AS places_restantes
      ${selectCitoyen}
    FROM evenements e
    JOIN association a ON a.id = e.association_id
    JOIN utilisateur u ON u.id = e.association_id
    LEFT JOIN inscriptions_evenements i ON i.evenement_id = e.id AND i.statut != 'annule'
    ${joinCitoyen}
    WHERE e.id = $1
    GROUP BY e.id, a.nom_association, u.nom, u.email, u.telephone ${citoyenId ? ', mon_ins.statut, mon_ins.id, mon_ins.message_motivation' : ''}
  `;

  const { rows } = await pool.query(sql, params);
  if (rows.length === 0) {
    throw echec(404, 'Événement introuvable.');
  }

  return rows[0];
};

// Événements gérés par l'association connectée
exports.findEventsByAssociation = async (associationId) => {
  const sql = `
    ${SELECT_EVENEMENT}
    WHERE e.association_id = $1
    GROUP BY e.id, a.nom_association, u.nom
    ORDER BY e.date_evenement DESC
  `;
  const { rows } = await pool.query(sql, [associationId]);
  return rows;
};

// US34 : Inscription / candidature d'un citoyen à un événement
exports.registerCitoyen = async (evenementId, citoyenId, messageMotivation) => {
  // 1. Vérifier si l'événement existe et est actif
  const { rows: eventRows } = await pool.query(
    `SELECT id, statut, places_disponibles FROM evenements WHERE id = $1`,
    [evenementId]
  );
  if (eventRows.length === 0) {
    throw echec(404, 'Événement introuvable.');
  }
  const event = eventRows[0];
  if (event.statut !== 'publie') {
    throw echec(400, 'Cet événement n\'est plus ouvert aux inscriptions.');
  }

  // 2. Vérifier si déjà inscrit
  const { rows: existing } = await pool.query(
    `SELECT id, statut FROM inscriptions_evenements WHERE evenement_id = $1 AND citoyen_id = $2`,
    [evenementId, citoyenId]
  );

  if (existing.length > 0) {
    if (existing[0].statut === 'annule') {
      // Réactiver l'inscription si elle avait été annulée
      const { rows: reactivated } = await pool.query(
        `UPDATE inscriptions_evenements
         SET statut = 'en_attente', message_motivation = $1, date_inscription = NOW()
         WHERE id = $2
         RETURNING id, evenement_id, citoyen_id, statut, message_motivation, date_inscription`,
        [messageMotivation || null, existing[0].id]
      );
      return reactivated[0];
    }
    throw echec(400, `Vous avez déjà postulé à cet événement (statut actuel : ${existing[0].statut}).`);
  }

  // 3. Vérifier la capacité disponible
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS acceptes FROM inscriptions_evenements WHERE evenement_id = $1 AND statut = 'accepte'`,
    [evenementId]
  );
  if (countRows[0].acceptes >= event.places_disponibles) {
    throw echec(400, 'Cet événement a déjà atteint sa capacité maximale de participants.');
  }

  // 4. Insérer l'inscription avec statut 'en_attente'
  const { rows: newInscription } = await pool.query(
    `INSERT INTO inscriptions_evenements (evenement_id, citoyen_id, message_motivation, statut)
     VALUES ($1, $2, $3, 'en_attente')
     RETURNING id, evenement_id, citoyen_id, statut, message_motivation, date_inscription`,
    [evenementId, citoyenId, messageMotivation?.trim() || null]
  );

  return newInscription[0];
};

// Citoyen : Annuler sa propre inscription
exports.cancelRegistration = async (evenementId, citoyenId) => {
  const { rows } = await pool.query(
    `UPDATE inscriptions_evenements
     SET statut = 'annule'
     WHERE evenement_id = $1 AND citoyen_id = $2 AND statut != 'annule'
     RETURNING id, statut`,
    [evenementId, citoyenId]
  );

  if (rows.length === 0) {
    throw echec(404, 'Aucune inscription active trouvée pour cet événement.');
  }

  return { message: 'Inscription annulée avec succès.' };
};

// US18 : Consultation de la liste des participants inscrits (association)
exports.findParticipantsByEvent = async (evenementId, associationId) => {
  // Vérifier la propriété de l'événement
  const { rows: eventRows } = await pool.query(
    `SELECT id, association_id, titre FROM evenements WHERE id = $1`,
    [evenementId]
  );
  if (eventRows.length === 0) {
    throw echec(404, 'Événement introuvable.');
  }
  if (eventRows[0].association_id !== associationId) {
    throw echec(403, 'Accès non autorisé aux participants de cet événement.');
  }

  const sql = `
    SELECT
      i.id AS inscription_id,
      i.evenement_id,
      i.citoyen_id,
      i.message_motivation,
      i.statut,
      to_char(i.date_inscription, 'YYYY-MM-DD"T"HH24:MI:SS') AS date_inscription,
      u.nom,
      COALESCE(c.prenom, u.prenom) AS prenom,
      u.email,
      u.telephone
    FROM inscriptions_evenements i
    JOIN utilisateur u ON u.id = i.citoyen_id
    LEFT JOIN citoyen c ON c.id = i.citoyen_id
    WHERE i.evenement_id = $1 AND i.statut != 'annule'
    ORDER BY
      CASE i.statut
        WHEN 'en_attente' THEN 1
        WHEN 'accepte' THEN 2
        WHEN 'refuse' THEN 3
        ELSE 4
      END,
      i.date_inscription ASC
  `;

  const { rows } = await pool.query(sql, [evenementId]);
  return {
    evenement: eventRows[0],
    participants: rows,
  };
};

// US35 : Accepter ou refuser une candidature/inscription (association)
exports.updateParticipantStatus = async (evenementId, inscriptionId, nouveauStatut, associationId) => {
  if (!['accepte', 'refuse'].includes(nouveauStatut)) {
    throw echec(400, 'Le statut doit être "accepte" ou "refuse".');
  }

  // Vérifier que l'événement appartient à l'association
  const { rows: eventRows } = await pool.query(
    `SELECT id, association_id, places_disponibles FROM evenements WHERE id = $1`,
    [evenementId]
  );
  if (eventRows.length === 0) {
    throw echec(404, 'Événement introuvable.');
  }
  if (eventRows[0].association_id !== associationId) {
    throw echec(403, 'Accès non autorisé à cet événement.');
  }

  // Si on accepte, vérifier si les places ne sont pas déjà toutes prises
  if (nouveauStatut === 'accepte') {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS acceptes
       FROM inscriptions_evenements
       WHERE evenement_id = $1 AND statut = 'accepte' AND id != $2`,
      [evenementId, inscriptionId]
    );
    if (countRows[0].acceptes >= eventRows[0].places_disponibles) {
      throw echec(400, 'Impossible d\'accepter : le nombre maximal de places est déjà atteint.');
    }
  }

  const { rows } = await pool.query(
    `UPDATE inscriptions_evenements
     SET statut = $1
     WHERE id = $2 AND evenement_id = $3
     RETURNING id, evenement_id, citoyen_id, statut`,
    [nouveauStatut, inscriptionId, evenementId]
  );

  if (rows.length === 0) {
    throw echec(404, 'Candidature / Inscription introuvable pour cet événement.');
  }

  return rows[0];
};

// Association : Annuler ou modifier le statut d'un événement
exports.updateEventStatus = async (evenementId, nouveauStatut, associationId) => {
  if (!['publie', 'annule', 'termine'].includes(nouveauStatut)) {
    throw echec(400, 'Statut d\'événement invalide.');
  }

  const { rows } = await pool.query(
    `UPDATE evenements
     SET statut = $1
     WHERE id = $2 AND association_id = $3
     RETURNING id, titre, statut`,
    [nouveauStatut, evenementId, associationId]
  );

  if (rows.length === 0) {
    throw echec(404, 'Événement introuvable ou non autorisé.');
  }

  return rows[0];
};
