// src/controllers/workforce.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { v4 as uuidv4 } from 'uuid';

//
// 👥 WORKFORCE CONTROLLER
//

// Helper function to generate shift number
function generateShiftNumber() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SHF-${year}-${random}`;
}

// Helper function to calculate total hours
function calculateTotalHours(startTime, endTime, breakMinutes = 0) {
  if (!startTime || !endTime) return null;
  
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;
  
  const totalMinutes = endTotalMinutes - startTotalMinutes - breakMinutes;
  return totalMinutes > 0 ? parseFloat((totalMinutes / 60).toFixed(2)) : 0;
}

// Helper function to calculate time difference in minutes
function calculateTimeDifferenceInMinutes(time1, time2) {
  if (!time1 || !time2) return null;
  
  const [hour1, min1] = time1.split(':').map(Number);
  const [hour2, min2] = time2.split(':').map(Number);
  
  const totalMinutes1 = hour1 * 60 + min1;
  const totalMinutes2 = hour2 * 60 + min2;
  
  return totalMinutes2 - totalMinutes1;
}

// Helper function to calculate total pay
function calculateTotalPay(totalHours, hourlyRate, overtimeHours = null, overtimeRate = null) {
  if (!totalHours || !hourlyRate) return null;
  
  let pay = totalHours * hourlyRate;
  
  if (overtimeHours && overtimeRate) {
    pay += overtimeHours * overtimeRate;
  } else if (overtimeHours && hourlyRate) {
    // Default overtime rate is 1.5x hourly rate
    pay += overtimeHours * (hourlyRate * 1.5);
  }
  
  return parseFloat(pay.toFixed(2));
}

// Helper function to calculate attendance status
function calculateAttendanceStatus(startTime, clockInTime, endTime, clockOutTime) {
  if (!clockInTime) return null;
  
  if (clockInTime > startTime) {
    return 'LATE';
  } else if (clockOutTime && clockOutTime < endTime) {
    return 'EARLY_LEAVE';
  } else if (clockInTime <= startTime) {
    return 'ON_TIME';
  }
  
  return 'PRESENT';
}

// GET /api/v1/workforce/shifts
export async function listShifts(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 100, 100);
    const {
      status,
      shift_type,
      department,
      employee_id,
      employee_name,
      start_date,
      end_date,
      is_overtime,
      attendance_status
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (status && status.toLowerCase() !== 'all') {
      conditions.push(`UPPER(s.status) = UPPER($${idx})`);
      params.push(status);
      idx++;
    }

    if (shift_type) {
      conditions.push(`UPPER(s.shift_type) = UPPER($${idx})`);
      params.push(shift_type);
      idx++;
    }

    if (department) {
      conditions.push(`UPPER(s.department) = UPPER($${idx})`);
      params.push(department);
      idx++;
    }

    if (employee_id) {
      conditions.push(`s.employee_id = $${idx}`);
      params.push(employee_id);
      idx++;
    }

    if (employee_name) {
      conditions.push(`s.employee_name ILIKE $${idx}`);
      params.push(`%${employee_name}%`);
      idx++;
    }

    if (start_date) {
      conditions.push(`s.date >= $${idx}`);
      params.push(start_date);
      idx++;
    }

    if (end_date) {
      conditions.push(`s.date <= $${idx}`);
      params.push(end_date);
      idx++;
    }

    if (is_overtime !== undefined) {
      conditions.push(`s.is_overtime = $${idx}`);
      params.push(is_overtime === 'true');
      idx++;
    }

    if (attendance_status) {
      conditions.push(`UPPER(s.attendance_status) = UPPER($${idx})`);
      params.push(attendance_status);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRes = await query(
      `SELECT COUNT(*) as total FROM shifts s ${where}`,
      params
    );
    const totalItems = parseInt(countRes.rows[0].total, 10);

    // Get shifts with pagination
    const shiftsRes = await query(
      `
      SELECT 
        s.*,
        COALESCE(s.total_hours, 
          CASE 
            WHEN s.start_time IS NOT NULL AND s.end_time IS NOT NULL 
            THEN (EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0) - (COALESCE(s.break_duration_minutes, 0) / 60.0)
            ELSE NULL
          END
        ) as calculated_total_hours
      FROM shifts s
      ${where}
      ORDER BY s.date DESC, s.start_time DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        shifts: shiftsRes.rows,
        pagination: buildPaginationMeta(page, limit, totalItems)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/workforce/shifts/:id
