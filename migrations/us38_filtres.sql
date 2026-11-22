-- ============================================================
-- US38 : filtres avances (ville / categorie / dates) sur les
-- listes publiques. Nouvelles colonnes NULLABLE : aucune ecriture
-- existante n'est cassee par cette migration.
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

-- 1. Campagnes -------------------------------------------------
ALTER TABLE campagnes
  ADD COLUMN IF NOT EXISTS ville     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS categorie VARCHAR(80) NOT NULL DEFAULT 'Autre';

-- 2. Associations ----------------------------------------------
ALTER TABLE association
  ADD COLUMN IF NOT EXISTS ville     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS categorie VARCHAR(80) NOT NULL DEFAULT 'Autre';

-- 3. Signalements ----------------------------------------------
ALTER TABLE signalement
  ADD COLUMN IF NOT EXISTS ville VARCHAR(120);

-- ------------------------------------------------------------
-- Backfill CONSERVATEUR (decision Q9) : on ne remplit que les
-- lignes encore vides, et uniquement quand l'adresse contient
-- EXACTEMENT une virgule (donc une ville non ambigue en derniere
-- position). Les adresses sans virgule ou a plusieurs virgules
-- sont laissees a NULL : mieux vaut un filtre vide qu'une ville
-- erronee.
-- ------------------------------------------------------------
UPDATE association
SET ville = NULLIF(BTRIM(split_part(adresse, ',', 2)), '')
WHERE ville IS NULL
  AND adresse IS NOT NULL
  AND length(adresse) - length(replace(adresse, ',', '')) = 1;

-- Les campagnes heritent de la ville de leur association.
UPDATE campagnes c
SET ville = a.ville
FROM association a
WHERE c.ville IS NULL
  AND a.id = c.association_id
  AND a.ville IS NOT NULL;

-- Les signalements n'ont pas d'adresse textuelle : pas de backfill
-- fiable, on laisse ville = NULL (le filtre renverra 0 resultat
-- pour ces lignes, ce qui est le comportement attendu).

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campagnes_ville     ON campagnes(ville);
CREATE INDEX IF NOT EXISTS idx_campagnes_categorie ON campagnes(categorie);
CREATE INDEX IF NOT EXISTS idx_association_ville     ON association(ville);
CREATE INDEX IF NOT EXISTS idx_association_categorie ON association(categorie);
CREATE INDEX IF NOT EXISTS idx_signalement_ville     ON signalement(ville);
