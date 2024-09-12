const logging = require('./logging');
const { createConnection, closeConnection } = require('../services/db');

/**
 * @param {string} unit
 * @param {string} status
 *
 * @returns get last status of particular unit from db
 *
 * The lastUnitStatusDB function retrieves the timestamp of the most recent status change for a given HVAC unit from a database.
 * It handles cases where no data is found and logs any encountered errors.
 * Database connection is established and closed within the function.
 */
const lastUnitStatusDB = async (unit, status) => {
  try {
    const query = `
    SELECT status, created_at
    FROM short_term_readings
    WHERE zone_id = ? AND status LIKE ?
    ORDER BY created_at DESC LIMIT 1
  `;

    // creating database connection here
    const connection = await createConnection();

    const rows = await new Promise((resolve, reject) => {
      connection.query(query, [unit, `%${status}%`], (err, rows, fields) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    if (rows.length === 0) {
      // Handle the case where no data is found
      // logging.log(`[LUS] [UNIT ${unit}] - No data found for last unit status - DB`);

      // closing database connection here
      await closeConnection(connection);
      return null;
    }

    const data = rows[0];

    // closing database connection here
    await closeConnection(connection);

    return data.created_at;
  } catch (err) {
    logging.log('[LUS] - Error fetching last unit status');
  }
};

module.exports = lastUnitStatusDB;
