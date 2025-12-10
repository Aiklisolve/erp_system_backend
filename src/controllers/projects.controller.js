// src/controllers/projects.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';

const PROJECTS_TABLE = 'projects';

// Helper function to generate project code
function generateProjectCode() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PROJ-${year}-${random}`;
}

// Helper function to format project response
function formatProjectResponse(project) {
  return {
    id: project.id,
    project_code: project.project_code || null,
    name: project.name || project.project_name || null,
    description: project.description || null,
    // Use customer data from join if client fields are null in projects table
    client: project.client || project.customer_name || null,
    client_id: project.client_id || null,
    client_contact_person: project.client_contact_person || project.customer_contact_person || null,
    client_email: project.client_email || project.customer_email || null,
    client_phone: project.client_phone || project.customer_phone || null,
    project_type: project.project_type || null,
    status: project.status || null,
    priority: project.priority || null,
    progress_percentage: project.progress_percentage || null,
    start_date: project.start_date || null,
    end_date: project.end_date || null,
    budget: project.estimated_budget || project.budget ? parseFloat(project.estimated_budget || project.budget) : null,
    currency: project.currency || 'USD', // Not in DB, but keep for API compatibility
    project_manager: project.project_manager || null, // Will need to join with users/erp_users if project_manager_id exists
    project_manager_id: project.project_manager_id || project.manager_id || project.manager_erp_user_id || null,
    manager_id: project.manager_id || project.project_manager_id || project.manager_erp_user_id || null,
    manager_mobile: project.manager_mobile_from_erp || project.manager_phone || null,
    contract_number: project.contract_number || null, // Not in DB, but keep for API compatibility
    created_at: project.created_at || null,
    updated_at: project.updated_at || null
  };
}

// GET /api/v1/projects
export async function listProjects(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const { status, project_type, priority, search } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status.toUpperCase());
      idx++;
    }

    if (project_type) {
      conditions.push(`project_type = $${idx}`);
      params.push(project_type.toUpperCase());
      idx++;
    }

    if (priority) {
      conditions.push(`priority = $${idx}`);
      params.push(priority.toUpperCase());
      idx++;
    }

    if (search) {
      conditions.push(
        `(p.project_code ILIKE $${idx} OR p.name ILIKE $${idx} OR p.project_name ILIKE $${idx} OR p.description ILIKE $${idx} OR c.name ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        p.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.contact_person as customer_contact_person,
        pm.id as manager_id,
        pm.phone as manager_phone,
        pm_eu.mobile as manager_mobile_from_erp,
        pm_eu.id as manager_erp_user_id
      FROM ${PROJECTS_TABLE} p
      LEFT JOIN customers c ON CAST(p.client_id AS TEXT) = CAST(c.id AS TEXT)
      LEFT JOIN users pm ON p.project_manager_id = pm.id
      LEFT JOIN erp_users pm_eu ON pm.erp_user_id = pm_eu.id OR p.project_manager_id = pm_eu.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM ${PROJECTS_TABLE}
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    // Format projects
    const formattedProjects = dataRes.rows.map(formatProjectResponse);

    return res.json({
      success: true,
      data: {
        projects: formattedProjects,
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
      SELECT 
        p.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.contact_person as customer_contact_person,
        pm.id as manager_id,
        pm.phone as manager_phone,
        pm_eu.mobile as manager_mobile_from_erp,
        pm_eu.id as manager_erp_user_id
      FROM ${PROJECTS_TABLE} p
      LEFT JOIN customers c ON CAST(p.client_id AS TEXT) = CAST(c.id AS TEXT)
      LEFT JOIN users pm ON p.project_manager_id = pm.id
      LEFT JOIN erp_users pm_eu ON pm.erp_user_id = pm_eu.id OR p.project_manager_id = pm_eu.id
      WHERE p.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
        error: 'NOT_FOUND'
      });
    }

    const formattedProject = formatProjectResponse(result.rows[0]);

    return res.json({
      success: true,
      data: {
        project: formattedProject
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/projects
export async function createProject(req, res, next) {
  try {
    const body = req.body;

    // Validation: Required fields
    const errors = {};
    if (!body.name) {
      errors.name = 'Project name is required';
    }
    // client_id is optional - if not provided, client name can be used but won't be linked
    // if (!body.client_id && !body.client) {
    //   errors.client_id = 'Client ID or client name is required';
    // }
    if (!body.project_type) {
      errors.project_type = 'Project type is required';
    }
    if (!body.status) {
      errors.status = 'Project status is required';
    }
    if (!body.start_date) {
      errors.start_date = 'Start date is required';
    }
    // Budget is optional in the database (estimated_budget can be null)
    // if (!body.budget) {
    //   errors.budget = 'Budget is required';
    // }

    // Validate budget is a positive number if provided
    if (body.budget !== undefined && (isNaN(body.budget) || parseFloat(body.budget) <= 0)) {
      errors.budget = 'Budget must be a positive number';
    }

    // Validate project_type enum
    const validProjectTypes = ['FIXED_PRICE', 'TIME_MATERIALS', 'HYBRID', 'SUPPORT', 'CONSULTING', 'IMPLEMENTATION', 'OTHER'];
    if (body.project_type && !validProjectTypes.includes(body.project_type.toUpperCase())) {
      errors.project_type = `Project type must be one of: ${validProjectTypes.join(', ')}`;
    }

    // Validate status enum
    const validStatuses = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];
    if (body.status && !validStatuses.includes(body.status.toUpperCase())) {
      errors.status = `Status must be one of: ${validStatuses.join(', ')}`;
    }

    // Validate priority enum if provided
    if (body.priority) {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (!validPriorities.includes(body.priority.toUpperCase())) {
        errors.priority = `Priority must be one of: ${validPriorities.join(', ')}`;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: 'VALIDATION_ERROR',
        details: errors
      });
    }

    // Generate project_code if not provided
    const projectCode = body.project_code || generateProjectCode();

    // Normalize enum values to uppercase
    const projectType = body.project_type.toUpperCase();
    const status = body.status.toUpperCase();
    const priority = body.priority ? body.priority.toUpperCase() : null;

    // Use database column names (support both 'name' and 'project_name')
    const projectName = body.name || body.project_name;

    // Insert project - only include columns that exist in the database
    // Actual columns: estimated_budget (not budget), project_manager_id (not project_manager)
    // No currency or contract_number columns exist
    const insertRes = await query(
      `
      INSERT INTO ${PROJECTS_TABLE} (
        project_code, name, description,
        client_id, project_manager_id,
        project_type, status, priority, progress_percentage,
        start_date, end_date, estimated_budget,
        created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3,
        $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        projectCode,
        projectName,
        body.description || null,
        body.client_id || null,
        body.project_manager_id || null, // Use project_manager_id instead of project_manager
        projectType,
        status,
        priority,
        body.progress_percentage !== undefined ? parseInt(body.progress_percentage) : null,
        body.start_date,
        body.end_date || null,
        body.budget ? parseFloat(body.budget) : null, // Map budget to estimated_budget
        req.user?.user_id || null
      ]
    );

    const formattedProject = formatProjectResponse(insertRes.rows[0]);

    return res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: {
        project: formattedProject
      }
    });
  } catch (err) {
    // Handle unique constraint violation for project_code
    if (err.code === '23505' && err.constraint?.includes('project_code')) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: 'VALIDATION_ERROR',
        details: {
          project_code: 'Project code already exists'
        }
      });
    }
    next(err);
  }
}

// PATCH /api/v1/projects/:id
export async function updateProject(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Validate budget if provided
    if (body.budget !== undefined) {
      if (isNaN(body.budget) || parseFloat(body.budget) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            budget: 'Budget must be a positive number'
          }
        });
      }
    }

    // Validate project_type enum if provided
    if (body.project_type) {
      const validProjectTypes = ['FIXED_PRICE', 'TIME_MATERIALS', 'HYBRID', 'SUPPORT', 'CONSULTING', 'IMPLEMENTATION', 'OTHER'];
      if (!validProjectTypes.includes(body.project_type.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            project_type: `Project type must be one of: ${validProjectTypes.join(', ')}`
          }
        });
      }
    }

    // Validate status enum if provided
    if (body.status) {
      const validStatuses = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];
      if (!validStatuses.includes(body.status.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            status: `Status must be one of: ${validStatuses.join(', ')}`
          }
        });
      }
    }

    // Validate priority enum if provided
    if (body.priority) {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (!validPriorities.includes(body.priority.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: 'VALIDATION_ERROR',
          details: {
            priority: `Priority must be one of: ${validPriorities.join(', ')}`
          }
        });
      }
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let idx = 1;

    if (body.project_code !== undefined) {
      updates.push(`project_code = $${idx}`);
      params.push(body.project_code);
      idx++;
    }

    if (body.name !== undefined || body.project_name !== undefined) {
      const projectName = body.name || body.project_name;
      // Try to update 'name' column, if it doesn't exist, the error will be clear
      updates.push(`name = $${idx}`);
      params.push(projectName);
      idx++;
    }

    if (body.description !== undefined) {
      updates.push(`description = $${idx}`);
      params.push(body.description);
      idx++;
    }

    // Only client_id exists in the database table
    // client, client_contact_person, client_email, client_phone come from customers table via JOIN
    if (body.client_id !== undefined) {
      updates.push(`client_id = $${idx}`);
      params.push(body.client_id);
      idx++;
    }

    if (body.project_type !== undefined) {
      updates.push(`project_type = $${idx}`);
      params.push(body.project_type.toUpperCase());
      idx++;
    }

    if (body.status !== undefined) {
      updates.push(`status = $${idx}`);
      params.push(body.status.toUpperCase());
      idx++;
    }

    if (body.priority !== undefined) {
      updates.push(`priority = $${idx}`);
      params.push(body.priority.toUpperCase());
      idx++;
    }

    if (body.progress_percentage !== undefined) {
      updates.push(`progress_percentage = $${idx}`);
      params.push(parseInt(body.progress_percentage));
      idx++;
    }

    if (body.start_date !== undefined) {
      updates.push(`start_date = $${idx}`);
      params.push(body.start_date);
      idx++;
    }

    if (body.end_date !== undefined) {
      updates.push(`end_date = $${idx}`);
      params.push(body.end_date);
      idx++;
    }

    if (body.budget !== undefined) {
      updates.push(`estimated_budget = $${idx}`);
      params.push(parseFloat(body.budget));
      idx++;
    }

    // currency and contract_number don't exist in the database, skip them
    // if (body.currency !== undefined) {
    //   updates.push(`currency = $${idx}`);
    //   params.push(body.currency);
    //   idx++;
    // }

    if (body.project_manager_id !== undefined) {
      updates.push(`project_manager_id = $${idx}`);
      params.push(body.project_manager_id);
      idx++;
    }

    // contract_number doesn't exist in the database, skip it
    // if (body.contract_number !== undefined) {
    //   updates.push(`contract_number = $${idx}`);
    //   params.push(body.contract_number);
    //   idx++;
    // }

    if (updates.length === 0) {
      // No fields to update, just return the current project
      const currentProject = await query(
        `
        SELECT 
          p.*,
          c.name as customer_name,
          c.email as customer_email,
          c.phone as customer_phone,
          c.contact_person as customer_contact_person,
          pm.id as manager_id,
          pm.mobile as manager_mobile,
          pm_eu.mobile as manager_mobile_from_erp,
          pm_eu.id as manager_erp_user_id
        FROM ${PROJECTS_TABLE} p
        LEFT JOIN customers c ON CAST(p.client_id AS TEXT) = CAST(c.id AS TEXT)
        LEFT JOIN users pm ON p.project_manager_id = pm.id
        LEFT JOIN erp_users pm_eu ON pm.erp_user_id = pm_eu.id OR p.project_manager_id = pm_eu.id
        WHERE p.id = $1
        `,
        [id]
      );

      if (currentProject.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
          error: 'NOT_FOUND'
        });
      }

      const formattedProject = formatProjectResponse(currentProject.rows[0]);
      return res.json({
        success: true,
        message: 'Project updated successfully',
        data: {
          project: formattedProject
        }
      });
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const updateRes = await query(
      `
      UPDATE ${PROJECTS_TABLE}
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      params
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
        error: 'NOT_FOUND'
      });
    }

    // Fetch updated project with joined customer and manager data
    const updatedProject = await query(
      `
      SELECT 
        p.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.contact_person as customer_contact_person,
        pm.id as manager_id,
        pm.phone as manager_phone,
        pm_eu.mobile as manager_mobile_from_erp,
        pm_eu.id as manager_erp_user_id
      FROM ${PROJECTS_TABLE} p
      LEFT JOIN customers c ON CAST(p.client_id AS TEXT) = CAST(c.id AS TEXT)
      LEFT JOIN users pm ON p.project_manager_id = pm.id
      LEFT JOIN erp_users pm_eu ON pm.erp_user_id = pm_eu.id OR p.project_manager_id = pm_eu.id
      WHERE p.id = $1
      `,
      [id]
    );

    const formattedProject = formatProjectResponse(updatedProject.rows[0]);

    return res.json({
      success: true,
      message: 'Project updated successfully',
      data: {
        project: formattedProject
      }
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
      DELETE FROM ${PROJECTS_TABLE}
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (delRes.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
        error: 'NOT_FOUND'
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
// 📌 PROJECT TASKS (keeping existing implementation)
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
