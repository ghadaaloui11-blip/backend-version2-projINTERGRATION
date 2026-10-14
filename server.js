const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./auth/auth.routes");
const reportsRoutes = require("./reports/reports.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes intégrées du Membre 2
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
