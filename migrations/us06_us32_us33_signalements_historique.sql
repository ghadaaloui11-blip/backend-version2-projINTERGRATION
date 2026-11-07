-- ============================================================
-- Migration US06 / US32 / US33 (suite) :
--   - journal des changements de statut (tracabilite)
--   - reactive la possibilite de rouvrir un signalement resolu
-- Idempotent : peut etre rejoue sans erreur.
--
-- Le nom du fichier se trie APRES us06_us32_us33_signalements.sql :
-- la colonne signalement.association_id doit exister avant le backfill.
-- ============================================================

CREATE TABLE IF NOT EXISTS signalement_statut_historique (
  id              SERIAL PRIMARY KEY,
  signalement_id  INTEGER NOT NULL REFERENCES signalement(id) ON DELETE CASCADE,
  statut          VARCHAR(20) NOT NULL
                    CONSTRAINT ck_historique_statut
                    CHECK (statut IN ('recu', 'en_cours', 'resolu')),
  association_id  INTEGER REFERENCES association(id) ON DELETE SET NULL,
  date_changement TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historique_signalement
  ON signalement_statut_historique(signalement_id);

-- Backfill : entree initiale "recu" pour chaque signalement existant qui
-- n'a pas encore d'historique (date de creation du signalement).
INSERT INTO signalement_statut_historique (signalement_id, statut, date_changement)
SELECT s.id, 'recu', s.created_at
FROM signalement s
WHERE NOT EXISTS (
  SELECT 1 FROM signalement_statut_historique h WHERE h.signalement_id = s.id
);

-- Backfill : etat courant pour les signalements deja traites avant ce journal.
INSERT INTO signalement_statut_historique (signalement_id, statut, association_id, date_changement)
SELECT s.id, s.statut, s.association_id,
       COALESCE(s.date_resolution, s.date_prise_en_charge, s.created_at)
FROM signalement s
WHERE s.statut <> 'recu'
  AND NOT EXISTS (
    SELECT 1 FROM signalement_statut_historique h
    WHERE h.signalement_id = s.id AND h.statut = s.statut
  );
