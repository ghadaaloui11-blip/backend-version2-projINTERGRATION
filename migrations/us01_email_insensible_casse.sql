-- ============================================================
-- US01 : unicite des emails insensible a la casse
-- Les insertions normalisent deja l'email en minuscules ; cet index empeche
-- qu'un autre chemin d'ecriture cree "Admin@..." a cote de "admin@...".
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_utilisateur_email_lower
  ON utilisateur (lower(email));
