const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { echec } = require("../utils/http");

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

  if (!email || !motDePasseNettoye || !role) {
    throw echec(400, "Champs obligatoires manquants (email, motDePasse, role).");
  }
  if (!nom) {
    throw echec(400, "Le nom est obligatoire.");
  }
  if (!ROLES_PUBLICS.includes(role)) {
    throw echec(
      400,
      "Rôle invalide. Valeurs acceptées : citoyen, association."
    );
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
      [nom, prenom || null, emailNormalise, telephone || null, hashedPassword, role]
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
        prenom || null,
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
