-- ============================================================
-- US22 : etat actif/inactif d'un compte, utilise par admin.service.js
-- (listerUtilisateurs / changerStatutUtilisateur).
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

ALTER TABLE utilisateur
  ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_utilisateur_actif ON utilisateur(actif);
