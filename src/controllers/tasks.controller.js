// src/controllers/tasks.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { v4 as uuidv4 } from 'uuid';

const TASKS_TABLE = 'tasks';
const USERS_TABLE = 'users';
const ERP_USERS_TABLE = 'erp_users';

// Helper function to generate task number
function generateTaskNumber() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TSK-${year}-${random}`;
}

// GET /api/v1/tasks
export async function listTasks(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req);
    const {
      status,
      priority,
      task_type,
      assigned_to,
      search
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status && status.toLowerCase() !== 'all') {
      conditions.push(`t.status = $${idx}`);
      params.push(status.toUpperCase());
      idx++;
    }

    if (priority && priority.toLowerCase() !== 'all') {
      conditions.push(`t.priority = $${idx}`);
      params.push(priority.toUpperCase());
      idx++;
    }

    if (task_type && task_type.toLowerCase() !== 'all') {
      conditions.push(`t.task_type = $${idx}`);
      params.push(task_type.toUpperCase());
      idx++;
    }

    if (assigned_to) {
      conditions.push(`t.assigned_to = $${idx}`);
      params.push(assigned_to);
      idx++;
    }

    if (search) {
      conditions.push(
        `(t.title ILIKE $${idx} OR t.description ILIKE $${idx} OR t.task_number ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM ${TASKS_TABLE} t ${where}`,
      params
    );
    const totalItems = countRes.rows[0]?.total || 0;

    // Get tasks with pagination and join with users and erp_users tables
    const tasksRes = await query(
      `
      SELECT 
        t.*,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'full_name', eu.first_name || ' ' || eu.last_name,
          'email', eu.email,
          'username', eu.username,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation
        ) as assigned_to_user,
        json_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'role', u.role,
          'department', u.department
        ) as assigned_by_user
      FROM ${TASKS_TABLE} t
      LEFT JOIN ${ERP_USERS_TABLE} eu ON t.assigned_to = eu.id
      LEFT JOIN ${USERS_TABLE} u ON t.assigned_by = u.id
      ${where}
      ORDER BY COALESCE(t.created_at, t.updated_at, NOW()) DESC, t.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    // Transform response to match documentation format
    const tasks = tasksRes.rows.map(task => ({
      ...task,
      assigned_to: task.assigned_to,
      assigned_to_name: task.assigned_to_user?.full_name || null,
      assigned_to_email: task.assigned_to_user?.email || null,
      assigned_to_role: task.assigned_to_user?.role || null,
      assigned_by_id: task.assigned_by,
      assigned_by: task.assigned_by_user?.full_name || null,
      assigned_by_email: task.assigned_by_user?.email || null,
      assigned_by_role: task.assigned_by_user?.role || null,
      completed_date: task.completion_date || null,
      assigned_to_user: undefined,
      assigned_by_user: undefined
    }));

    return res.json({
      success: true,
      message: 'Tasks retrieved successfully',
      data: {
        tasks,
        pagination: {
          page,
          limit,
          total: totalItems,
          totalPages: Math.ceil(totalItems / limit)
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/tasks/:id
export async function getTaskById(req, res, next) {
  try {
    const { id } = req.params;

    const taskRes = await query(
      `
      SELECT 
        t.*,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'full_name', eu.first_name || ' ' || eu.last_name,
          'email', eu.email,
          'username', eu.username,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation
        ) as assigned_to_user,
        json_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'role', u.role,
          'department', u.department
        ) as assigned_by_user
      FROM ${TASKS_TABLE} t
      LEFT JOIN ${ERP_USERS_TABLE} eu ON t.assigned_to = eu.id
      LEFT JOIN ${USERS_TABLE} u ON t.assigned_by = u.id
      WHERE t.id = $1
      `,
      [id]
    );

    if (taskRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found'
        }
      });
    }

    const task = taskRes.rows[0];
    const transformedTask = {
      ...task,
      assigned_to: task.assigned_to,
      assigned_to_name: task.assigned_to_user?.full_name || null,
      assigned_to_email: task.assigned_to_user?.email || null,
      assigned_to_role: task.assigned_to_user?.role || null,
      assigned_by_id: task.assigned_by,
      assigned_by: task.assigned_by_user?.full_name || null,
      assigned_by_email: task.assigned_by_user?.email || null,
      assigned_by_role: task.assigned_by_user?.role || null,
      completed_date: task.completion_date || null,
      assigned_to_user: undefined,
      assigned_by_user: undefined
    };

    return res.json({
      success: true,
      message: 'Task retrieved successfully',
      data: {
        task: transformedTask
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/tasks
export async function createTask(req, res, next) {
  try {
    const body = req.body;

    // Validate required fields
    const errors = [];
    if (!body.title) errors.push({ field: 'title', message: 'Title is required' });
    if (!body.assigned_to && !body.assigned_to) {
      errors.push({ field: 'assigned_to', message: 'Assigned to ID is required' });
    }
    
    const validTaskTypes = ['BUG', 'FEATURE', 'SUPPORT', 'MAINTENANCE', 'DOCUMENTATION', 'RESEARCH', 'OTHER'];
    if (!body.task_type) {
      errors.push({ field: 'task_type', message: 'Task type is required' });
    } else if (!validTaskTypes.includes(body.task_type.toUpperCase())) {
      errors.push({ field: 'task_type', message: `Task type must be one of: ${validTaskTypes.join(', ')}` });
    }
    
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!body.priority) {
      errors.push({ field: 'priority', message: 'Priority is required' });
    } else if (!validPriorities.includes(body.priority.toUpperCase())) {
      errors.push({ field: 'priority', message: `Priority must be one of: ${validPriorities.join(', ')}` });
    }
    
    const validStatuses = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
    if (!body.status) {
      errors.push({ field: 'status', message: 'Status is required' });
    } else if (!validStatuses.includes(body.status.toUpperCase())) {
      errors.push({ field: 'status', message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors
        }
      });
    }

    // Generate task number if not provided
    const taskNumber = body.task_number || generateTaskNumber();

    // Normalize enum values to uppercase
    const taskType = body.task_type.toUpperCase();
    const priority = body.priority.toUpperCase();
    const status = body.status.toUpperCase();

    // Get assigned_to user details from erp_users if assigned_to is provided
    const assignedToId = body.assigned_to || null;
    const assignedById = body.assigned_by || null;

    // Validate assigned_to exists in erp_users table (foreign key references erp_users.id)
    if (assignedToId) {
      const erpUserCheck = await query(
        `SELECT id FROM ${ERP_USERS_TABLE} WHERE id = $1`,
        [assignedToId]
      );
      
      if (erpUserCheck.rows.length === 0) {
        // Check if user exists in users table and has an erp_user_id
        const userCheck = await query(
          `SELECT id, erp_user_id FROM ${USERS_TABLE} WHERE id = $1`,
          [assignedToId]
        );
        
        if (userCheck.rows.length > 0) {
          const user = userCheck.rows[0];
          if (user.erp_user_id) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [{
                  field: 'assigned_to',
                  message: `User with ID ${assignedToId} exists in users table but assigned_to must reference erp_users table. Please use erp_user_id: ${user.erp_user_id} instead.`
                }]
              }
            });
          } else {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [{
                  field: 'assigned_to',
                  message: `User with ID ${assignedToId} exists in users table but has no erp_user_id. assigned_to must reference erp_users table.`
                }]
              }
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [{
              field: 'assigned_to',
              message: `User with ID ${assignedToId} does not exist in erp_users table`
            }]
          }
        });
      }
    }

    // Validate assigned_by exists in users table if provided
    if (assignedById) {
      const assignedByCheck = await query(
        `SELECT id FROM ${USERS_TABLE} WHERE id = $1`,
        [assignedById]
      );
      if (assignedByCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [{
              field: 'assigned_by',
              message: `User with ID ${assignedById} does not exist in users table`
            }]
          }
        });
      }
    }

    const insertRes = await query(
      `
      INSERT INTO ${TASKS_TABLE} (
        task_number, title, description, task_type, priority, status,
        assigned_to, assigned_by, start_date, due_date,
        completion_date, progress_percentage, estimated_hours, actual_hours,
        tags, notes, attachments, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        taskNumber,
        body.title,
        body.description || null,
        taskType,
        priority,
        status,
        assignedToId || null,
        assignedById || null,
        body.start_date || null,
        body.due_date || null,
        body.completed_date || body.completion_date || null,
        body.progress_percentage || 0,
        body.estimated_hours || null,
        body.actual_hours || null,
        Array.isArray(body.tags) ? body.tags : null,
        body.notes || null,
        body.attachments ? (typeof body.attachments === 'string' ? JSON.parse(body.attachments) : body.attachments) : null
      ]
    );

    const task = insertRes.rows[0];

    // Get full task with related user data
    const fullTaskRes = await query(
      `
      SELECT 
        t.*,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'full_name', eu.first_name || ' ' || eu.last_name,
          'email', eu.email,
          'username', eu.username,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation
        ) as assigned_to_user,
        json_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'role', u.role,
          'department', u.department
        ) as assigned_by_user
      FROM ${TASKS_TABLE} t
      LEFT JOIN ${ERP_USERS_TABLE} eu ON t.assigned_to = eu.id
      LEFT JOIN ${USERS_TABLE} u ON t.assigned_by = u.id
      WHERE t.id = $1
      `,
      [task.id]
    );

    const fullTask = fullTaskRes.rows[0];
    const transformedTask = {
      ...fullTask,
      assigned_to: fullTask.assigned_to,
      assigned_to_name: fullTask.assigned_to_user?.full_name || null,
      assigned_to_email: fullTask.assigned_to_user?.email || null,
      assigned_to_role: fullTask.assigned_to_user?.role || null,
      assigned_by_id: fullTask.assigned_by,
      assigned_by: fullTask.assigned_by_user?.full_name || null,
      assigned_by_email: fullTask.assigned_by_user?.email || null,
      assigned_by_role: fullTask.assigned_by_user?.role || null,
      completed_date: fullTask.completion_date || null,
      assigned_to_user: undefined,
      assigned_by_user: undefined
    };

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: {
        task: transformedTask
      }
    });
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_TASK_NUMBER',
          message: 'Task number already exists'
        }
      });
    }
    next(err);
  }
}

// PATCH /api/v1/tasks/:id
export async function updateTask(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if task exists
    const existingRes = await query(
      `SELECT * FROM ${TASKS_TABLE} WHERE id = $1`,
      [id]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found'
        }
      });
    }

    const existing = existingRes.rows[0];

    // Build dynamic update query
    const updates = [];
    const params = [];
    let idx = 1;

    // Validate enum values if provided
    if (body.task_type) {
      const validTaskTypes = ['BUG', 'FEATURE', 'SUPPORT', 'MAINTENANCE', 'DOCUMENTATION', 'RESEARCH', 'OTHER'];
      if (!validTaskTypes.includes(body.task_type.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Task type must be one of: ${validTaskTypes.join(', ')}`
          }
        });
      }
      updates.push(`task_type = $${idx}`);
      params.push(body.task_type.toUpperCase());
      idx++;
    }

    if (body.priority) {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(body.priority.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Priority must be one of: ${validPriorities.join(', ')}`
          }
        });
      }
      updates.push(`priority = $${idx}`);
      params.push(body.priority.toUpperCase());
      idx++;
    }

    if (body.status) {
      const validStatuses = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
      if (!validStatuses.includes(body.status.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Status must be one of: ${validStatuses.join(', ')}`
          }
        });
      }
      updates.push(`status = $${idx}`);
      params.push(body.status.toUpperCase());
      idx++;
    }

    // Validate assigned_to exists in erp_users table if being updated (foreign key references erp_users.id)
    if (body.assigned_to !== undefined && body.assigned_to !== null) {
      const erpUserCheck = await query(
        `SELECT id FROM ${ERP_USERS_TABLE} WHERE id = $1`,
        [body.assigned_to]
      );
      
      if (erpUserCheck.rows.length === 0) {
        // Check if user exists in users table and has an erp_user_id
        const userCheck = await query(
          `SELECT id, erp_user_id FROM ${USERS_TABLE} WHERE id = $1`,
          [body.assigned_to]
        );
        
        if (userCheck.rows.length > 0) {
          const user = userCheck.rows[0];
          if (user.erp_user_id) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [{
                  field: 'assigned_to',
                  message: `User with ID ${body.assigned_to} exists in users table but assigned_to must reference erp_users table. Please use erp_user_id: ${user.erp_user_id} instead.`
                }]
              }
            });
          } else {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [{
                  field: 'assigned_to',
                  message: `User with ID ${body.assigned_to} exists in users table but has no erp_user_id. assigned_to must reference erp_users table.`
                }]
              }
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [{
              field: 'assigned_to',
              message: `User with ID ${body.assigned_to} does not exist in erp_users table`
            }]
          }
        });
      }
    }

    // Validate assigned_by exists in users table if being updated
    if (body.assigned_by !== undefined && body.assigned_by !== null) {
      const assignedByCheck = await query(
        `SELECT id FROM ${USERS_TABLE} WHERE id = $1`,
        [body.assigned_by]
      );
      if (assignedByCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [{
              field: 'assigned_by',
              message: `User with ID ${body.assigned_by} does not exist in users table`
            }]
          }
        });
      }
    }

    // Handle other fields - map API field names to database column names
    const fieldMapping = {
      'task_number': 'task_number',
      'title': 'title',
      'description': 'description',
    //   'assigned_to_id': 'assigned_to',  // Map API field to DB column
      'assigned_to': 'assigned_to',
      'assigned_by_id': 'assigned_by',  // Map API field to DB column
      'assigned_by': 'assigned_by',
      'start_date': 'start_date',
      'due_date': 'due_date',
      'completed_date': 'completion_date',  // Map API field to DB column
      'completion_date': 'completion_date',
      'progress_percentage': 'progress_percentage',
      'estimated_hours': 'estimated_hours',
      'actual_hours': 'actual_hours',
      'tags': 'tags',
      'notes': 'notes',
      'attachments': 'attachments'
    };

    Object.keys(fieldMapping).forEach(apiField => {
      if (body[apiField] !== undefined) {
        const dbField = fieldMapping[apiField];
        if (dbField === 'tags') {
          updates.push(`${dbField} = $${idx}`);
          params.push(Array.isArray(body[apiField]) ? body[apiField] : null);
        } else if (dbField === 'attachments') {
          updates.push(`${dbField} = $${idx}`);
          params.push(body[apiField] ? (typeof body[apiField] === 'string' ? JSON.parse(body[apiField]) : body[apiField]) : null);
        } else {
          updates.push(`${dbField} = $${idx}`);
          params.push(body[apiField]);
        }
        idx++;
      }
    });

    if (updates.length === 0) {
      // Return existing task even if no updates
      const fullTaskRes = await query(
        `
        SELECT 
          t.*,
          json_build_object(
            'id', eu.id,
            'employee_number', eu.employee_number,
            'first_name', eu.first_name,
            'last_name', eu.last_name,
            'full_name', eu.first_name || ' ' || eu.last_name,
            'email', eu.email,
            'username', eu.username,
            'role', eu.role,
            'department', eu.department,
            'designation', eu.designation
          ) as assigned_to_user,
          json_build_object(
            'id', u.id,
            'full_name', u.full_name,
            'email', u.email,
            'role', u.role,
            'department', u.department
          ) as assigned_by_user
        FROM ${TASKS_TABLE} t
        LEFT JOIN ${ERP_USERS_TABLE} eu ON t.assigned_to = eu.id
        LEFT JOIN ${USERS_TABLE} u ON t.assigned_by = u.id
        WHERE t.id = $1
        `,
        [id]
      );

      const fullTask = fullTaskRes.rows[0];
      const transformedTask = {
        ...fullTask,
        assigned_to: fullTask.assigned_to,
        assigned_to_name: fullTask.assigned_to_user?.full_name || null,
        assigned_to_email: fullTask.assigned_to_user?.email || null,
        assigned_to_role: fullTask.assigned_to_user?.role || null,
        assigned_by_id: fullTask.assigned_by,
        assigned_by: fullTask.assigned_by_user?.full_name || null,
        assigned_by_email: fullTask.assigned_by_user?.email || null,
        assigned_by_role: fullTask.assigned_by_user?.role || null,
        completed_date: fullTask.completion_date || null,
        assigned_to_user: undefined,
        assigned_by_user: undefined
      };

      return res.json({
        success: true,
        message: 'No changes to update',
        data: {
          task: transformedTask
        }
      });
    }

    // Update updated_at
    updates.push(`updated_at = NOW()`);
    params.push(id);

    await query(
      `UPDATE ${TASKS_TABLE} SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    // Get updated task with related user data
    const fullTaskRes = await query(
      `
      SELECT 
        t.*,
        json_build_object(
          'id', eu.id,
          'employee_number', eu.employee_number,
          'first_name', eu.first_name,
          'last_name', eu.last_name,
          'full_name', eu.first_name || ' ' || eu.last_name,
          'email', eu.email,
          'username', eu.username,
          'role', eu.role,
          'department', eu.department,
          'designation', eu.designation
        ) as assigned_to_user,
        json_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'role', u.role,
          'department', u.department
        ) as assigned_by_user
      FROM ${TASKS_TABLE} t
      LEFT JOIN ${ERP_USERS_TABLE} eu ON t.assigned_to = eu.id
      LEFT JOIN ${USERS_TABLE} u ON t.assigned_by = u.id
      WHERE t.id = $1
      `,
      [id]
    );

    const fullTask = fullTaskRes.rows[0];
    const transformedTask = {
      ...fullTask,
      assigned_to: fullTask.assigned_to,
      assigned_to_name: fullTask.assigned_to_user?.full_name || null,
      assigned_to_email: fullTask.assigned_to_user?.email || null,
      assigned_to_role: fullTask.assigned_to_user?.role || null,
      assigned_by_id: fullTask.assigned_by,
      assigned_by: fullTask.assigned_by_user?.full_name || null,
      assigned_by_email: fullTask.assigned_by_user?.email || null,
      assigned_by_role: fullTask.assigned_by_user?.role || null,
      completed_date: fullTask.completion_date || null,
      assigned_to_user: undefined,
      assigned_by_user: undefined
    };

    return res.json({
      success: true,
      message: 'Task updated successfully',
      data: {
        task: transformedTask
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_TASK_NUMBER',
          message: 'Task number already exists'
        }
      });
    }
    next(err);
  }
}

// DELETE /api/v1/tasks/:id
export async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;

    const deleteRes = await query(
      `DELETE FROM ${TASKS_TABLE} WHERE id = $1 RETURNING id`,
      [id]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found'
        }
      });
    }

    return res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

