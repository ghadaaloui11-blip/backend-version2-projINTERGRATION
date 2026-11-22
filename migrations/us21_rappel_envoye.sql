-- ============================================================
-- US21 : marqueur de rappel envoye, utilise par jobs/rappels.job.js.
-- Sans cette colonne, le cron echoue a chaque execution.
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

ALTER TABLE evenements
  ADD COLUMN IF NOT EXISTS rappel_envoye BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_evenements_rappel
  ON evenements(rappel_envoye, date_evenement);
