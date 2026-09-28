const mysql = require("mysql2/promise");
const config = require("./config");

let pool;

async function initDb() {
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    charset: "utf8mb4",
    jsonStrings: true,
  });
  await pool.query("SELECT 1");
  return pool;
}

function getPool() {
  return pool;
}

module.exports = { initDb, getPool };