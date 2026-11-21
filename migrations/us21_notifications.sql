-- Table notification (prévue au Sprint 2) : créée si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS notification (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  titre VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  canal VARCHAR(20) NOT NULL DEFAULT 'push',      -- 'push' ou 'email'
  statut VARCHAR(20) NOT NULL DEFAULT 'en_attente', -- en_attente | envoye | echec
  date_creation TIMESTAMP DEFAULT NOW(),
  date_envoi TIMESTAMP,
  utilisateur_id INT REFERENCES utilisateur(id) ON DELETE CASCADE
);

-- Si la table existait déjà, on ajoute la colonne "lue"
ALTER TABLE notification ADD COLUMN IF NOT EXISTS lue BOOLEAN NOT NULL DEFAULT FALSE;

-- Jetons des appareils pour les notifications push
CREATE TABLE IF NOT EXISTS appareil_push (
  id SERIAL PRIMARY KEY,
  utilisateur_id INT REFERENCES utilisateur(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  plateforme VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(utilisateur_id, lue);