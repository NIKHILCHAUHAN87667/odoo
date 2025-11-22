const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '0212',
  database: process.env.DB_NAME || 'stockmaster',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const init = async () => {
  try {
    // Test connection first
    await pool.query('SELECT 1');
    console.log('Database connection successful');
  } catch (error) {
    // If database doesn't exist, create it first
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('Database not found, creating...');
      const tempPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '0212'
      });
      
      await tempPool.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'stockmaster'}`);
      await tempPool.end();
      console.log('Database created successfully');
    } else {
      console.error('Database connection error:', error.message);
      throw error;
    }
  }

  try {
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Remove comments and split by semicolons
    const statements = schema
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.toLowerCase().startsWith('delimiter'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
        } catch (err) {
          // Ignore "table already exists" errors
          if (err.code !== 'ER_TABLE_EXISTS_ERROR' && err.code !== 'ER_DUP_ENTRY') {
            console.warn('SQL statement warning:', err.message);
          }
        }
      }
    }
    
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Database schema initialization error:', error.message);
    // Don't throw - allow server to start even if some tables exist
  }
};

module.exports = {
  pool,
  init
};

