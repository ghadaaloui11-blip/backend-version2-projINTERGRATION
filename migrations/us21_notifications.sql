-- ============================================================
-- US21 : notifications (centre de notifications + rappels)
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification (
  id            SERIAL PRIMARY KEY,
  type          VARCHAR(50) NOT NULL,
  titre         VARCHAR(150) NOT NULL,
  message       TEXT NOT NULL,
  canal         VARCHAR(20) NOT NULL DEFAULT 'push',
  statut        VARCHAR(20) NOT NULL DEFAULT 'en_attente',
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_envoi    TIMESTAMP,
  utilisateur_id INTEGER REFERENCES utilisateur(id) ON DELETE CASCADE
);

-- Compatibilite avec les bases deja pourvues d'une table notification.
ALTER TABLE notification ADD COLUMN IF NOT EXISTS lue BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS appareil_push (
  id              SERIAL PRIMARY KEY,
  utilisateur_id  INTEGER REFERENCES utilisateur(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  plateforme      VARCHAR(20),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(utilisateur_id, lue);
