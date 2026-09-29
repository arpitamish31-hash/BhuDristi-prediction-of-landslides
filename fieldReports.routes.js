/**
 * BhuDrishti — Field Reports Routes
 * Citizens and field officers submit ground observations via the app.
 *
 * POST /api/field-reports              — submit a report
 * GET  /api/field-reports              — list reports (with filters)
 * GET  /api/field-reports/:id          — single report
 * PATCH /api/field-reports/:id/verify  — verify a report (admin/officer)
 */

import { Router } from 'express'
import { query } from '../db/db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

const VALID_TYPES = [
  'crack', 'blocked_road', 'landslide_occurred',
  'flooding', 'infrastructure_damage', 'other',
]

// ── Submit report ─────────────────────────────────────────────────────────────
router.post('/',  async (req, res) => {
  const {
    district, latitude, longitude,
    report_type, description, severity = 'unknown', image_url,
  } = req.body

  if (!report_type) {
    return res.status(400).json({ error: 'report_type is required.' })
  }
  if (!VALID_TYPES.includes(report_type)) {
    return res.status(400).json({ error: `report_type must be one of: ${VALID_TYPES.join(', ')}` })
  }

  try {
    const { rows } = await query(
      `INSERT INTO field_reports
         (user_id, district, latitude, longitude,
          report_type, description, severity, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        null, district || null,
        latitude || null, longitude || null,
        report_type, description || null, severity, image_url || null,
      ]
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    console.error('[field-reports/post]', err.message)
    return res.status(500).json({ error: 'Could not submit report.' })
  }
})

// ── List reports ──────────────────────────────────────────────────────────────
router.get('/',  async (req, res) => {
  const {
    district, report_type, severity,
    verified, limit = 50, offset = 0,
  } = req.query

  const conditions = []
  const params     = []
  let   p          = 1

  if (district)    { conditions.push(`fr.district ILIKE $${p++}`);   params.push(`%${district}%`) }
  if (report_type) { conditions.push(`fr.report_type = $${p++}`);    params.push(report_type) }
  if (severity)    { conditions.push(`fr.severity = $${p++}`);       params.push(severity) }
  if (verified !== undefined) {
    conditions.push(`fr.verified = $${p++}`)
    params.push(verified === 'true')
  }

  // Citizens see only their own reports
  if (req.user?.role === 'citizen') {
    conditions.push(`fr.user_id = $${p++}`)
    params.push(req.user.id)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(parseInt(limit), parseInt(offset))

  try {
    const { rows } = await query(
      `SELECT fr.*, u.name AS reporter_name, u.role AS reporter_role
       FROM field_reports fr
       LEFT JOIN users u ON u.id = fr.user_id
       ${where}
       ORDER BY fr.created_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      params
    )
    const count = await query(
      `SELECT COUNT(*) FROM field_reports fr ${where}`,
      params.slice(0, -2)
    )
    return res.json({ total: parseInt(count.rows[0].count), reports: rows })
  } catch (err) {
    console.error('[field-reports/get]', err.message)
    return res.status(500).json({ error: 'Could not fetch reports.' })
  }
})

// ── Single report ─────────────────────────────────────────────────────────────
router.get('/:id',requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT fr.*, u.name AS reporter_name FROM field_reports fr
       LEFT JOIN users u ON u.id = fr.user_id
       WHERE fr.id = $1`,
      [req.params.id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'Report not found.' })
    return res.json(rows[0])
  } catch (err) {
    console.error('[field-reports/getById]', err.message)
    return res.status(500).json({ error: 'Could not fetch report.' })
  }
})

// ── Verify report ─────────────────────────────────────────────────────────────
router.patch(
  '/:id/verify',
  requireAuth,
  requireRole('field_officer', 'district_admin', 'superadmin'),
  async (req, res) => {
    try {
      const { rows } = await query(
        `UPDATE field_reports
         SET verified = TRUE, verified_by = $1, verified_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [req.user.id, req.params.id]
      )
      if (rows.length === 0) return res.status(404).json({ error: 'Report not found.' })
      return res.json(rows[0])
    } catch (err) {
      console.error('[field-reports/verify]', err.message)
      return res.status(500).json({ error: 'Could not verify report.' })
    }
  }
)
// ── Delete report ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM field_reports
       WHERE id = $1
       RETURNING id`,
      [req.params.id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Report not found.' })
    }

    return res.json({
      message: 'Report deleted successfully.',
      id: rows[0].id
    })
  } catch (err) {
    console.error('[field-reports/delete]', err.message)
    return res.status(500).json({ error: 'Could not delete report.' })
  }
})

export default router
