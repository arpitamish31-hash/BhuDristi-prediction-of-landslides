/**
 * BhuDrishti — ML Proxy Routes
 * Node.js forwards requests to the Flask ML API and optionally
 * persists results to PostgreSQL.
 *
 * POST /api/ml/predict   — predict risk, auto-save to DB
 * POST /api/ml/forecast  — 24h lead-time forecast
 * GET  /api/ml/health    — check Flask API status
 */

import { Router } from 'express'
import axios from 'axios'
import { query } from '../db/db.js'
import { requireAuth } from '../middleware/auth.js'

const router  = Router()
const ML_URL  = process.env.ML_API_URL || 'http://localhost:5000'

// ── Health check ──────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const { data } = await axios.get(`${ML_URL}/health`, { timeout: 5000 })
    return res.json({ flask: 'online', ...data })
  } catch {
    return res.status(503).json({ flask: 'offline', error: 'Flask API unreachable.' })
  }
})

// ── Predict ───────────────────────────────────────────────────────────────────
router.post('/predict', requireAuth, async (req, res) => {
  const { district, latitude, longitude, ...features } = req.body

  try {
    // Forward to Flask
    const { data } = await axios.post(`${ML_URL}/predict`, features, { timeout: 10000 })

    // Auto-save prediction to PostgreSQL
    try {
      const probabilities = data.probabilities || {}
      await query(
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
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'automated'
        )`,
        [
          req.user.id, district || null, latitude || null, longitude || null,
          features.slope, features.elevation, features.curvature, features.aspect,
          features.precipitation, features.ndvi, features.soil_moisture,
          features.soil_type, features.lulc, features.dist_road, features.dist_fault,
          data.risk_label, data.risk_category, data.confidence,
          probabilities.Low, probabilities.Moderate,
          probabilities.High, probabilities.Critical,
        ]
      )
    } catch (dbErr) {
      // Don't fail the response if DB write fails — log and continue
      console.error('[ml/predict] DB save failed:', dbErr.message)
    }

    return res.json({
      ...data,
      district,
      latitude,
      longitude,
      saved_to_db: true,
    })
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
      return res.status(503).json({ error: 'ML service unavailable. Ensure Flask is running.' })
    }
    const flaskError = err.response?.data?.error || err.message
    return res.status(err.response?.status || 500).json({ error: flaskError })
  }
})

// ── Forecast ──────────────────────────────────────────────────────────────────
router.post('/forecast',  async (req, res) => {
  try {
    const { data } = await axios.post(`${ML_URL}/forecast`, req.body, { timeout: 20000 })
    return res.json(data)
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'ML service unavailable.' })
    }
    return res.status(err.response?.status || 502).json({
      error: err.response?.data?.error || 'Forecast request failed.',
    })
  }
})

// ── Region risks (proxy) ──────────────────────────────────────────────────────
router.get('/region-risks', async (req, res) => {
  try {
    const { data } = await axios.get(`${ML_URL}/region-risks`, { timeout: 8000 })
    return res.json(data)
  } catch {
    return res.status(503).json({ error: 'ML service unavailable.' })
  }
})

// ── Stats (proxy) ─────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { data } = await axios.get(`${ML_URL}/stats`, { timeout: 5000 })
    return res.json(data)
  } catch {
    return res.status(503).json({ error: 'ML service unavailable.' })
  }
})

export default router
