-- ============================================================
-- US30 / US31 / US32 : signalement de contenu abusif.
--
-- Un "signalement abusif" vise un CONTENU de la plateforme
-- (campagne, evenement, signalement ou association), et non un
-- besoin d'aide. Il est distinct de la table `signalement`.
--
-- Idempotent : peut etre rejoue sans erreur.
-- ============================================================

CREATE TABLE IF NOT EXISTS signalement_abuse (
  id               SERIAL PRIMARY KEY,
  type_cible       VARCHAR(30) NOT NULL
                     CONSTRAINT ck_signalement_abuse_type
                     CHECK (type_cible IN ('campagne', 'evenement', 'signalement', 'association')),
  cible_id         INTEGER NOT NULL,
  titre_cible      VARCHAR(200),
  motif            VARCHAR(40) NOT NULL
                     CONSTRAINT ck_signalement_abuse_motif
                     CHECK (motif IN ('haine', 'harcelement', 'fraude',
                                      'contenu_inapproprie', 'spam', 'autre')),
  description      TEXT,
  statut           VARCHAR(20) NOT NULL DEFAULT 'recu'
                     CONSTRAINT ck_signalement_abuse_statut
                     CHECK (statut IN ('recu', 'en_cours', 'resolu', 'rejete')),
  decision         TEXT,
  signalant_id     INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  admin_id         INTEGER REFERENCES utilisateur(id) ON DELETE SET NULL,
  date_creation    TIMESTAMP NOT NULL DEFAULT NOW(),
  date_traitement  TIMESTAMP,
  contenu_supprime BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_signalement_abuse_statut
  ON signalement_abuse(statut, date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_signalement_abuse_cible
  ON signalement_abuse(type_cible, cible_id);

-- Un membre ne peut pas ouvrir deux signalements ouverts pour le meme contenu.
-- Une fois l'affaire close (resolu/rejete), un nouveau signalement est possible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signalement_abuse_doublon
  ON signalement_abuse(signalant_id, type_cible, cible_id)
  WHERE statut IN ('recu', 'en_cours');
