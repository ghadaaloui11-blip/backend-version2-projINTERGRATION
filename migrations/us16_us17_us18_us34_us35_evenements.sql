-- ============================================================
-- Sprint 2 - Membre 2 : Événements et participation
-- US16, US17, US18, US34, US35
-- Idempotent : peut être rejoué sans erreur.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table des événements (US16 & US17)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evenements (
  id                  SERIAL PRIMARY KEY,
  association_id      INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
  titre               VARCHAR(200) NOT NULL,
  description         TEXT,
  date_evenement      TIMESTAMP NOT NULL,
  lieu                VARCHAR(255) NOT NULL,
  ville               VARCHAR(120) NOT NULL,
  categorie           VARCHAR(80) NOT NULL DEFAULT 'Autre',
  places_disponibles  INTEGER NOT NULL CHECK (places_disponibles > 0),
  statut              VARCHAR(20) NOT NULL DEFAULT 'publie'
                        CONSTRAINT ck_evenement_statut
                        CHECK (statut IN ('publie', 'annule', 'termine')),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. Table des inscriptions / participations aux événements (US34, US18, US35)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inscriptions_evenements (
  id                  SERIAL PRIMARY KEY,
  evenement_id        INTEGER NOT NULL REFERENCES evenements(id) ON DELETE CASCADE,
  citoyen_id          INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  message_motivation  TEXT,
  statut              VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                        CONSTRAINT ck_inscription_statut
                        CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'annule')),
  date_inscription    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_evenement_citoyen UNIQUE (evenement_id, citoyen_id)
);

-- ------------------------------------------------------------
-- 3. Index de performance pour les filtres et recherches (US17, US18)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_evenements_association ON evenements(association_id);
CREATE INDEX IF NOT EXISTS idx_evenements_ville       ON evenements(ville);
CREATE INDEX IF NOT EXISTS idx_evenements_categorie   ON evenements(categorie);
CREATE INDEX IF NOT EXISTS idx_evenements_date        ON evenements(date_evenement);
CREATE INDEX IF NOT EXISTS idx_evenements_statut      ON evenements(statut);

CREATE INDEX IF NOT EXISTS idx_inscriptions_evenement ON inscriptions_evenements(evenement_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_citoyen   ON inscriptions_evenements(citoyen_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_statut    ON inscriptions_evenements(statut);
