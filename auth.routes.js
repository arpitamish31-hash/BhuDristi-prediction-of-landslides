/**
 * BhuDrishti — Auth Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me      (protected)
 */

import { Router } from 'express'
import bcrypt from 'bcrypt'
import { query } from '../db/db.js'
import { requireAuth, signToken } from '../middleware/auth.js'

const router = Router()
const SALT_ROUNDS = 12

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'citizen', district, phone } = req.body

  // Input validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required.' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }

  const validRoles = ['citizen', 'field_officer', 'district_admin']
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${validRoles.join(', ')}` })
  }

  try {
    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, district, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, district, phone, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, role, district || null, phone || null]
    )

    const user  = rows[0]
    const token = signToken(user)

    return res.status(201).json({ token, user })
  } catch (err) {
    console.error('[auth/register]', err.message)
    return res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' })
  }

  try {
    const { rows } = await query(
      'SELECT id, name, email, password_hash, role, district, phone FROM users WHERE email = $1',
      [email.toLowerCase()]
    )

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const user  = rows[0]
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    // Don't send password hash to client
    delete user.password_hash
    const token = signToken(user)

    return res.status(200).json({ token, user })
  } catch (err) {
    console.error('[auth/login]', err.message)
    return res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

// ── Me (current user) ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, email, role, district, phone, created_at FROM users WHERE id = $1',
      [req.user.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' })
    return res.json(rows[0])
  } catch (err) {
    console.error('[auth/me]', err.message)
    return res.status(500).json({ error: 'Could not fetch user.' })
  }
})

export default router
