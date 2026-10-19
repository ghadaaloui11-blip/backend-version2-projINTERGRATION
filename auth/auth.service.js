const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.inscrireUtilisateur = async (data) => {
  const {
    nom,
    email,
    telephone,
    motDePasse,
    role,
    nomAssociation,
    adresse,
    matriculeFiscal,
    prenom,
  } = data;

  if (!email || !motDePasse || !role) {
    throw {
      status: 400,
      message: "Champs obligatoires manquants (email, motDePasse, role).",
    };
  }

  const userCheck = await pool.query(
    "SELECT * FROM utilisateur WHERE email = $1",
    [email]
  );
  if (userCheck.rows.length > 0) {
    throw { status: 400, message: "Cet email est déjà utilisé." };
  }

  const hashedPassword = await bcrypt.hash(motDePasse, 10);

  const newUserQuery = `
    INSERT INTO utilisateur (nom, email, telephone, mot_de_passe_hache, role) 
    VALUES ($1, $2, $3, $4, $5) RETURNING id, nom, email, role;
  `;
  const newUser = await pool.query(newUserQuery, [
    nom,
    email,
    telephone,
    hashedPassword,
    role,
  ]);
  const userId = newUser.rows[0].id;

  if (role === "association") {
    await pool.query(
      "INSERT INTO association (id, nom_association, adresse, matricule_fiscal) VALUES ($1, $2, $3, $4)",
      [userId, nomAssociation, adresse, matriculeFiscal]
    );
  } else if (role === "citoyen") {
    await pool.query("INSERT INTO citoyen (id, prenom) VALUES ($1, $2)", [
      userId,
      prenom,
    ]);
  }

  return newUser.rows[0];
};

exports.connecterUtilisateur = async (email, motDePasse) => {
  const userQuery = await pool.query(
    "SELECT * FROM utilisateur WHERE email = $1",
    [email]
  );
  if (userQuery.rows.length === 0) {
    throw { status: 400, message: "Email ou mot de passe incorrect." };
  }

  const user = userQuery.rows[0];
  const isValid = await bcrypt.compare(motDePasse, user.mot_de_passe_hache);
  if (!isValid) {
    throw { status: 400, message: "Email ou mot de passe incorrect." };
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
