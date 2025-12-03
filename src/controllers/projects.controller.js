// src/controllers/projects.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

//
// 📋 PROJECTS CONTROLLER
//

// GET /api/v1/projects
export async function listProjects(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, search, owner_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (owner_id) {
      conditions.push(`owner_id = $${idx}`);
      params.push(owner_id);
      idx++;
    }

    if (search) {
      conditions.push(
        `(project_code ILIKE $${idx} OR project_name ILIKE $${idx} OR description ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT *
      FROM projects
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM projects
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        projects: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/projects/:id
export async function getProjectById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT *
      FROM projects
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/projects
export async function createProject(req, res, next) {
  try {
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO projects (
        project_code,
        project_name,
        description,
        status,
        owner_id,
        start_date,
        end_date,
        budget,
        created_by,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
      )
      RETURNING *
      `,
      [
        body.project_code,
        body.project_name,
        body.description,
        body.status,
        body.owner_id,
        body.start_date,
        body.end_date,
        body.budget,
        req.user?.user_id || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/projects/:id
export async function updateProject(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    const updateRes = await query(
      `
      UPDATE projects
      SET
        project_code = COALESCE($1, project_code),
        project_name = COALESCE($2, project_name),
        description  = COALESCE($3, description),
        status       = COALESCE($4, status),
        owner_id     = COALESCE($5, owner_id),
        start_date   = COALESCE($6, start_date),
        end_date     = COALESCE($7, end_date),
        budget       = COALESCE($8, budget),
        updated_at   = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        body.project_code,
        body.project_name,
        body.description,
        body.status,
        body.owner_id,
        body.start_date,
        body.end_date,
        body.budget,
        id
      ]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    return res.json({
      success: true,
      message: 'Project updated successfully',
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/projects/:id
export async function deleteProject(req, res, next) {
  try {
    const { id } = req.params;

    const delRes = await query(
      `
      DELETE FROM projects
      WHERE id = $1
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    return res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

//
// 📌 PROJECT TASKS
//

// GET /api/v1/projects/:id/tasks
export async function listProjectTasks(req, res, next) {
  try {
    const { id } = req.params; // project_id
    const { page, limit, offset } = getPagination(req);
    const { status, assigned_to } = req.query;

    const conditions = [`project_id = $1`];
    const params = [id];
    let idx = 2;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (assigned_to) {
      conditions.push(`assigned_to = $${idx}`);
      params.push(assigned_to);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const dataRes = await query(
      `
      SELECT *
      FROM project_tasks
      ${where}
      ORDER BY due_date ASC NULLS LAST, created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM project_tasks
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    return res.json({
      success: true,
      data: {
        tasks: dataRes.rows,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/projects/:id/tasks
export async function createProjectTask(req, res, next) {
  try {
    const { id } = req.params; // project_id
    const body = req.body;

    const insertRes = await query(
      `
      INSERT INTO project_tasks (
        project_id,
        task_name,
        description,
        status,
        assigned_to,
        due_date,
        priority,
        created_by,
        created_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,NOW()
      )
      RETURNING *
      `,
      [
        id,
        body.task_name,
        body.description,
        body.status,
        body.assigned_to,
        body.due_date,
        body.priority,
        req.user?.user_id || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Project task created successfully',
      data: insertRes.rows[0]
    });
  } catch (err) {
    next(err);
  }
}
