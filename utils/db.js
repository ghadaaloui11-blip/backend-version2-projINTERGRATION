// Helper transactionnel partage par les services qui ecrivent une activite.
// Le journal et l'action metier doivent reussir ou echouer ensemble (decision Q12).
const pool = require("../config/db");

exports.avecTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
