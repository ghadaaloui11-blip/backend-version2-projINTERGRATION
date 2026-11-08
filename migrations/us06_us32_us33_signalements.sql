-- ============================================================
-- Migration US06 / US32 / US33 :
--   - visibilite publique des signalements publies
--   - prise en charge par une association (US32)
--   - suivi du statut par le citoyen (US06 / US33)
-- Idempotent : peut etre rejoue sans erreur.
-- Usage : npm run migrate
-- ============================================================

-- 1. Colonnes d'imputation a une association
--    association_id == utilisateur.id de l'association (meme convention
--    que campagnes.association_id). NULL = en attente d'une association.
ALTER TABLE signalement
  ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'recu',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS association_id INTEGER REFERENCES association(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_prise_en_charge TIMESTAMP,
  ADD COLUMN IF NOT EXISTS date_resolution TIMESTAMP;

-- 2. Cycle de vie limite a trois etats, conformes aux US :
--      recu     : depose, aucune association ne l'a pris en charge
--      en_cours : une association a pris la responsibility
--      resolu   : situation traitee
--    Les valeurs existantes restent valides ('recu' etait le defaut).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_signalement_statut'
  ) THEN
    ALTER TABLE signalement
      ADD CONSTRAINT ck_signalement_statut
        CHECK (statut IN ('recu', 'en_cours', 'resolu'));
  END IF;
END $$;

-- 3. Index pour la consultation courante (par statut, par association)
CREATE INDEX IF NOT EXISTS idx_signalement_association ON signalement(association_id);
