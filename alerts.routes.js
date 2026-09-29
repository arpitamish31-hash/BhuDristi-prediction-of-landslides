/**
 * BhuDrishti — Alerts Routes
 *
 * GET    /api/alerts              — list alerts (filter by status/district)
 * POST   /api/alerts              — create alert manually
 * PATCH  /api/alerts/:id/acknowledge — mark acknowledged
 * PATCH  /api/alerts/:id/resolve    — mark resolved
 * POST   /api/alerts/:id/sms        — simulate SMS dispatch
 */

import { Router } from 'express'
import { query } from '../db/db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// ── List alerts ───────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { status, district, risk_category, limit = 50, offset = 0 } = req.query

  const conditions = []
  const params     = []
  let   p          = 1

  if (status)        { conditions.push(`status = $${p++}`);                params.push(status) }
  if (district)      { conditions.push(`district ILIKE $${p++}`);          params.push(`%${district}%`) }
  if (risk_category) { conditions.push(`risk_category = $${p++}`);         params.push(risk_category) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(parseInt(limit), parseInt(offset))

  try {
    const { rows } = await query(
      `SELECT * FROM alerts
       ${where}
       ORDER BY created_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      params
    )
    const count = await query(
      `SELECT COUNT(*) FROM alerts ${where}`,
      params.slice(0, -2)
    )
    return res.json({ total: parseInt(count.rows[0].count), alerts: rows })
  } catch (err) {
    console.error('[alerts/get]', err.message)
    return res.status(500).json({ error: 'Could not fetch alerts.' })
  }
})

// ── Create alert manually ─────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireRole('field_officer', 'district_admin', 'superadmin'),
  async (req, res) => {
    const { district, latitude, longitude, risk_category, message, recipients } = req.body

    if (!district || !risk_category || !message) {
      return res.status(400).json({ error: 'district, risk_category and message are required.' })
    }

    try {
      const { rows } = await query(
        `INSERT INTO alerts (district, latitude, longitude, risk_category, message, recipients)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [district, latitude || null, longitude || null, risk_category, message, recipients || null]
      )
      return res.status(201).json(rows[0])
    } catch (err) {
      console.error('[alerts/post]', err.message)
      return res.status(500).json({ error: 'Could not create alert.' })
    }
  }
)

// ── Acknowledge ───────────────────────────────────────────────────────────────
router.patch(
  '/:id/acknowledge',
  requireAuth,
  requireRole('field_officer', 'district_admin', 'superadmin'),
  async (req, res) => {
    try {
      const { rows } = await query(
        `UPDATE alerts
         SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW()
         WHERE id = $2 AND status = 'active'
         RETURNING *`,
        [req.user.id, req.params.id]
      )
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Alert not found or already acknowledged.' })
      }
      return res.json(rows[0])
    } catch (err) {
      console.error('[alerts/acknowledge]', err.message)
      return res.status(500).json({ error: 'Could not acknowledge alert.' })
    }
  }
)

// ── Resolve ───────────────────────────────────────────────────────────────────
router.patch(
  '/:id/resolve',
  requireAuth,
  requireRole('district_admin', 'superadmin'),
  async (req, res) => {
    try {
      const { rows } = await query(
        `UPDATE alerts
         SET status = 'resolved', resolved_at = NOW()
         WHERE id = $1 AND status != 'resolved'
         RETURNING *`,
        [req.params.id]
      )
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Alert not found or already resolved.' })
      }
      return res.json(rows[0])
    } catch (err) {
      console.error('[alerts/resolve]', err.message)
      return res.status(500).json({ error: 'Could not resolve alert.' })
    }
  }
)

// ── SMS dispatch (simulation) ─────────────────────────────────────────────────
router.post(
  '/:id/sms',
  requireAuth,
  requireRole('field_officer', 'district_admin', 'superadmin'),
  async (req, res) => {
    try {
      const { rows: alertRows } = await query(
        'SELECT * FROM alerts WHERE id = $1',
        [req.params.id]
      )
      if (alertRows.length === 0) {
        return res.status(404).json({ error: 'Alert not found.' })
      }

      const alert = alertRows[0]

      // In production: integrate Twilio / AWS SNS here
      // For demo: we log and mark as sent
      console.log(`[SMS] Dispatching to ${(alert.recipients || []).join(', ')}:`)
      console.log(`[SMS] "${alert.message}"`)

      const { rows } = await query(
        `UPDATE alerts
         SET sms_sent = TRUE, sms_sent_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [req.params.id]
      )

      return res.json({
        message:    'SMS dispatched successfully (simulation).',
        recipients: alert.recipients || [],
        alert:      rows[0],
      })
    } catch (err) {
      console.error('[alerts/sms]', err.message)
      return res.status(500).json({ error: 'SMS dispatch failed.' })
    }
  }
)

export default router
