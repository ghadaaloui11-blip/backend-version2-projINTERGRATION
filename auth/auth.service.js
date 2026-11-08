const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { echec } = require("../utils/http");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// US01 : seules l'inscription citoyen et association sont publiques.
// Les comptes admin sont crees uniquement via migrations/create-admin.js.
const ROLES_PUBLICS = ["citoyen", "association"];

const normaliserEmail = (email) => String(email).trim().toLowerCase();

exports.inscrireUtilisateur = async (data) => {
  const {
    nom,
    prenom,
    email,
    telephone,
    motDePasse,
    role,
    nomAssociation,
    adresse,
    matriculeFiscal,
  } = data || {};

  const motDePasseNettoye = String(motDePasse ?? "").trim();
  const nomNettoye = String(nom ?? "").trim();
  const prenomNettoye = String(prenom ?? "").trim();
  const telephoneNettoye = String(telephone ?? "").trim();

  if (!email || !motDePasseNettoye || !role) {
    throw echec(400, "Champs obligatoires manquants (email, motDePasse, role).");
  }
  if (!ROLES_PUBLICS.includes(role)) {
    throw echec(
      400,
      "Rôle invalide. Valeurs acceptées : citoyen, association."
    );
  }
  // Validation serveur alignee sur le formulaire : le front ne doit pas etre
  // la seule barriere (un appel direct a l'API pourrait creer un compte vide).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    throw echec(400, "Le format de l'email est invalide.");
  }
  if (nomNettoye.length < 2) {
    throw echec(400, "Le nom est obligatoire (2 caractères minimum).");
  }
  if (prenomNettoye.length < 2) {
    throw echec(400, "Le prénom est obligatoire (2 caractères minimum).");
  }
  if (!/^[0-9+\s()-]{8,}$/.test(telephoneNettoye)) {
    throw echec(400, "Le téléphone est obligatoire (8 caractères minimum).");
  }
  if (motDePasseNettoye.length < 6) {
    throw echec(400, "Le mot de passe doit contenir au moins 6 caractères.");
  }
  if (role === "association" && !nomAssociation) {
    throw echec(400, "Le nom de l'association est obligatoire.");
  }

  const emailNormalise = normaliserEmail(email);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userCheck = await client.query(
      "SELECT id FROM utilisateur WHERE lower(email) = $1",
      [emailNormalise]
    );
    if (userCheck.rows.length > 0) {
      throw echec(400, "Cet email est déjà utilisé.");
    }

    const hashedPassword = await bcrypt.hash(motDePasseNettoye, 10);

    const newUser = await client.query(
      `INSERT INTO utilisateur (nom, prenom, email, telephone, mot_de_passe_hache, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nom, email, role`,
      [nomNettoye, prenomNettoye, emailNormalise, telephoneNettoye, hashedPassword, role]
    );
    const userId = newUser.rows[0].id;

    if (role === "association") {
      // Insertion dans la meme transaction : si elle echoue (ex. contrainte),
      // l'utilisateur est annule => plus de ligne orpheline bloquant l'email.
      await client.query(
        `INSERT INTO association (id, nom_association, adresse, matricule_fiscal)
         VALUES ($1, $2, $3, $4)`,
        [userId, nomAssociation, adresse || null, matriculeFiscal || null]
      );
    } else {
      await client.query("INSERT INTO citoyen (id, prenom) VALUES ($1, $2)", [
        userId,
        prenomNettoye,
      ]);
    }

    await client.query("COMMIT");
    return newUser.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Course possible entre le SELECT et l'INSERT : la contrainte UNIQUE tranche.
    if (err.code === "23505") {
      throw echec(400, "Cet email est déjà utilisé.");
    }
    throw err;
  } finally {
    client.release();
  }
};

exports.connecterUtilisateur = async (email, motDePasse) => {
  const motDePasseNettoye = String(motDePasse ?? "").trim();

  if (!email || !motDePasseNettoye) {
    throw echec(400, "Email et mot de passe obligatoires.");
  }

  const userQuery = await pool.query(
    "SELECT * FROM utilisateur WHERE lower(email) = $1",
    [normaliserEmail(email)]
  );
  if (userQuery.rows.length === 0) {
    throw echec(401, "Email ou mot de passe incorrect.");
  }

  const user = userQuery.rows[0];
  const isValid = await bcrypt.compare(motDePasseNettoye, user.mot_de_passe_hache);
  if (!isValid) {
    throw echec(401, "Email ou mot de passe incorrect.");
  }

  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );

  return {
    token,
    utilisateur: {
      id: user.id,
      nom: user.nom,
      email: user.email,
      role: user.role,
    },
  };
};

// Connexion / inscription via Google (le front envoie l'idToken Google)
exports.connecterAvecGoogle = async (idToken) => {
  if (!idToken) {
    throw echec(400, "Le token Google est obligatoire.");
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw echec(500, "GOOGLE_CLIENT_ID n'est pas configuré sur le serveur.");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw echec(401, "Token Google invalide.");
  }

  if (!payload || !payload.email || !payload.email_verified) {
    throw echec(401, "Email Google non vérifié.");
  }

  const email = normaliserEmail(payload.email);
  const prenom = String(payload.given_name || "").trim() || "Utilisateur";
  const nom = String(payload.family_name || "").trim() || prenom;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let user;
    const existant = await client.query(
      "SELECT id, nom, prenom, email, role FROM utilisateur WHERE lower(email) = $1",
      [email]
    );

    if (existant.rows.length > 0) {
      user = existant.rows[0];
    } else {
      // Compte Google = citoyen. Mot de passe aleatoire (jamais utilise).
      const motDePasseAleatoire = crypto.randomBytes(32).toString("hex");
      const hache = await bcrypt.hash(motDePasseAleatoire, 10);

      const nouveau = await client.query(
        `INSERT INTO utilisateur (nom, prenom, email, mot_de_passe_hache, role)
         VALUES ($1, $2, $3, $4, 'citoyen')
         RETURNING id, nom, prenom, email, role`,
        [nom, prenom, email, hache]
      );
      user = nouveau.rows[0];

      await client.query("INSERT INTO citoyen (id, prenom) VALUES ($1, $2)", [
        user.id,
        prenom,
      ]);
    }

    await client.query("COMMIT");

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return {
      token,
      utilisateur: {
        id: user.id,
        nom: user.nom,
        email: user.email,
        role: user.role,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};