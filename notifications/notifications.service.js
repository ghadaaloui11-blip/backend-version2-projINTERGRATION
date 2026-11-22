// US21 : centre de notifications et envoi asynchrone.
// Le traitement effectif (SMTP / push) est volontairement hors de la requete
// appelante : une notification qui echoue ne doit jamais casser l'action metier.
const pool = require("../config/db");
const { echec } = require("../utils/http");

let transporter = null;
const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
};

let firebase = null;
const getFirebase = () => {
  if (firebase) return firebase;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }
  firebase = admin;
  return firebase;
};

const envoyer = async (id) => {
  const { rows } = await pool.query(
    `SELECT n.*, u.email, u.prenom
     FROM notification n JOIN utilisateur u ON u.id = n.utilisateur_id
     WHERE n.id = $1`,
    [id]
  );
  const n = rows[0];
  if (!n) return;

  try {
    if (n.canal === "email") {
      const t = getTransporter();
      if (!t) throw new Error("SMTP non configuré");
      await t.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: n.email,
        subject: n.titre,
        text: `Bonjour ${n.prenom},\n\n${n.message}\n\nMennaFina`,
      });
    } else if (n.canal === "push") {
      const fb = getFirebase();
      if (fb) {
        const tokens = await pool.query(
          "SELECT token FROM appareil_push WHERE utilisateur_id = $1",
          [n.utilisateur_id]
        );
        if (tokens.rows.length) {
          await fb.messaging().sendEachForMulticast({
            tokens: tokens.rows.map((t) => t.token),
            notification: { title: n.titre, body: n.message },
          });
        }
      }
      // Sans Firebase : la notification reste visible dans le centre (en base).
    }
    await pool.query(
      "UPDATE notification SET statut = 'envoye', date_envoi = NOW() WHERE id = $1",
      [id]
    );
  } catch (e) {
    console.error(`[notification ${id}] échec :`, e.message);
    await pool.query("UPDATE notification SET statut = 'echec' WHERE id = $1", [id]);
  }
};

// A appeler depuis les autres modules. Ne leve jamais d'erreur vers l'appelant.
exports.notifier = async ({ userId, type, titre, message, canaux = ["push", "email"] }) => {
  if (!userId) return;
  try {
    for (const canal of canaux) {
      const { rows } = await pool.query(
        `INSERT INTO notification (utilisateur_id, type, titre, message, canal, statut)
         VALUES ($1, $2, $3, $4, $5, 'en_attente') RETURNING id`,
        [userId, type, titre, message, canal]
      );
      setImmediate(() => envoyer(rows[0].id).catch(console.error));
    }
  } catch (e) {
    console.error("notifier() :", e.message);
  }
};

// Presentation (canal push uniquement : les emails ne sont pas affiches).
const PAGE_DEFAUT = 1;
const LIMITE_DEFAUT = 20;

exports.lister = async (userId, page = PAGE_DEFAUT, limit = LIMITE_DEFAUT) => {
  const p = Math.max(Number.parseInt(page, 10) || PAGE_DEFAUT, 1);
  const l = Math.min(Math.max(Number.parseInt(limit, 10) || LIMITE_DEFAUT, 1), 100);
  const { rows } = await pool.query(
    `SELECT id, type, titre, message, lue, date_creation
     FROM notification
     WHERE utilisateur_id = $1 AND canal <> 'email'
     ORDER BY date_creation DESC
     LIMIT $2 OFFSET $3`,
    [userId, l, (p - 1) * l]
  );
  return rows;
};

exports.compterNonLues = async (userId) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM notification
     WHERE utilisateur_id = $1 AND canal <> 'email' AND lue = FALSE`,
    [userId]
  );
  return rows[0];
};

exports.marquerLue = async (userId, id) => {
  const { rows } = await pool.query(
    "UPDATE notification SET lue = TRUE WHERE id = $1 AND utilisateur_id = $2 RETURNING id, lue",
    [id, userId]
  );
  if (!rows[0]) throw echec(404, "Notification introuvable.");
  return rows[0];
};

exports.toutMarquerLu = async (userId) => {
  await pool.query(
    "UPDATE notification SET lue = TRUE WHERE utilisateur_id = $1 AND lue = FALSE",
    [userId]
  );
  return { message: "Toutes les notifications sont marquées comme lues." };
};

exports.enregistrerAppareil = async (userId, token, plateforme) => {
  if (!token) throw echec(400, "Token obligatoire.");
  await pool.query(
    `INSERT INTO appareil_push (utilisateur_id, token, plateforme)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET utilisateur_id = EXCLUDED.utilisateur_id`,
    [userId, String(token), String(plateforme || "web")]
  );
  return { message: "Appareil enregistré." };
};
