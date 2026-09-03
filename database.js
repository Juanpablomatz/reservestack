const mysql = require('mysql2/promise');

const isRemote = process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'hostess2026',
  database: process.env.DB_NAME || 'reservestack_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined
});

module.exports = pool;