-- Migration US15 : dons recurrents
-- Idempotent : peut etre rejoue sans erreur.
CREATE TABLE IF NOT EXISTS dons_recurrents (
  id            SERIAL PRIMARY KEY,
  citoyen_id    INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  campagne_id   INTEGER NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
  montant       NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  periodicite   VARCHAR(20) NOT NULL
                  CONSTRAINT ck_dr_periodicite
                  CHECK (periodicite IN ('mensuel', 'trimestriel', 'annuel')),
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  date_debut    DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin      DATE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dr_citoyen   ON dons_recurrents(citoyen_id);
CREATE INDEX IF NOT EXISTS idx_dr_campagne  ON dons_recurrents(campagne_id);