export async function getShiftById(req, res, next) {
  try {
    const { id } = req.params;

    const shiftRes = await query(
      `
      SELECT 
        s.*,
        COALESCE(s.total_hours, 
          CASE 
            WHEN s.start_time IS NOT NULL AND s.end_time IS NOT NULL 
            THEN (EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0) - (COALESCE(s.break_duration_minutes, 0) / 60.0)
            ELSE NULL
          END
        ) as calculated_total_hours
      FROM shifts s
      WHERE s.id = $1
      `,
      [id]
    );

    if (shiftRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const shift = shiftRes.rows[0];
    
    // Ensure erp_role and department are explicitly included in the response
    // This helps frontend dropdowns to properly display selected values
    // Preserve the actual values from database (including empty strings if any)
    const responseData = {
      ...shift,
      // Explicitly include erp_role and department to ensure they're always present
      erp_role: shift.erp_role !== undefined ? shift.erp_role : null,
      department: shift.department !== undefined ? shift.department : null
    };

    return res.json({
      success: true,
      data: {
        shift: responseData
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/workforce/shifts
export async function createShift(req, res, next) {
  try {
    const body = req.body;

    // Validate required fields
    if (!body.employee_name || !body.date || !body.start_time || !body.end_time || !body.shift_type || !body.status) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: {
          employee_name: !body.employee_name ? 'Employee name is required' : undefined,
          date: !body.date ? 'Date is required (YYYY-MM-DD format)' : undefined,
          start_time: !body.start_time ? 'Start time is required (HH:mm format)' : undefined,
          end_time: !body.end_time ? 'End time is required (HH:mm format)' : undefined,
          shift_type: !body.shift_type ? 'Shift type is required' : undefined,
          status: !body.status ? 'Status is required' : undefined
        }
      });
    }

    // Generate ID and shift number
    const shiftId = uuidv4();
    const shiftNumber = body.shift_number || generateShiftNumber();

    // Normalize department to uppercase (required by database constraint)
    // Map common variations to allowed values
    const departmentMapping = {
      'PROJECTS': 'OTHER',
      'PROJECT': 'OTHER',
      'PROJECT_MANAGEMENT': 'OTHER',
      'MANAGEMENT': 'ADMINISTRATION',
      'ADMIN': 'ADMINISTRATION',
      'CUSTOMER SUPPORT': 'CUSTOMER_SERVICE',
      'SUPPORT': 'CUSTOMER_SERVICE',
      'CUSTOMER SUPPORT': 'CUSTOMER_SERVICE'
    };
    
    let normalizedDepartment = body.department ? String(body.department).toUpperCase().trim() : null;
    
    // Apply mapping if exists
    if (normalizedDepartment && departmentMapping[normalizedDepartment]) {
      normalizedDepartment = departmentMapping[normalizedDepartment];
    }
    
    // Validate department value against allowed values
    const allowedDepartments = [
      'IT', 'FINANCE', 'OPERATIONS', 'SALES', 'HR', 'WAREHOUSE',
      'PROCUREMENT', 'MANUFACTURING', 'CUSTOMER_SERVICE', 'ADMINISTRATION', 'OTHER'
    ];
    
    if (normalizedDepartment && !allowedDepartments.includes(normalizedDepartment)) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: {
          department: `Department "${body.department}" is not valid. Must be one of: ${allowedDepartments.join(', ')}. Note: "Projects" maps to "OTHER".`
        }
      });
    }

    // Normalize status and shift_type to uppercase
    const normalizedStatus = body.status ? String(body.status).toUpperCase() : null;
    const normalizedShiftType = body.shift_type ? String(body.shift_type).toUpperCase() : null;

    // Normalize erp_role to uppercase if provided (similar to department)
    const normalizedErpRole = body.erp_role ? String(body.erp_role).toUpperCase().trim() : null;

    // Calculate total hours
    const totalHours = body.total_hours || calculateTotalHours(
      body.start_time,
      body.end_time,
      body.break_duration_minutes || 0
    );

    // Calculate total pay if hourly_rate is provided
    let totalPay = body.total_pay;
    if (!totalPay && totalHours && body.hourly_rate) {
      totalPay = calculateTotalPay(
        totalHours,
        body.hourly_rate,
        body.overtime_hours,
        body.overtime_rate
      );
    }

    // Handle arrays
    const assignedTasks = Array.isArray(body.assigned_tasks) ? body.assigned_tasks : 
                         (body.assigned_tasks ? [body.assigned_tasks] : null);
    const tags = Array.isArray(body.tags) ? body.tags : 
                (body.tags ? [body.tags] : null);

    const insertRes = await query(
      `
      INSERT INTO shifts (
        id,
        shift_number,
        employee_id,
        employee_name,
        employee_email,
        date,
        start_time,
        end_time,
        break_duration_minutes,
        total_hours,
        erp_role,
        department,
        location,
        shift_type,
        status,
        is_overtime,
        scheduled_by,
        approved_by,
        approval_date,
        clock_in_time,
        clock_out_time,
        actual_hours,
        attendance_status,
        late_minutes,
        early_leave_minutes,
        assigned_tasks,
        task_completion_rate,
        performance_rating,
        quality_score,
        hourly_rate,
        total_pay,
        overtime_hours,
        overtime_rate,
        currency,
        notes,
        internal_notes,
        tags,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39
      )
      RETURNING *
      `,
      [
        shiftId,
        shiftNumber,
        body.employee_id || null,
        body.employee_name,
        body.employee_email || null,
        body.date,
        body.start_time,
        body.end_time,
        body.break_duration_minutes || 0,
        totalHours,
        normalizedErpRole,
        normalizedDepartment,
        body.location || null,
        normalizedShiftType,
        normalizedStatus,
        body.is_overtime || false,
        body.scheduled_by || null,
        body.approved_by || null,
        body.approval_date || null,
        body.clock_in_time || null,
        body.clock_out_time || null,
        body.actual_hours || null,
        body.attendance_status || null,
        body.late_minutes || null,
        body.early_leave_minutes || null,
        assignedTasks,
        body.task_completion_rate || null,
        body.performance_rating || null,
        body.quality_score || null,
        body.hourly_rate || null,
        totalPay,
        body.overtime_hours || null,
        body.overtime_rate || null,
        body.currency || 'USD',
        body.notes || null,
        body.internal_notes || null,
        tags,
        new Date(),
        new Date()
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Shift created successfully',
      data: {
        shift: insertRes.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'Shift number already exists'
      });
    }
    next(err);
  }
}

