-- ============================================================
-- Migration US31 : Ajouter citoyen_id à la table dons
-- pour permettre aux citoyens de consulter l'historique de leurs dons
-- Idempotent : peut être rejoué sans erreur.
-- Usage : npm run migrate
-- ============================================================

-- 1. Ajouter la colonne citoyen_id pour tracer l'auteur du don (même pour dons anonymes)
ALTER TABLE dons
  ADD COLUMN IF NOT EXISTS citoyen_id INTEGER REFERENCES utilisateur(id) ON DELETE SET NULL;

-- 2. Index pour améliorer les performances sur les requêtes par citoyen
CREATE INDEX IF NOT EXISTS idx_dons_citoyen ON dons(citoyen_id);
CREATE INDEX IF NOT EXISTS idx_dons_campagne_citoyen ON dons(campagne_id, citoyen_id);
