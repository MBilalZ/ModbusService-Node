const mysql = require('mysql2');
require('dotenv').config();

let totalCount = 0;

// Function to create the database connection
const createConnection = async () => {
  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  connection.connect((err) => {
    if (err) throw err;
    totalCount++;
    // logging.log(`[DB] - Connected to SQL database successfully, totalCount db: ${totalCount}`);
  });
  return connection;
};

// Function to close the database connection
const closeConnection = async (connection) => {
  if (connection) {
    connection.end((err) => {
      if (err) throw err;
      totalCount--;
      // logging.log(`[DB] - Connection closed, totalCount db: ${totalCount}`);
    });
  }
};

// Export the functions
module.exports = {
  createConnection,
  closeConnection,
};
