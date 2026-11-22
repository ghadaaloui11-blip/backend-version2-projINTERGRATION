-- ============================================================
-- US24 : points d'engagement et badges.
-- ATTENTION : ce fichier DOIT etre applique APRES us37_activites.sql
-- car point_engagement.activite_id reference la table activite.
-- Le prefixe us37_ garantit cet ordre (les migrations sont triees
-- alphabetiquement par migrations/run.js).
--
-- Une ligne de point par activite (unicite via activite_id), aucun
-- point n'est accepte en provenance du client : les regles sont
-- cote serveur (engagement/regles.js).
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS point_engagement (
  id              SERIAL PRIMARY KEY,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  activite_id     INTEGER NOT NULL UNIQUE REFERENCES activite(id) ON DELETE CASCADE,
  type            VARCHAR(60) NOT NULL,
  points          INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_engagement_user
  ON point_engagement(utilisateur_id, created_at DESC);

CREATE TABLE IF NOT EXISTS badge (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(60) NOT NULL UNIQUE,
  nom         VARCHAR(120) NOT NULL,
  description TEXT,
  icone       VARCHAR(20) NOT NULL DEFAULT '🏅'
);

CREATE TABLE IF NOT EXISTS badge_obtenu (
  id              SERIAL PRIMARY KEY,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  badge_id        INTEGER NOT NULL REFERENCES badge(id) ON DELETE CASCADE,
  obtenu_le       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (utilisateur_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_badge_obtenu_user ON badge_obtenu(utilisateur_id);

-- Catalog de depart (decision Q3). Les seuils vivent dans regles.js.
INSERT INTO badge (code, nom, description, icone) VALUES
  ('premier_pas',        'Premier pas',        'Votre premiere action solidaire.',        '🌱'),
  ('generieux',          'Généreux',            'Trois dons financiers effectués.',       '💚'),
  ('benevole_engage',    'Bénévole engagé',    'Inscription bénévole et événement accepté.', '🤝'),
  ('citoyen_vigilant',   'Citoyen vigilant',   'Trois signalements envoyés.',            '👁️'),
  ('pilier',             'Pilier',              'Dix actions solidaires réalisées.',      '🏛️'),
  ('legende_solidaire',  'Légende solidaire',  '50 actions ou 500 points d''engagement.','🏆')
ON CONFLICT (code) DO NOTHING;