// PUT /api/v1/workforce/shifts/:id
export async function updateShift(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body;

    // Check if shift exists
    const existingRes = await query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const existing = existingRes.rows[0];

    // Validate required fields - use provided values or existing values
    const employee_name = body.employee_name !== undefined ? body.employee_name : existing.employee_name;
    const date = body.date !== undefined ? body.date : existing.date;
    const start_time = body.start_time !== undefined ? body.start_time : existing.start_time;
    const end_time = body.end_time !== undefined ? body.end_time : existing.end_time;
    const shift_type = body.shift_type !== undefined ? body.shift_type : existing.shift_type;
    const status = body.status !== undefined ? body.status : existing.status;

    // Validate required fields
    const errors = {};
    if (!employee_name || employee_name.trim() === '') {
      errors.employee_name = 'Employee name is required';
    }
    if (!date) {
      errors.date = 'Date is required (YYYY-MM-DD format)';
    }
    if (!start_time) {
      errors.start_time = 'Start time is required (HH:mm format)';
    }
    if (!end_time) {
      errors.end_time = 'End time is required (HH:mm format)';
    }
    if (!shift_type) {
      errors.shift_type = 'Shift type is required';
    }
    if (!status) {
      errors.status = 'Status is required';
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation error: Missing required fields',
        errors: errors
      });
    }

    // Normalize department, status, and shift_type to uppercase
    // Normalize shift_type and status to uppercase
    const normalizedShiftType = shift_type ? String(shift_type).toUpperCase() : null;
    const normalizedStatus = status ? String(status).toUpperCase() : null;
    
    // Normalize erp_role to uppercase if provided (similar to department)
    let normalizedErpRole = null;
    if (body.erp_role !== undefined) {
      if (body.erp_role === '' || body.erp_role === null) {
        normalizedErpRole = null;
      } else {
        normalizedErpRole = String(body.erp_role).toUpperCase().trim();
      }
    }
    
    // Normalize department, status, and shift_type to uppercase if provided
    // Use validated values for required fields
    const normalizedBody = { 
      ...body,
      employee_name: employee_name.trim(),
      date,
      start_time,
      end_time,
      shift_type: normalizedShiftType,
      status: normalizedStatus
    };
    
    // Explicitly handle erp_role if provided
    if (body.erp_role !== undefined) {
      normalizedBody.erp_role = normalizedErpRole;
    }
    
    if (body.department !== undefined) {
      // Map common variations to allowed values
      const departmentMapping = {
        'PROJECTS': 'OTHER',
        'PROJECT': 'OTHER',
        'PROJECT_MANAGEMENT': 'OTHER',
        'MANAGEMENT': 'ADMINISTRATION',
        'ADMIN': 'ADMINISTRATION',
        'CUSTOMER SUPPORT': 'CUSTOMER_SERVICE',
        'SUPPORT': 'CUSTOMER_SERVICE'
      };
      
      let normalizedDept = String(body.department).toUpperCase().trim();
      
      // Apply mapping if exists
      if (departmentMapping[normalizedDept]) {
        normalizedDept = departmentMapping[normalizedDept];
      }
      
      // Validate department value
      const allowedDepartments = [
        'IT', 'FINANCE', 'OPERATIONS', 'SALES', 'HR', 'WAREHOUSE',
        'PROCUREMENT', 'MANUFACTURING', 'CUSTOMER_SERVICE', 'ADMINISTRATION', 'OTHER'
      ];
      
      if (!allowedDepartments.includes(normalizedDept)) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: {
            department: `Department "${body.department}" is not valid. Must be one of: ${allowedDepartments.join(', ')}. Note: "Projects" maps to "OTHER".`
          }
        });
      }
      
      normalizedBody.department = normalizedDept;
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let idx = 1;

    // Handle all possible fields (excluding total_hours, total_pay, attendance_status, late_minutes, early_leave_minutes, actual_hours - handled separately)
    const fields = [
      'shift_number', 'employee_id', 'employee_name', 'employee_email',
      'date', 'start_time', 'end_time', 'break_duration_minutes',
      'erp_role', 'department', 'location',
      'shift_type', 'status', 'is_overtime', 'scheduled_by', 'approved_by',
      'approval_date', 'clock_in_time', 'clock_out_time',
      'task_completion_rate', 'performance_rating', 'quality_score',
      'hourly_rate', 'overtime_hours', 'overtime_rate',
      'currency', 'notes', 'internal_notes'
    ];

    fields.forEach(field => {
      if (normalizedBody[field] !== undefined) {
        // For erp_role and department, preserve existing value if empty string is sent
        // This prevents accidentally clearing these fields when frontend sends empty values
        if ((field === 'erp_role' || field === 'department') && normalizedBody[field] === '') {
          // Skip updating - preserve existing value
          return;
        }
        updates.push(`${field} = $${idx}`);
        params.push(normalizedBody[field]);
        idx++;
      }
    });

    // Handle arrays
    if (body.assigned_tasks !== undefined) {
      const assignedTasks = Array.isArray(body.assigned_tasks) ? body.assigned_tasks : 
                           (body.assigned_tasks ? [body.assigned_tasks] : null);
      updates.push(`assigned_tasks = $${idx}`);
      params.push(assignedTasks);
      idx++;
    }

    if (body.tags !== undefined) {
      const tags = Array.isArray(body.tags) ? body.tags : 
                  (body.tags ? [body.tags] : null);
      updates.push(`tags = $${idx}`);
      params.push(tags);
      idx++;
    }

    // Handle total_hours: If explicitly provided, use it. Otherwise, recalculate if time fields changed.
    if (body.total_hours !== undefined) {
      // User explicitly provided total_hours, use it
      updates.push(`total_hours = $${idx}`);
      params.push(body.total_hours);
      idx++;
    } else if (body.start_time !== undefined || body.end_time !== undefined || body.break_duration_minutes !== undefined) {
      // Recalculate total_hours if start_time, end_time, or break_duration_minutes changed
      const startTime = body.start_time || existing.start_time;
      const endTime = body.end_time || existing.end_time;
      const breakMinutes = body.break_duration_minutes !== undefined ? body.break_duration_minutes : existing.break_duration_minutes || 0;
      
      if (startTime && endTime) {
        const calculatedHours = calculateTotalHours(startTime, endTime, breakMinutes);
        updates.push(`total_hours = $${idx}`);
        params.push(calculatedHours);
        idx++;
      }
    }

    // Handle total_pay: If explicitly provided, use it. Otherwise, recalculate if relevant fields changed.
    if (body.total_pay !== undefined) {
      // User explicitly provided total_pay, use it
      updates.push(`total_pay = $${idx}`);
      params.push(body.total_pay);
      idx++;
    } else if (body.hourly_rate !== undefined || body.overtime_hours !== undefined || body.overtime_rate !== undefined || 
        body.start_time !== undefined || body.end_time !== undefined || body.break_duration_minutes !== undefined ||
        body.total_hours !== undefined) {
      // Recalculate total_pay if relevant fields changed
      // Determine which total_hours to use for calculation
      let totalHoursForPay = null;
      
      if (body.total_hours !== undefined) {
        // Use provided total_hours
        totalHoursForPay = body.total_hours;
      } else if (body.start_time !== undefined || body.end_time !== undefined || body.break_duration_minutes !== undefined) {
        // Calculate from time fields
        const startTime = body.start_time || existing.start_time;
        const endTime = body.end_time || existing.end_time;
        const breakMinutes = body.break_duration_minutes !== undefined ? body.break_duration_minutes : existing.break_duration_minutes || 0;
        if (startTime && endTime) {
          totalHoursForPay = calculateTotalHours(startTime, endTime, breakMinutes);
        }
      } else {
        // Use existing total_hours
        totalHoursForPay = existing.total_hours;
      }
      
      const hourlyRate = body.hourly_rate !== undefined ? body.hourly_rate : existing.hourly_rate;
      const overtimeHours = body.overtime_hours !== undefined ? body.overtime_hours : existing.overtime_hours;
      const overtimeRate = body.overtime_rate !== undefined ? body.overtime_rate : existing.overtime_rate;
      
      if (totalHoursForPay && hourlyRate) {
        const calculatedPay = calculateTotalPay(totalHoursForPay, hourlyRate, overtimeHours, overtimeRate);
        updates.push(`total_pay = $${idx}`);
        params.push(calculatedPay);
        idx++;
      }
    }

    // Handle attendance_status, late_minutes, early_leave_minutes: If explicitly provided, use them. Otherwise, recalculate if clock times changed.
    if (body.attendance_status !== undefined) {
      // User explicitly provided attendance_status, use it
      updates.push(`attendance_status = $${idx}`);
      params.push(body.attendance_status);
      idx++;
    } else if (body.clock_in_time !== undefined || body.clock_out_time !== undefined) {
      // Auto-calculate attendance_status if clock_in_time or clock_out_time changed
      const clockInTime = body.clock_in_time || existing.clock_in_time;
      const clockOutTime = body.clock_out_time || existing.clock_out_time;
      const startTime = body.start_time || existing.start_time;
      const endTime = body.end_time || existing.end_time;

      if (clockInTime && startTime) {
        const attendanceStatus = calculateAttendanceStatus(startTime, clockInTime, endTime, clockOutTime);
        updates.push(`attendance_status = $${idx}`);
        params.push(attendanceStatus);
        idx++;
      }
    }

    // Handle late_minutes: If explicitly provided, use it. Otherwise, recalculate if clock_in_time changed.
    if (body.late_minutes !== undefined) {
      // User explicitly provided late_minutes, use it
      updates.push(`late_minutes = $${idx}`);
      params.push(body.late_minutes);
      idx++;
    } else if (body.clock_in_time !== undefined) {
      // Auto-calculate late_minutes if clock_in_time changed
      const clockInTime = body.clock_in_time;
      const startTime = body.start_time || existing.start_time;

      if (clockInTime && startTime && clockInTime > startTime) {
        const lateMinutes = calculateTimeDifferenceInMinutes(startTime, clockInTime);
        updates.push(`late_minutes = $${idx}`);
        params.push(lateMinutes);
        idx++;
      } else if (clockInTime && startTime && clockInTime <= startTime) {
        // If on time or early, set late_minutes to null
        updates.push(`late_minutes = $${idx}`);
        params.push(null);
        idx++;
      }
    }

    // Handle early_leave_minutes: If explicitly provided, use it. Otherwise, recalculate if clock_out_time changed.
    if (body.early_leave_minutes !== undefined) {
      // User explicitly provided early_leave_minutes, use it
      updates.push(`early_leave_minutes = $${idx}`);
      params.push(body.early_leave_minutes);
      idx++;
    } else if (body.clock_out_time !== undefined) {
      // Auto-calculate early_leave_minutes if clock_out_time changed
      const clockOutTime = body.clock_out_time;
      const endTime = body.end_time || existing.end_time;

      if (clockOutTime && endTime && clockOutTime < endTime) {
        const earlyLeaveMinutes = calculateTimeDifferenceInMinutes(clockOutTime, endTime);
        updates.push(`early_leave_minutes = $${idx}`);
        params.push(earlyLeaveMinutes);
        idx++;
      } else if (clockOutTime && endTime && clockOutTime >= endTime) {
        // If on time or late, set early_leave_minutes to null
        updates.push(`early_leave_minutes = $${idx}`);
        params.push(null);
        idx++;
      }
    }

    // Handle actual_hours: If explicitly provided, use it. Otherwise, recalculate if clock times changed.
    if (body.actual_hours !== undefined) {
      // User explicitly provided actual_hours, use it
      updates.push(`actual_hours = $${idx}`);
      params.push(body.actual_hours);
      idx++;
    } else if (body.clock_in_time !== undefined || body.clock_out_time !== undefined) {
      // Calculate actual_hours if both clock_in and clock_out are present
      const clockInTime = body.clock_in_time || existing.clock_in_time;
      const clockOutTime = body.clock_out_time || existing.clock_out_time;
      
      if (clockInTime && clockOutTime) {
        const breakMinutes = body.break_duration_minutes !== undefined ? body.break_duration_minutes : existing.break_duration_minutes || 0;
        const actualHours = calculateTotalHours(clockInTime, clockOutTime, breakMinutes);
        updates.push(`actual_hours = $${idx}`);
        params.push(actualHours);
        idx++;
      }
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No changes to update',
        data: {
          shift: existing
        }
      });
    }

    // Update updated_at
    updates.push(`updated_at = $${idx}`);
    params.push(new Date());
    idx++;

    params.push(id);

    const updateRes = await query(
      `UPDATE shifts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    return res.json({
      success: true,
      message: 'Shift updated successfully',
      data: {
        shift: updateRes.rows[0]
      }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Shift number already exists'
      });
    }
    next(err);
  }
}

// DELETE /api/v1/workforce/shifts/:id
export async function deleteShift(req, res, next) {
  try {
    const { id } = req.params;

    const deleteRes = await query('DELETE FROM shifts WHERE id = $1 RETURNING id', [id]);

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    return res.json({
      success: true,
      message: 'Shift deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/workforce/shifts/metrics
export async function getShiftMetrics(req, res, next) {
  try {
    const { start_date, end_date, department, employee_id } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (start_date) {
      conditions.push(`date >= $${idx}`);
      params.push(start_date);
      idx++;
    }

    if (end_date) {
      conditions.push(`date <= $${idx}`);
      params.push(end_date);
      idx++;
    }

    if (department) {
      conditions.push(`UPPER(department) = UPPER($${idx})`);
      params.push(department);
      idx++;
    }

    if (employee_id) {
      conditions.push(`employee_id = $${idx}`);
      params.push(employee_id);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get overall metrics
    const metricsRes = await query(
      `
      SELECT 
        COUNT(*) as total_shifts,
        COUNT(CASE WHEN status = 'SCHEDULED' THEN 1 END) as scheduled_shifts,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as in_progress_shifts,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_shifts,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_shifts,
        COALESCE(SUM(total_hours), 0) as total_hours,
        COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
        COALESCE(SUM(total_pay), 0) as total_pay,
        COALESCE(AVG(total_hours), 0) as average_hours_per_shift,
        COUNT(CASE WHEN attendance_status IN ('LATE', 'EARLY_LEAVE', 'ABSENT') THEN 1 END) as attendance_issues,
        COUNT(CASE WHEN attendance_status = 'LATE' THEN 1 END) as late_shifts,
        COUNT(CASE WHEN attendance_status = 'ABSENT' THEN 1 END) as absent_shifts,
        COUNT(CASE WHEN attendance_status = 'ON_TIME' THEN 1 END) as on_time_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count
      FROM shifts
      ${where}
      `,
      params
    );

    const metrics = metricsRes.rows[0];
    const totalShifts = parseInt(metrics.total_shifts, 10);
    const onTimeCount = parseInt(metrics.on_time_count, 10);
    const completedCount = parseInt(metrics.completed_count, 10);

    // Get metrics by department
    const deptRes = await query(
      `
      SELECT 
        department,
        COUNT(*) as total_shifts,
        COALESCE(SUM(total_hours), 0) as total_hours,
        COALESCE(SUM(total_pay), 0) as total_pay
      FROM shifts
      ${where}
      GROUP BY department
      ORDER BY total_shifts DESC
      `,
      params
    );

    const byDepartment = {};
    deptRes.rows.forEach(row => {
      byDepartment[row.department || 'OTHER'] = {
        total_shifts: parseInt(row.total_shifts, 10),
        total_hours: parseFloat(row.total_hours) || 0,
        total_pay: parseFloat(row.total_pay) || 0
      };
    });

    // Get metrics by status
    const statusRes = await query(
      `
      SELECT 
        status,
        COUNT(*) as count
      FROM shifts
      ${where}
      GROUP BY status
      `,
      params
    );

    const byStatus = {};
    statusRes.rows.forEach(row => {
      byStatus[row.status] = parseInt(row.count, 10);
    });

    // Get metrics by type
    const typeRes = await query(
      `
      SELECT 
        shift_type,
        COUNT(*) as count
      FROM shifts
      ${where}
      GROUP BY shift_type
      `,
      params
    );

    const byType = {};
    typeRes.rows.forEach(row => {
      byType[row.shift_type] = parseInt(row.count, 10);
    });

    return res.json({
      success: true,
      data: {
        metrics: {
          total_shifts: totalShifts,
          scheduled_shifts: parseInt(metrics.scheduled_shifts, 10),
          in_progress_shifts: parseInt(metrics.in_progress_shifts, 10),
          completed_shifts: parseInt(metrics.completed_shifts, 10),
          cancelled_shifts: parseInt(metrics.cancelled_shifts, 10),
          total_hours: parseFloat(metrics.total_hours) || 0,
          total_overtime_hours: parseFloat(metrics.total_overtime_hours) || 0,
          total_pay: parseFloat(metrics.total_pay) || 0,
          average_hours_per_shift: parseFloat(metrics.average_hours_per_shift) || 0,
          attendance_issues: parseInt(metrics.attendance_issues, 10),
          late_shifts: parseInt(metrics.late_shifts, 10),
          absent_shifts: parseInt(metrics.absent_shifts, 10),
          on_time_rate: totalShifts > 0 ? parseFloat((onTimeCount / totalShifts * 100).toFixed(1)) : 0,
          completion_rate: totalShifts > 0 ? parseFloat((completedCount / totalShifts * 100).toFixed(1)) : 0,
          by_department: byDepartment,
          by_status: byStatus,
          by_type: byType
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/workforce/shifts/:id/clock-in
export async function clockIn(req, res, next) {
  try {
    const { id } = req.params;
    const { clock_in_time, location, notes } = req.body;

    // Get existing shift
    const existingRes = await query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const existing = existingRes.rows[0];
    const clockIn = clock_in_time || new Date().toTimeString().slice(0, 5); // HH:mm format

    // Calculate attendance status and late minutes
    let attendanceStatus = 'PRESENT';
    let lateMinutes = null;

    if (clockIn > existing.start_time) {
      attendanceStatus = 'LATE';
      lateMinutes = calculateTimeDifferenceInMinutes(existing.start_time, clockIn);
    } else {
      attendanceStatus = 'ON_TIME';
    }

    // Update shift
    const updateRes = await query(
      `
      UPDATE shifts 
      SET 
        status = 'IN_PROGRESS',
        clock_in_time = $1,
        attendance_status = $2,
        late_minutes = $3,
        location = COALESCE($4, location),
        notes = COALESCE($5, notes),
        updated_at = $6
      WHERE id = $7
      RETURNING id, status, clock_in_time, attendance_status, late_minutes, updated_at
      `,
      [clockIn, attendanceStatus, lateMinutes, location, notes, new Date(), id]
    );

    return res.json({
      success: true,
      message: 'Clock in recorded successfully',
      data: {
        shift: updateRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/workforce/shifts/:id/clock-out
export async function clockOut(req, res, next) {
  try {
    const { id } = req.params;
    const { clock_out_time, notes } = req.body;

    // Get existing shift
    const existingRes = await query('SELECT * FROM shifts WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const existing = existingRes.rows[0];
    const clockOut = clock_out_time || new Date().toTimeString().slice(0, 5); // HH:mm format

    // Calculate actual hours
    let actualHours = null;
    let earlyLeaveMinutes = null;

    if (existing.clock_in_time) {
      actualHours = calculateTotalHours(existing.clock_in_time, clockOut, existing.break_duration_minutes || 0);
    }

    // Check for early leave
    if (clockOut < existing.end_time) {
      earlyLeaveMinutes = calculateTimeDifferenceInMinutes(clockOut, existing.end_time);
      if (existing.attendance_status === 'ON_TIME' || existing.attendance_status === 'LATE') {
        // Update attendance status to early leave
        const updateRes = await query(
          `
          UPDATE shifts 
          SET 
            status = 'COMPLETED',
            clock_out_time = $1,
            actual_hours = $2,
            attendance_status = 'EARLY_LEAVE',
            early_leave_minutes = $3,
            total_pay = CASE 
              WHEN hourly_rate IS NOT NULL AND $2 IS NOT NULL 
              THEN ($2 * hourly_rate) + COALESCE((overtime_hours * COALESCE(overtime_rate, hourly_rate * 1.5)), 0)
              ELSE total_pay
            END,
            notes = COALESCE($4, notes),
            updated_at = $5
          WHERE id = $6
          RETURNING id, status, clock_out_time, actual_hours, total_pay, updated_at
          `,
          [clockOut, actualHours, earlyLeaveMinutes, notes, new Date(), id]
        );

        return res.json({
          success: true,
          message: 'Clock out recorded successfully',
          data: {
            shift: updateRes.rows[0]
          }
        });
      }
    }

    // Calculate total pay if hourly_rate is available
    let totalPay = existing.total_pay;
    if (actualHours && existing.hourly_rate) {
      totalPay = calculateTotalPay(
        actualHours,
        existing.hourly_rate,
        existing.overtime_hours,
        existing.overtime_rate
      );
    }

    // Update shift
    const updateRes = await query(
      `
      UPDATE shifts 
      SET 
        status = 'COMPLETED',
        clock_out_time = $1,
        actual_hours = $2,
        total_pay = $3,
        notes = COALESCE($4, notes),
        updated_at = $5
      WHERE id = $6
      RETURNING id, status, clock_out_time, actual_hours, total_pay, updated_at
      `,
      [clockOut, actualHours, totalPay, notes, new Date(), id]
    );

    return res.json({
      success: true,
      message: 'Clock out recorded successfully',
      data: {
        shift: updateRes.rows[0]
      }
    });
  } catch (err) {
    next(err);
  }
}

