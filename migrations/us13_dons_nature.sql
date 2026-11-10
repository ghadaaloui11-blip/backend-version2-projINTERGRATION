-- ============================================================
-- Migration US13 : Dons en nature (vetements, nourriture, materiel)
-- Idempotent : peut etre rejoue sans erreur.
-- Usage : npm run migrate
-- ============================================================

CREATE TABLE IF NOT EXISTS don_nature (
  id              SERIAL PRIMARY KEY,
  citoyen_id      INTEGER REFERENCES utilisateur(id) ON DELETE SET NULL,
  association_id  INTEGER REFERENCES association(id) ON DELETE SET NULL,
  type_don        VARCHAR(50)  NOT NULL,
  description     TEXT         NOT NULL,
  quantite        VARCHAR(100),
  ville           VARCHAR(120) NOT NULL,
  statut          VARCHAR(20)  NOT NULL DEFAULT 'propose'
                    CONSTRAINT ck_don_nature_statut
                    CHECK (statut IN ('propose', 'accepte', 'collecte', 'refuse', 'annule')),
  date_collecte   DATE,
  lieu_collecte   VARCHAR(255),
  commentaire     TEXT,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_don_nature_citoyen     ON don_nature(citoyen_id);
CREATE INDEX IF NOT EXISTS idx_don_nature_association ON don_nature(association_id);
CREATE INDEX IF NOT EXISTS idx_don_nature_statut      ON don_nature(statut);
