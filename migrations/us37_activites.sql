-- ============================================================
-- US37 / US24 / US26 : journal d'activite des utilisateurs.
-- Une seule source de verite pour:
--   - l'historique consulte par l'utilisateur (US37)
--   - l'attribution des points de maniere idempotente (US24)
--   - le calcul de la progression des defis (US26)
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS activite (
  id              SERIAL PRIMARY KEY,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  type            VARCHAR(60) NOT NULL,
  ref_table       VARCHAR(60) NOT NULL,
  ref_id          INTEGER NOT NULL,
  libelle         VARCHAR(255) NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_activite_source UNIQUE (type, ref_table, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_activite_utilisateur_date
  ON activite(utilisateur_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activite_type ON activite(type);
