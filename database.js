const mysql = require('mysql2/promise');

const host = (process.env.DB_HOST || process.env.MYSQL_ADDON_HOST || 'localhost').trim();
const port = Number(process.env.DB_PORT || process.env.MYSQL_ADDON_PORT || 3306);
const user = (process.env.DB_USER || process.env.MYSQL_ADDON_USER || 'root').trim();
const password = process.env.DB_PASSWORD !== undefined 
  ? String(process.env.DB_PASSWORD).trim() 
  : (process.env.MYSQL_ADDON_PASSWORD ? String(process.env.MYSQL_ADDON_PASSWORD).trim() : 'hostess2026');
const database = (process.env.DB_NAME || process.env.MYSQL_ADDON_DB || 'reservestack_db').trim();

const uri = process.env.MYSQL_ADDON_URI || process.env.DATABASE_URL;

let pool;

if (uri && uri.trim() !== '') {
  pool = mysql.createPool(uri.trim());
} else {
  pool = mysql.createPool({
    host: host,
    port: port,
    user: user,
    password: password,
    database: database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });
}

module.exports = pool;