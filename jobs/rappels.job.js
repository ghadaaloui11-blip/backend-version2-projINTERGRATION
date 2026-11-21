const cron = require("node-cron");
const pool = require("../config/db");
const notificationsService = require("../notifications/notifications.service");

function startRappelsJob() {
  // TEST : kol minute. Ba3d el test rajja3ha "*/15 * * * *"
  cron.schedule("* * * * *", async () => {
    console.log("[rappels] vérification...");
    try {
      const { rows: events } = await pool.query(`
        SELECT id, titre, date_evenement
        FROM evenements
        WHERE rappel_envoye = false
          AND date_evenement BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      `);

      for (const ev of events) {
        const { rows: participants } = await pool.query(
          `SELECT citoyen_id
           FROM inscriptions_evenements
           WHERE evenement_id = $1`,
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