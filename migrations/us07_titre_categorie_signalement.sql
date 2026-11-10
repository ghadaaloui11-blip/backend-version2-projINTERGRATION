-- ============================================================
-- Migration US05 : Ajouter titre et catégorie aux signalements
-- Idempotent : peut être rejoué sans erreur.
-- Usage : npm run migrate
-- ============================================================

-- 1. Ajouter colonne titre (obligatoire pour nouveaux signalements)
ALTER TABLE signalement
  ADD COLUMN IF NOT EXISTS titre VARCHAR(200);

-- 2. Ajouter colonne catégorie avec valeurs prédéfinies
ALTER TABLE signalement
  ADD COLUMN IF NOT EXISTS categorie VARCHAR(50) DEFAULT 'Autre';

-- 3. Contrainte CHECK pour les catégories autorisées
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_signalement_categorie'
  ) THEN
    ALTER TABLE signalement
      ADD CONSTRAINT ck_signalement_categorie
        CHECK (categorie IN ('Environnement', 'Infrastructure', 'Santé', 'Éducation', 'Social', 'Urgence', 'Autre'));
  END IF;
END $$;

-- 4. Index pour le filtre par catégorie
CREATE INDEX IF NOT EXISTS idx_signalement_categorie ON signalement(categorie);

-- 5. Mettre à jour les anciens signalements sans titre avec une valeur par défaut
UPDATE signalement
SET titre = 'Signalement #' || id
WHERE titre IS NULL OR titre = '';

