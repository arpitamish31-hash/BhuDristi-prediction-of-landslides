/**
 * BhuDrishti — Predictions Routes
 *
 * POST /api/predictions        — save a prediction result (from Flask)
 * GET  /api/predictions        — list predictions (with filters)
 * GET  /api/predictions/:id    — get single prediction
 * GET  /api/predictions/stats  — aggregated stats for dashboard
 */

import { Router } from 'express'
import { query } from '../db/db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// ── Save prediction ───────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const {
    district, latitude, longitude,
    slope, elevation, curvature, aspect,
    precipitation, ndvi, soil_moisture,
    soil_type, lulc, dist_road, dist_fault,
    risk_label, risk_category, confidence,
    prob_low, prob_moderate, prob_high, prob_critical,
    source = 'manual',
  } = req.body

  if (risk_label === undefined || !risk_category) {
    return res.status(400).json({ error: 'risk_label and risk_category are required.' })
  }

  try {
    const { rows } = await query(
      `INSERT INTO predictions (
        user_id, district, latitude, longitude,
        slope, elevation, curvature, aspect,
        precipitation, ndvi, soil_moisture,
        soil_type, lulc, dist_road, dist_fault,
        risk_label, risk_category, confidence,
        prob_low, prob_moderate, prob_high, prob_critical,
        source
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      ) RETURNING *`,
      [
        req.user.id, district, latitude, longitude,
        slope, elevation, curvature, aspect,
        precipitation, ndvi, soil_moisture,
        soil_type, lulc, dist_road, dist_fault,
        risk_label, risk_category, confidence,
        prob_low, prob_moderate, prob_high, prob_critical,
        source,
      ]
    )

    // Auto-create alert if High or Critical
    if (['High', 'Critical'].includes(risk_category)) {
      const message = `${risk_category} landslide risk detected in ${district || 'unknown district'}. Precipitation: ${precipitation} mm, Slope: ${slope}°.`
      await query(
        `INSERT INTO alerts (prediction_id, district, latitude, longitude,
          risk_category, message, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active')`,
        [rows[0].id, district, latitude, longitude, risk_category, message]
      )
    }

    return res.status(201).json(rows[0])
  } catch (err) {
    console.error('[predictions/post]', err.message)
    return res.status(500).json({ error: 'Could not save prediction.' })
  }
})

// ── List predictions ──────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const {
    district, risk_category, source,
    limit = 50, offset = 0,
  } = req.query

  const conditions = []
  const params     = []
  let   p          = 1

  if (district) {
    conditions.push(`district ILIKE $${p++}`)
    params.push(`%${district}%`)
  }
  if (risk_category) {
    conditions.push(`risk_category = $${p++}`)
    params.push(risk_category)
  }
  if (source) {
    conditions.push(`source = $${p++}`)
    params.push(source)
  }

  // Citizens see only their own predictions
  if (req.user.role === 'citizen') {
    conditions.push(`user_id = $${p++}`)
    params.push(req.user.id)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(parseInt(limit), parseInt(offset))

  try {
    const { rows } = await query(
      `SELECT p.*, u.name AS user_name, u.email AS user_email
       FROM predictions p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      params
    )

    const count = await query(
      `SELECT COUNT(*) FROM predictions ${where}`,
      params.slice(0, -2)
    )

    return res.json({ total: parseInt(count.rows[0].count), predictions: rows })
  } catch (err) {
    console.error('[predictions/get]', err.message)
    return res.status(500).json({ error: 'Could not fetch predictions.' })
  }
})

// ── Stats for dashboard ───────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const [predStats, alertStats] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE risk_category = 'Low')      AS low_count,
          COUNT(*) FILTER (WHERE risk_category = 'Moderate') AS moderate_count,
          COUNT(*) FILTER (WHERE risk_category = 'High')     AS high_count,
          COUNT(*) FILTER (WHERE risk_category = 'Critical') AS critical_count,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h
        FROM predictions
      `),
      query(`SELECT COUNT(*) AS active_alerts FROM alerts WHERE status = 'active'`),
    ])
    return res.json({
      ...predStats.rows[0],
      active_alerts: parseInt(alertStats.rows[0].active_alerts) || 0,
    })
  } catch (err) {
    console.error('[predictions/stats]', err.message)
    return res.status(500).json({ error: 'Could not fetch stats.' })
  }
})

// ── Single prediction ─────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.name AS user_name FROM predictions p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Prediction not found.' })
    return res.json(rows[0])
  } catch (err) {
    console.error('[predictions/getById]', err.message)
    return res.status(500).json({ error: 'Could not fetch prediction.' })
  }
})

export default router
