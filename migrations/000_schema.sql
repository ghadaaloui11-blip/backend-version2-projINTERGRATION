-- ============================================================
-- Solidarite - schema de base (000)
-- Reconstitue a partir des requetes utilisees par le backend.
-- Idempotent : peut etre rejoue sans erreur.
-- Usage : psql -U postgres -d solidarite_db -f migrations/000_schema.sql
-- ============================================================

SET client_encoding = 'UTF8';

-- ------------------------------------------------------------
-- 1. Utilisateur (nom + prenom : prenom est selectionne par
--    campagnes.service.listAssociations)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utilisateur (
  id                  SERIAL PRIMARY KEY,
  nom                 VARCHAR(120) NOT NULL,
  prenom              VARCHAR(120),
  email               VARCHAR(180) NOT NULL UNIQUE,
  telephone           VARCHAR(30),
  mot_de_passe_hache  TEXT NOT NULL,
  role                VARCHAR(20) NOT NULL
                        CONSTRAINT ck_utilisateur_role
                        CHECK (role IN ('citoyen', 'association', 'admin')),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. Citoyen (extension de utilisateur)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citoyen (
  id      INTEGER PRIMARY KEY REFERENCES utilisateur(id) ON DELETE CASCADE,
  prenom  VARCHAR(120)
);

-- ------------------------------------------------------------
-- 3. Association (extension de utilisateur)
--    Les colonnes de validation sont aussi ajoutees par la
--    migration us02_us03_associations.sql (ADD COLUMN IF NOT
--    EXISTS) : les deux restent compatibles.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS association (
  id                INTEGER PRIMARY KEY REFERENCES utilisateur(id) ON DELETE CASCADE,
  nom_association   VARCHAR(180) NOT NULL,
  adresse           VARCHAR(255),
  matricule_fiscal  VARCHAR(60),
  statut_validation VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CONSTRAINT ck_association_statut
                      CHECK (statut_validation IN ('pending', 'approuve', 'refuse')),
  commentaire_admin TEXT,
  date_validation   TIMESTAMP
);

-- ------------------------------------------------------------
-- 4. Campagnes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campagnes (
  id                SERIAL PRIMARY KEY,
  titre             VARCHAR(200) NOT NULL,
  description       TEXT,
  objectif_montant  NUMERIC(12, 2) NOT NULL CHECK (objectif_montant > 0),
  montant_collecte  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  date_debut        DATE NOT NULL,
  date_fin          DATE NOT NULL,
  statut            VARCHAR(20) NOT NULL DEFAULT 'active',
  association_id    INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. Utilisation des fonds (US12)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utilisation_fonds (
  id                SERIAL PRIMARY KEY,
  campagne_id       INTEGER NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
  libelle           VARCHAR(200) NOT NULL,
  montant           NUMERIC(12, 2) NOT NULL CHECK (montant > 0),
  date_utilisation  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 6. Signalements (US05 / US07)
--    citoyen_id pointe sur utilisateur (et non citoyen) pour
--    qu'un admin/association puisse aussi poster sans erreur de FK.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signalement (
  id           SERIAL PRIMARY KEY,
  description  TEXT NOT NULL,
  photo        TEXT,
  latitude     NUMERIC(10, 7),
  longitude    NUMERIC(10, 7),
  est_anonyme  BOOLEAN NOT NULL DEFAULT FALSE,
  citoyen_id   INTEGER REFERENCES utilisateur(id) ON DELETE SET NULL,
  statut       VARCHAR(20) NOT NULL DEFAULT 'recu',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 7. Dons (US11)
--    reference est remplie juste apres l'insertion, dans la meme
--    transaction : 'DON-<annee>-<id sur 4 chiffres>'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dons (
  id           SERIAL PRIMARY KEY,
  campagne_id  INTEGER NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
  montant      NUMERIC(12, 2) NOT NULL CHECK (montant > 0),
  est_anonyme  BOOLEAN NOT NULL DEFAULT FALSE,
  nom          VARCHAR(180),
  message      TEXT,
  reference    VARCHAR(40) UNIQUE,
  statut       VARCHAR(80) NOT NULL DEFAULT 'enregistre',
  date         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 8. Index
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campagnes_association   ON campagnes(association_id);
CREATE INDEX IF NOT EXISTS idx_campagnes_statut        ON campagnes(statut);
CREATE INDEX IF NOT EXISTS idx_utilisation_campagne    ON utilisation_fonds(campagne_id);
CREATE INDEX IF NOT EXISTS idx_signalement_statut      ON signalement(statut);
CREATE INDEX IF NOT EXISTS idx_dons_campagne           ON dons(campagne_id);
