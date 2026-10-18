-- ============================================================
-- Migration US02 & US03 : Documents légaux + validation admin
-- ============================================================

-- 1. Ajouter les colonnes de validation dans la table association
--    (si elles n'existent pas déjà)
ALTER TABLE association
  ADD COLUMN IF NOT EXISTS statut_validation VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS commentaire_admin TEXT,
  ADD COLUMN IF NOT EXISTS date_validation TIMESTAMP;

-- 2. Contrainte sur les valeurs autorisées
ALTER TABLE association
  DROP CONSTRAINT IF EXISTS ck_association_statut;

ALTER TABLE association
  ADD CONSTRAINT ck_association_statut
    CHECK (statut_validation IN ('pending', 'approuve', 'refuse'));

-- 3. Table des documents légaux
CREATE TABLE IF NOT EXISTS document_association (
  id               SERIAL PRIMARY KEY,
  association_id   INTEGER NOT NULL REFERENCES association(id) ON DELETE CASCADE,
  type_document    VARCHAR(50) NOT NULL
                     CHECK (type_document IN ('statuts', 'matricule_fiscal', 'registre_commerce', 'autre')),
  chemin_fichier   TEXT NOT NULL,
  nom_original     VARCHAR(255) NOT NULL,
  date_depot       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_doc_assoc_id ON document_association(association_id);
