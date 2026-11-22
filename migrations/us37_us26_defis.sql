-- ============================================================
-- US26 : defis (challenges) et participations.
-- ATTENTION : appliquer APRES us37_activites.sql (la completion d'un
-- defi ecrit une activite 'defi_complete' et des points). Le prefixe
-- us37_ garantit l'ordre alphabetique du runner de migrations.
--
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS defi (
  id                 SERIAL PRIMARY KEY,
  titre              VARCHAR(200) NOT NULL,
  description        TEXT,
  categorie          VARCHAR(80),
  -- 'automatique' : progression calculee depuis la table activite
  -- 'manuelle'    : preuve photo soumise puis validee par un admin
  mode               VARCHAR(20) NOT NULL DEFAULT 'automatique'
                       CONSTRAINT ck_defi_mode CHECK (mode IN ('automatique', 'manuelle')),
  -- Type d'activite comptabilise pour le mode automatique (ex: 'don').
  type_activite      VARCHAR(60),
  objectif           INTEGER NOT NULL DEFAULT 1 CONSTRAINT ck_defi_objectif CHECK (objectif > 0),
  recompense_points  INTEGER NOT NULL DEFAULT 0 CONSTRAINT ck_defi_recompense CHECK (recompense_points >= 0),
  icone              VARCHAR(20) NOT NULL DEFAULT '🎯',
  date_debut         DATE,
  date_fin           DATE,
  statut             VARCHAR(20) NOT NULL DEFAULT 'actif'
                       CONSTRAINT ck_defi_statut CHECK (statut IN ('actif', 'archive')),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defi_statut ON defi(statut);
CREATE INDEX IF NOT EXISTS idx_defi_categorie ON defi(categorie);

CREATE TABLE IF NOT EXISTS defi_participation (
  id             SERIAL PRIMARY KEY,
  defi_id        INTEGER NOT NULL REFERENCES defi(id) ON DELETE CASCADE,
  utilisateur_id INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  statut         VARCHAR(20) NOT NULL DEFAULT 'en_cours'
                   CONSTRAINT ck_participation_statut
                   CHECK (statut IN ('en_cours', 'en_attente', 'complete', 'rejete')),
  progression    INTEGER NOT NULL DEFAULT 0,
  photo_preuve   VARCHAR(255),
  commentaire    TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMP,
  UNIQUE (defi_id, utilisateur_id)
);

CREATE INDEX IF NOT EXISTS idx_participation_user ON defi_participation(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_participation_defi ON defi_participation(defi_id);
