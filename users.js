const db = require ('./db');

const createTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    github_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'analyst', -- analyst or admin
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Index for faster lookups during login
    CREATE INDEX idx_github_id ON users(github_id);
  `;
  try {
    console.log("Talking to the Railway safe...");
    await db.query(sql);
    console.log("Database table 'users' is ready!");
    process.exit(0);
  } catch (err) {
    console.error("error creating table", err);
    process.exit(1);
  }
};

createTable();