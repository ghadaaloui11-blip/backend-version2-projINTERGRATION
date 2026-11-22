const cron = require("node-cron");
const pool = require("../config/db");
const notificationsService = require("../notifications/notifications.service");

function startRappelsJob() {
  // Toutes les 15 minutes. Seuls les evenements publies et les inscrits
  // acceptes sont rappele (et non les demandes en attente ou refusees).
  cron.schedule("*/15 * * * *", async () => {
    console.log("[rappels] vérification...");
    try {
      const { rows: events } = await pool.query(`
        SELECT id, titre, date_evenement
        FROM evenements
        WHERE rappel_envoye = false
          AND statut = 'publie'
          AND date_evenement BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      `);

      for (const ev of events) {
        const { rows: participants } = await pool.query(
          `SELECT citoyen_id
           FROM inscriptions_evenements
           WHERE evenement_id = $1 AND statut = 'accepte'`,
          [ev.id]
        );

        for (const p of participants) {
          await notificationsService.notifier({
            userId: p.citoyen_id,
            type: "evenement",
            titre: "Rappel d'événement",
            message: `Rappel : "${ev.titre}" commence bientôt.`,
          });
        }

        await pool.query(
          `UPDATE evenements SET rappel_envoye = true WHERE id = $1`,
          [ev.id]
        );
      }
      console.log(`[rappels] ${events.length} événement(s) traité(s)`);
    } catch (err) {
      console.error("[rappels] erreur :", err.message);
    }
  });
}

module.exports = { startRappelsJob };