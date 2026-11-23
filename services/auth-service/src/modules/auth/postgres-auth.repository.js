import pg from 'pg'
const { Pool } = pg

// Connection Pool: Har request pe naya connection banane se bachata hai
const pool = new Pool({
  connectionString: process.env.POSTGRES_URI,
  ssl: { rejectUnauthorized: false } // Neon/Supabase ke liye zaroori hai
})

const toPlain = (row) => {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresAuthRepository {
  async findByEmail(email) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])
    return toPlain(res.rows[0])
  }

  async findByEmailWithPassword(email) {
    // Postgres mein humein explicitly password select nahi karna padta, 
    // humare paas toh poora row hi aa raha hai.
    return this.findByEmail(email)
  }

  async create({ name, email, passwordHash, role = 'user' }) {
    try {
      const query = `
        INSERT INTO users (name, email, password_hash, role) 
        VALUES ($1, $2, $3, $4) 
        RETURNING *
      `
      const res = await pool.query(query, [name, email.toLowerCase(), passwordHash, role])
      return toPlain(res.rows[0])
    } catch (err) {
      // Postgres Unique violation code: 23505
      if (err.code === '23505') {
        const { EmailAlreadyExistsError } = await import('./auth.errors.js')
        throw new EmailAlreadyExistsError()
      }
      throw err
    }
  }

  async findById(id) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    return toPlain(res.rows[0])
  }

  async updateLastLogin(userId) {
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId])
  }

  async updateName(userId, name) {
    const res = await pool.query('UPDATE users SET name = $1 WHERE id = $2 RETURNING *', [name, userId])
    return toPlain(res.rows[0])
  }

  // ── Refresh Token Operations ──
  async createRefreshToken({ userId, tokenHash, expiresAt }) {
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    )
  }

  async findAndDeleteRefreshToken(tokenHash) {
    const res = await pool.query(
      'DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING *',
      [tokenHash]
    )
    return res.rows[0] || null
  }

  async deleteRefreshToken(tokenHash) {
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash])
  }
}