CREATE TABLE IF NOT EXISTS benevole (
  id             SERIAL PRIMARY KEY,
  utilisateur_id INTEGER NOT NULL UNIQUE REFERENCES utilisateur(id) ON DELETE CASCADE,
  competences    TEXT NOT NULL,
  disponibilites VARCHAR(200) NOT NULL,
  ville          VARCHAR(100) NOT NULL,
  motivation     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);