// src/controllers/upload.controller.js
import { query } from '../config/database.js';

// Adjust this if your table name is different
const FILES_TABLE = 'files'; // e.g. 'erp_files', 'uploaded_files', etc.

/**
 * POST /api/v1/upload
 * Body example:
 * {
 *   "module": "CRM",
 *   "record_id": 123,
 *   "file_name": "contract.pdf",
 *   "file_url": "https://s3/.../contract.pdf",
 *   "mime_type": "application/pdf",
 *   "size_bytes": 12345,
 *   "storage_provider": "S3"  // or "SUPABASE", "LOCAL"
 * }
 */
export async function createFileRecord(req, res, next) {
  try {
    const {
      module,
      record_id,
      file_name,
      file_url,
      mime_type,
      size_bytes,
      storage_provider,
      uploaded_by
    } = req.body;

    if (!file_name || !file_url) {
      return res.status(400).json({
        success: false,
        message: 'file_name and file_url are required'
      });
    }

    const uploadedByUserId = uploaded_by || req.user?.user_id || null;

    const insertRes = await query(
      `
      INSERT INTO ${FILES_TABLE} (
        module,
        record_id,
        file_name,
        file_url,
        mime_type,
        size_bytes,
        storage_provider,
        uploaded_by,
        uploaded_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING *
      `,
      [
        module || null,
        record_id || null,
        file_name,
        file_url,
        mime_type || null,
        size_bytes || null,
        storage_provider || null,
        uploadedByUserId
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'File record created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/upload/:file_id
 * If you use soft delete, adjust query to set deleted_flag = true instead of DELETE.
 */
export async function deleteFileRecord(req, res, next) {
  try {
    const { file_id } = req.params;

    if (!file_id) {
      return res.status(400).json({
        success: false,
        message: 'file_id is required'
      });
    }

    // Hard delete – change to soft delete if needed:
    const delRes = await query(
      `
      DELETE FROM ${FILES_TABLE}
      WHERE id = $1 OR file_id = $1
      `,
      [file_id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'File record not found'
      });
    }

    return res.json({
      success: true,
      message: 'File record deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}
