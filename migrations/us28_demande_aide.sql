CREATE TABLE IF NOT EXISTS demande_aide (
  id             SERIAL PRIMARY KEY,
  citoyen_id     INTEGER REFERENCES utilisateur(id) ON DELETE SET NULL,
  categorie      VARCHAR(50) NOT NULL,
  description    TEXT NOT NULL,
  ville          VARCHAR(100) NOT NULL,
  telephone      VARCHAR(30),
  association_id INTEGER REFERENCES association(id) ON DELETE SET NULL,
  statut         VARCHAR(20) NOT NULL DEFAULT 'recue'
                   CHECK (statut IN ('recue', 'acceptee', 'refusee')),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demande_aide_association ON demande_aide(association_id);