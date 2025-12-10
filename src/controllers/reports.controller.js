// src/controllers/reports.controller.js
import { query } from '../config/database.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
// TODO: Install exceljs for proper Excel file generation: npm install exceljs
// import ExcelJS from 'exceljs';

const REPORTS_TABLE = 'reports';
const EMPLOYEES_TABLE = 'employees';
const LEAVE_REQUESTS_TABLE = 'leave_requests';
const PRODUCTS_TABLE = 'products';
const WAREHOUSES_TABLE = 'warehouses';
const STOCK_MOVEMENTS_TABLE = 'stock_movements';
const CUSTOMERS_TABLE = 'customers';
const SALES_ORDERS_TABLE = 'sales_orders';
const TRANSACTIONS_TABLE = 'transactions';
const SHIFTS_TABLE = 'shifts';
const PROJECTS_TABLE = 'projects';
const FINANCE_ACCOUNTS_TABLE = 'finance_accounts';

// Helper function to generate report code
function generateReportCode() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RPT-${year}-${random}`;
}

// Helper function to format report response
function formatReportResponse(report) {
  return {
    id: report.id,
    report_code: report.report_code || null,
    report_type: report.report_type || null,
    report_name: report.report_name || null,
    description: report.description || null,
    format: report.format || null,
    status: report.status || null,
    start_date: report.start_date || null,
    end_date: report.end_date || null,
    filters: report.filters ? (typeof report.filters === 'string' ? JSON.parse(report.filters) : report.filters) : {},
    file_url: report.file_url || null,
    file_name: report.file_name || null,
    file_size: report.file_size ? parseInt(report.file_size) : null,
    generated_at: report.generated_at || null,
    generated_by: report.generated_by || null,
    generated_by_name: report.generated_by_name || null,
    error_message: report.error_message || null,
    parameters: report.parameters ? (typeof report.parameters === 'string' ? JSON.parse(report.parameters) : report.parameters) : {},
    created_at: report.created_at || null,
    updated_at: report.updated_at || null
  };
}

// Helper function to generate a placeholder file URL
// In production, this would generate actual report files and upload to storage
function generateFileUrl(reportCode, format) {
  // Map format to correct file extension
  let extension;
  switch (format.toUpperCase()) {
    case 'EXCEL':
      extension = 'csv'; // Use .csv for now
      break;
    case 'PDF':
      extension = 'txt'; // Use .txt for now (not generating actual PDF)
      break;
    case 'CSV':
      extension = 'csv';
      break;
    case 'JSON':
      extension = 'json';
      break;
    default:
      extension = 'txt';
  }
  // For now, return a placeholder URL
  // In production, upload to S3/Supabase and return actual URL
  return `/api/v1/reports/files/${reportCode}.${extension}`;
}

// Helper function to generate file name
function generateFileName(reportName, format) {
  const sanitizedName = reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Map format to correct file extension
  let extension;
  switch (format.toUpperCase()) {
    case 'EXCEL':
      // Use .csv extension for now (Excel can open CSV)
      // TODO: Change to .xlsx when exceljs is installed
      extension = 'csv';
      break;
    case 'PDF':
      // Use .txt extension for now (we're generating text, not PDF)
      // TODO: Change to .pdf when pdfkit is installed
      extension = 'txt';
      break;
    case 'CSV':
      extension = 'csv';
      break;
    case 'JSON':
      extension = 'json';
      break;
    default:
      extension = 'txt';
  }
  
  return `${sanitizedName}_${timestamp}.${extension}`;
}

// Helper function to fetch report data based on report type
async function fetchReportData(reportType, filters, startDate, endDate) {
  try {
    // Parse filters - handle JSONB from database
    let filtersObj = {};
    if (filters) {
      if (typeof filters === 'string') {
        try {
          filtersObj = JSON.parse(filters);
        } catch (e) {
          console.error('Error parsing filters JSON:', e);
          filtersObj = {};
        }
      } else if (typeof filters === 'object') {
        filtersObj = filters;
      }
    }
    
    let result;
    switch (reportType) {
      case 'HR_EMPLOYEE':
        result = await fetchEmployeeData(filtersObj, startDate, endDate);
        break;
      
      case 'HR_LEAVE':
        result = await fetchLeaveData(filtersObj, startDate, endDate);
        break;
      
      case 'HR_ATTENDANCE':
        result = await fetchAttendanceData(filtersObj, startDate, endDate);
        break;
      
      case 'HR_PAYROLL':
        result = await fetchPayrollData(filtersObj, startDate, endDate);
        break;
      
      case 'PROJECT_SUMMARY':
      case 'PROJECT_PROGRESS':
      case 'PROJECT_BUDGET':
        result = await fetchProjectData(reportType, filtersObj, startDate, endDate);
        break;
      
      case 'FINANCE_TRANSACTION':
        result = await fetchFinanceTransactionData(filtersObj, startDate, endDate);
        break;
      
      case 'INVENTORY_STOCK':
        result = await fetchInventoryStockData(filtersObj);
        break;
      
      case 'WAREHOUSE_STOCK':
      case 'WAREHOUSE_MOVEMENT':
        result = await fetchWarehouseData(reportType, filtersObj, startDate, endDate);
        break;
      
      case 'SALES_ORDER':
      case 'SALES_REVENUE':
        result = await fetchSalesData(reportType, filtersObj, startDate, endDate);
        break;
      
      case 'CUSTOMER_SUMMARY':
      case 'CUSTOMER_SALES':
        result = await fetchCustomerData(reportType, filtersObj, startDate, endDate);
        break;
      
      default:
        result = { 
          headers: ['Report Code', 'Report Type', 'Message'], 
          rows: [[reportType, reportType, 'Report type not yet implemented']] 
        };
    }
    
    // Ensure we always return valid structure
    if (!result || !result.headers) {
      console.error('Invalid result from fetchReportData:', result);
      return {
        headers: ['Error'],
        rows: [['No data available or error fetching data']]
      };
    }
    
    // Ensure rows is an array
    if (!Array.isArray(result.rows)) {
      result.rows = [];
    }
    
    // If no rows but we have headers, add a message row
    if (result.rows.length === 0 && result.headers.length > 0) {
      result.rows = [[...result.headers.map(() => 'No data found')]];
    }
    
    return result;
  } catch (error) {
    console.error('Error in fetchReportData:', error);
    return {
      headers: ['Error'],
      rows: [[`Error fetching report data: ${error.message}`]]
    };
  }
}

// Fetch employee data
async function fetchEmployeeData(filters, startDate, endDate) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`UPPER(e.status) = UPPER($${idx})`);
    params.push(filters.status);
    idx++;
  }

  if (filters.department) {
    conditions.push(`UPPER(e.department) = UPPER($${idx})`);
    params.push(filters.department);
    idx++;
  }

  if (startDate) {
    conditions.push(`e.hire_date >= $${idx}`);
    params.push(startDate);
    idx++;
  }

  if (endDate) {
    conditions.push(`e.hire_date <= $${idx}`);
    params.push(endDate);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `
    SELECT 
      e.employee_id as "Employee ID",
      e.first_name || ' ' || e.last_name as "Full Name",
      e.email as "Email",
      e.phone as "Phone",
      e.department as "Department",
      e.position as "Position",
      e.hire_date as "Hire Date",
      e.salary as "Salary",
      e.status as "Status",
      e.city as "City",
      e.state as "State"
      FROM ${EMPLOYEES_TABLE} e
    ${where}
    ORDER BY e.created_at DESC
    `,
    params
  );

  // Handle empty result set
  if (!result.rows || result.rows.length === 0) {
    return {
      headers: ['Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Position', 'Hire Date', 'Salary', 'Status', 'City', 'State'],
      rows: []
    };
  }

  return {
    headers: Object.keys(result.rows[0]),
    rows: result.rows.map(row => Object.values(row))
  };
}

// Fetch leave data
async function fetchLeaveData(filters, startDate, endDate) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`UPPER(lr.status) = UPPER($${idx})`);
    params.push(filters.status);
    idx++;
  }

  if (filters.leave_type) {
    conditions.push(`UPPER(lr.leave_type) = UPPER($${idx})`);
    params.push(filters.leave_type);
    idx++;
  }

  if (startDate) {
    conditions.push(`lr.start_date >= $${idx}`);
    params.push(startDate);
    idx++;
  }

  if (endDate) {
    conditions.push(`lr.end_date <= $${idx}`);
    params.push(endDate);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `
    SELECT 
      lr.leave_number as "Leave Number",
      e.first_name || ' ' || e.last_name as "Employee Name",
      e.employee_id as "Employee ID",
      lr.leave_type as "Leave Type",
      lr.start_date as "Start Date",
      lr.end_date as "End Date",
      lr.total_days as "Total Days",
      lr.status as "Status",
      lr.reason as "Reason",
      lr.applied_date as "Applied Date"
      FROM ${LEAVE_REQUESTS_TABLE} lr
      LEFT JOIN ${EMPLOYEES_TABLE} e ON lr.employee_id = e.id
    ${where}
    ORDER BY lr.created_at DESC
    `,
    params
  );

  // Handle empty result set
  if (!result.rows || result.rows.length === 0) {
    return {
      headers: ['Leave Number', 'Employee Name', 'Employee ID', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Status', 'Reason', 'Applied Date'],
      rows: []
    };
  }

  return {
    headers: Object.keys(result.rows[0]),
    rows: result.rows.map(row => Object.values(row))
  };
}

// Fetch attendance data from shifts table
async function fetchAttendanceData(filters, startDate, endDate) {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.department) {
      conditions.push(`UPPER(s.department) = UPPER($${idx})`);
      params.push(filters.department);
      idx++;
    }

    if (filters.attendance_status) {
      conditions.push(`UPPER(s.attendance_status) = UPPER($${idx})`);
      params.push(filters.attendance_status);
      idx++;
    }

    if (filters.employee_id) {
      conditions.push(`s.employee_id = $${idx}`);
      params.push(filters.employee_id);
      idx++;
    }

    if (startDate) {
      conditions.push(`s.date >= $${idx}`);
      params.push(startDate);
      idx++;
    }

    if (endDate) {
      conditions.push(`s.date <= $${idx}`);
      params.push(endDate);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `
      SELECT 
        s.date as "Date",
        s.employee_name as "Employee Name",
        s.employee_id as "Employee ID",
        s.department as "Department",
        s.shift_type as "Shift Type",
        s.start_time as "Start Time",
        s.end_time as "End Time",
        s.clock_in_time as "Clock In",
        s.clock_out_time as "Clock Out",
        s.attendance_status as "Attendance Status",
        s.total_hours as "Total Hours",
        s.actual_hours as "Actual Hours",
        s.late_minutes as "Late Minutes",
        s.status as "Shift Status"
      FROM shifts s
      ${where}
      ORDER BY s.date DESC, s.employee_name
      `,
      params
    );

    // Handle empty result set
    if (!result.rows || result.rows.length === 0) {
      return {
        headers: ['Date', 'Employee Name', 'Employee ID', 'Department', 'Shift Type', 'Start Time', 'End Time', 'Clock In', 'Clock Out', 'Attendance Status', 'Total Hours', 'Actual Hours', 'Late Minutes', 'Shift Status'],
        rows: []
      };
    }

    return {
      headers: Object.keys(result.rows[0]),
      rows: result.rows.map(row => Object.values(row))
    };
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    return {
      headers: ['Error'],
      rows: [[`Error: ${error.message}`]]
    };
  }
}

// Fetch payroll data from shifts and employees tables
async function fetchPayrollData(filters, startDate, endDate) {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.department) {
      conditions.push(`UPPER(e.department) = UPPER($${idx})`);
      params.push(filters.department);
      idx++;
    }

    if (filters.employee_id) {
      conditions.push(`s.employee_id = $${idx}`);
      params.push(filters.employee_id);
      idx++;
    }

    if (startDate) {
      conditions.push(`s.date >= $${idx}`);
      params.push(startDate);
      idx++;
    }

    if (endDate) {
      conditions.push(`s.date <= $${idx}`);
      params.push(endDate);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Calculate payroll from shifts
    const result = await query(
      `
      SELECT 
        s.employee_name as "Employee Name",
        s.employee_id as "Employee ID",
        e.department as "Department",
        e.salary as "Base Salary",
        COUNT(DISTINCT s.date) as "Days Worked",
        COALESCE(SUM(s.total_hours), 0) as "Total Hours",
        COALESCE(SUM(s.total_pay), 0) as "Total Pay",
        COALESCE(SUM(s.overtime_hours), 0) as "Overtime Hours",
        COALESCE(SUM(CASE WHEN s.overtime_hours > 0 THEN s.overtime_hours * s.overtime_rate ELSE 0 END), 0) as "Overtime Pay",
        COALESCE(SUM(s.total_pay), 0) + COALESCE(SUM(CASE WHEN s.overtime_hours > 0 THEN s.overtime_hours * s.overtime_rate ELSE 0 END), 0) as "Gross Pay"
      FROM ${SHIFTS_TABLE} s
      LEFT JOIN ${EMPLOYEES_TABLE} e ON s.employee_id = e.id
      ${where}
      GROUP BY s.employee_name, s.employee_id, e.department, e.salary
      ORDER BY s.employee_name
      `,
      params
    );

    // Handle empty result set
    if (!result.rows || result.rows.length === 0) {
      return {
        headers: ['Employee Name', 'Employee ID', 'Department', 'Base Salary', 'Days Worked', 'Total Hours', 'Total Pay', 'Overtime Hours', 'Overtime Pay', 'Gross Pay'],
        rows: []
      };
    }

    return {
      headers: Object.keys(result.rows[0]),
      rows: result.rows.map(row => Object.values(row))
    };
  } catch (error) {
    console.error('Error fetching payroll data:', error);
    return {
      headers: ['Error'],
      rows: [[`Error: ${error.message}`]]
    };
  }
}

// Fetch project data
async function fetchProjectData(reportType, filters, startDate, endDate) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`UPPER(p.status) = UPPER($${idx})`);
    params.push(filters.status);
    idx++;
  }

  if (startDate) {
    conditions.push(`p.start_date >= $${idx}`);
    params.push(startDate);
    idx++;
  }

  if (endDate) {
    conditions.push(`p.end_date <= $${idx}`);
    params.push(endDate);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `
    SELECT 
      p.project_code as "Project Code",
      p.name as "Project Name",
      p.project_type as "Type",
      p.status as "Status",
      p.priority as "Priority",
      p.start_date as "Start Date",
      p.end_date as "End Date",
      p.estimated_budget as "Budget",
      p.progress_percentage as "Progress %",
      c.name as "Client Name"
      FROM ${PROJECTS_TABLE} p
      LEFT JOIN ${CUSTOMERS_TABLE} c ON p.client_id = c.id
    ${where}
    ORDER BY p.created_at DESC
    `,
    params
  );

  // Handle empty result set
  if (!result.rows || result.rows.length === 0) {
    return {
      headers: ['Project Code', 'Project Name', 'Type', 'Status', 'Priority', 'Start Date', 'End Date', 'Budget', 'Progress %', 'Client Name'],
      rows: []
    };
  }

  return {
    headers: Object.keys(result.rows[0]),
    rows: result.rows.map(row => Object.values(row))
  };
}

// Fetch finance transaction data from transactions table
async function fetchFinanceTransactionData(filters, startDate, endDate) {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`UPPER(t.status) = UPPER($${idx})`);
      params.push(filters.status);
      idx++;
    }

    if (filters.transaction_type) {
      conditions.push(`UPPER(t.transaction_type) = UPPER($${idx})`);
      params.push(filters.transaction_type);
      idx++;
    }

    if (filters.category) {
      conditions.push(`UPPER(t.category) = UPPER($${idx})`);
      params.push(filters.category);
      idx++;
    }

    if (startDate) {
      conditions.push(`t.transaction_date >= $${idx}`);
      params.push(startDate);
      idx++;
    }

    if (endDate) {
      conditions.push(`t.transaction_date <= $${idx}`);
      params.push(endDate);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `
      SELECT 
        t.transaction_number as "Transaction Number",
        t.transaction_type as "Type",
        t.category as "Category",
        t.amount as "Amount",
        t.currency as "Currency",
        t.transaction_date as "Date",
        t.payment_method as "Payment Method",
        t.status as "Status",
        t.description as "Description",
        t.reference_number as "Reference Number",
        t.tax_amount as "Tax Amount",
        fa.account_name as "Account Name"
      FROM ${TRANSACTIONS_TABLE} t
      LEFT JOIN ${FINANCE_ACCOUNTS_TABLE} fa ON t.account_id = fa.account_id
      ${where}
      ORDER BY t.transaction_date DESC
      `,
      params
    );

    // Handle empty result set
    if (!result.rows || result.rows.length === 0) {
      return {
        headers: ['Transaction Number', 'Type', 'Category', 'Amount', 'Currency', 'Date', 'Payment Method', 'Status', 'Description', 'Reference Number', 'Tax Amount', 'Account Name'],
        rows: []
      };
    }

    return {
      headers: Object.keys(result.rows[0]),
      rows: result.rows.map(row => Object.values(row))
    };
  } catch (error) {
    console.error('Error fetching finance transaction data:', error);
    return {
      headers: ['Error'],
      rows: [[`Error: ${error.message}`]]
    };
  }
}

// Fetch inventory stock data
async function fetchInventoryStockData(filters) {
  const result = await query(
    `
    SELECT 
      p.product_code as "Product Code",
      p.product_name as "Product Name",
      p.category as "Category",
      p.current_stock as "Current Stock",
      p.min_stock_level as "Min Stock",
      p.max_stock_level as "Max Stock",
      p.unit_price as "Unit Price"
      FROM ${PRODUCTS_TABLE} p
    ORDER BY p.product_name
    `
  );

  // Handle empty result set
  if (!result.rows || result.rows.length === 0) {
    return {
      headers: ['Product Code', 'Product Name', 'Category', 'Current Stock', 'Min Stock', 'Max Stock', 'Unit Price'],
      rows: []
    };
  }

  return {
    headers: Object.keys(result.rows[0]),
    rows: result.rows.map(row => Object.values(row))
  };
}

// Fetch warehouse data
async function fetchWarehouseData(reportType, filters, startDate, endDate) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (reportType === 'WAREHOUSE_MOVEMENT') {
    if (filters.movement_type) {
      conditions.push(`UPPER(sm.movement_type) = UPPER($${idx})`);
      params.push(filters.movement_type);
      idx++;
    }

    if (startDate) {
      conditions.push(`sm.movement_date >= $${idx}`);
      params.push(startDate);
      idx++;
    }

    if (endDate) {
      conditions.push(`sm.movement_date <= $${idx}`);
      params.push(endDate);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `
      SELECT 
        sm.movement_number as "Movement Number",
        p.product_name as "Product",
        sm.movement_type as "Type",
        sm.quantity as "Quantity",
        sm.movement_date as "Date",
        sm.status as "Status",
        wf.name as "From Warehouse",
        wt.name as "To Warehouse"
      FROM ${STOCK_MOVEMENTS_TABLE} sm
      LEFT JOIN ${PRODUCTS_TABLE} p ON sm.product_id = p.id
      LEFT JOIN ${WAREHOUSES_TABLE} wf ON sm.from_warehouse_id = wf.id
      LEFT JOIN ${WAREHOUSES_TABLE} wt ON sm.to_warehouse_id = wt.id
      ${where}
      ORDER BY sm.movement_date DESC
      `,
      params
    );

    // Handle empty result set
    if (!result.rows || result.rows.length === 0) {
      return {
        headers: ['Movement Number', 'Product', 'Type', 'Quantity', 'Date', 'Status', 'From Warehouse', 'To Warehouse'],
        rows: []
      };
    }

    return {
      headers: Object.keys(result.rows[0]),
      rows: result.rows.map(row => Object.values(row))
    };
  } else {
    // WAREHOUSE_STOCK
    const result = await query(
      `
      SELECT 
        w.name as "Warehouse Name",
        w.location as "Location",
        w.capacity as "Capacity",
        w.status as "Status"
      FROM ${WAREHOUSES_TABLE} w
      ORDER BY w.name
      `
    );

    // Handle empty result set
    if (!result.rows || result.rows.length === 0) {
      return {
        headers: ['Warehouse Name', 'Location', 'Capacity', 'Status'],
        rows: []
      };
    }

    return {
      headers: Object.keys(result.rows[0]),
      rows: result.rows.map(row => Object.values(row))
    };
  }
}

// Fetch sales data
async function fetchSalesData(reportType, filters, startDate, endDate) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (startDate) {
    conditions.push(`so.order_date >= $${idx}`);
    params.push(startDate);
    idx++;
  }

  if (endDate) {
    conditions.push(`so.order_date <= $${idx}`);
    params.push(endDate);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `
    SELECT 
      so.order_number as "Order Number",
      c.name as "Customer",
      so.order_date as "Order Date",
      so.status as "Status",
      so.payment_status as "Payment Status",
      so.total_amount as "Total Amount",
      so.subtotal as "Subtotal",
      so.tax_amount as "Tax Amount",
      so.shipping_cost as "Shipping Cost",
      so.discount_amount as "Discount Amount"
      FROM ${SALES_ORDERS_TABLE} so
      LEFT JOIN ${CUSTOMERS_TABLE} c ON so.customer_id = c.id
    ${where}
    ORDER BY so.order_date DESC
    `,
    params
  );

  // Handle empty result set
  if (!result.rows || result.rows.length === 0) {
    return {
      headers: ['Order Number', 'Customer', 'Order Date', 'Status', 'Payment Status', 'Total Amount', 'Subtotal', 'Tax Amount', 'Shipping Cost', 'Discount Amount'],
      rows: []
    };
  }

  return {
    headers: Object.keys(result.rows[0]),
    rows: result.rows.map(row => Object.values(row))
  };
}

// Fetch customer data
async function fetchCustomerData(reportType, filters, startDate, endDate) {
  const result = await query(
    `
    SELECT 
      c.name as "Customer Name",
      c.email as "Email",
      c.phone as "Phone",
      c.company_name as "Company",
      c.address as "Address",
      c.city as "City",
      c.state as "State",
      c.status as "Status"
      FROM ${CUSTOMERS_TABLE} c
    ORDER BY c.name
    `
  );

  // Handle empty result set
  if (!result.rows || result.rows.length === 0) {
    return {
      headers: ['Customer Name', 'Email', 'Phone', 'Company', 'Address', 'City', 'State', 'Status'],
      rows: []
    };
  }

  return {
    headers: Object.keys(result.rows[0]),
    rows: result.rows.map(row => Object.values(row))
  };
}

// Helper function to process report generation (simplified version)
// In production, this would call actual report generation libraries
async function processReportGeneration(reportId, reportData) {
  try {
    console.log(`[processReportGeneration] Starting for report ID: ${reportId}, Format: ${reportData.format}, Type: ${reportData.report_type}`);
    
    // Update status to PROCESSING
    await query(
      `UPDATE ${REPORTS_TABLE} SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`,
      [reportId]
    );

    // Generate file URL and name with correct extensions
    const fileUrl = generateFileUrl(reportData.report_code, reportData.format);
    const fileName = generateFileName(reportData.report_name, reportData.format);
    
    console.log(`[processReportGeneration] Generated file URL: ${fileUrl}, File Name: ${fileName}`);
    
    // For now, use a placeholder file size
    // In production, calculate actual file size after generation
    const fileSize = 1024 * 50; // 50KB placeholder

    // Update report with completed status and file info
    const updateRes = await query(
      `
      UPDATE ${REPORTS_TABLE}
      SET 
        status = 'COMPLETED',
        file_url = $1,
        file_name = $2,
        file_size = $3,
        generated_at = NOW(),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
      `,
      [fileUrl, fileName, fileSize, reportId]
    );

    console.log(`[processReportGeneration] Report ${reportId} marked as COMPLETED successfully`);
    return updateRes.rows[0];
  } catch (error) {
    console.error(`[processReportGeneration] Error processing report ${reportId}:`, error);
    console.error(`[processReportGeneration] Error stack:`, error.stack);
    // Update status to FAILED on error
    await query(
      `UPDATE ${REPORTS_TABLE} 
       SET status = 'FAILED', 
           error_message = $1, 
           updated_at = NOW() 
       WHERE id = $2`,
      [error.message, reportId]
    );
    throw error;
  }
}

// GET /api/v1/reports
export async function listReports(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req, 20, 100);
    const { report_type, status, start_date, end_date } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (report_type) {
      conditions.push(`r.report_type = $${idx}`);
      params.push(report_type);
      idx++;
    }

    if (status) {
      conditions.push(`r.status = $${idx}`);
      params.push(status.toUpperCase());
      idx++;
    }

    if (start_date) {
      conditions.push(`r.created_at >= $${idx}`);
      params.push(start_date);
      idx++;
    }

    if (end_date) {
      conditions.push(`r.created_at <= $${idx}`);
      params.push(end_date);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRes = await query(
      `
      SELECT 
        r.*,
        u.full_name as generated_by_name,
        u.email as generated_by_email
      FROM ${REPORTS_TABLE} r
      LEFT JOIN users u ON r.generated_by = u.id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...params, limit, offset]
    );

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM ${REPORTS_TABLE} r
      ${where}
      `,
      params
    );

    const total = countRes.rows[0]?.count || 0;

    // Format reports
    const formattedReports = dataRes.rows.map(formatReportResponse);

    return res.json({
      success: true,
      data: {
        reports: formattedReports,
        pagination: buildPaginationMeta(page, limit, total)
      }
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/reports/:id
export async function getReportById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT 
        r.*,
        u.full_name as generated_by_name,
        u.email as generated_by_email
      FROM ${REPORTS_TABLE} r
      LEFT JOIN users u ON r.generated_by = u.id
      WHERE r.id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `Report with id '${id}' not found`,
        error: 'NOT_FOUND'
      });
    }

    const formattedReport = formatReportResponse(result.rows[0]);

    return res.json({
      success: true,
      data: {
        report: formattedReport
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/reports/generate
export async function generateReport(req, res, next) {
  try {
    const body = req.body;

    // Validation: Required fields
    const errors = {};
    if (!body.report_type) {
      errors.report_type = 'Report type is required';
    }
    if (!body.report_name) {
      errors.report_name = 'Report name is required';
    }
    if (!body.format) {
      errors.format = 'Report format is required';
    }

    // Validate report_type enum
    const validReportTypes = [
      'HR_EMPLOYEE', 'HR_ATTENDANCE', 'HR_LEAVE', 'HR_PAYROLL',
      'FINANCE_TRANSACTION', 'FINANCE_BALANCE_SHEET', 'FINANCE_PROFIT_LOSS',
      'PROJECT_SUMMARY', 'PROJECT_PROGRESS', 'PROJECT_BUDGET',
      'INVENTORY_STOCK', 'INVENTORY_MOVEMENT',
      'SALES_ORDER', 'SALES_REVENUE',
      'PROCUREMENT_PURCHASE', 'PROCUREMENT_VENDOR',
      'WAREHOUSE_STOCK', 'WAREHOUSE_MOVEMENT',
      'CUSTOMER_SUMMARY', 'CUSTOMER_SALES'
    ];
    if (body.report_type && !validReportTypes.includes(body.report_type)) {
      errors.report_type = `Report type must be one of: ${validReportTypes.join(', ')}`;
    }

    // Validate format enum
    const validFormats = ['PDF', 'EXCEL', 'CSV', 'JSON'];
    if (body.format && !validFormats.includes(body.format.toUpperCase())) {
      errors.format = `Format must be one of: ${validFormats.join(', ')}`;
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report type or missing required fields',
        error: 'Bad Request',
        details: errors
      });
    }

    // Generate report_code if not provided
    const reportCode = body.report_code || generateReportCode();

    // Normalize format to uppercase
    const format = body.format.toUpperCase();

    // Get generated_by from authenticated user
    const generatedBy = req.user?.user_id || null;

    // Insert report record with PENDING status
    // PostgreSQL will auto-cast JSON strings to JSONB
    const insertRes = await query(
      `
      INSERT INTO ${REPORTS_TABLE} (
        report_code, report_type, report_name, description, format,
        status, start_date, end_date, filters, parameters,
        generated_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9::jsonb, $10::jsonb,
        $11, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        reportCode,
        body.report_type,
        body.report_name,
        body.description || null,
        format,
        'PENDING',
        body.start_date || null,
        body.end_date || null,
        body.filters ? JSON.stringify(body.filters) : '{}',
        body.parameters ? JSON.stringify(body.parameters) : '{}',
        generatedBy
      ]
    );

    const reportRecord = insertRes.rows[0];

    console.log(`[Generate Report] Created report record - ID: ${reportRecord.id}, Code: ${reportCode}, Type: ${body.report_type}, Format: ${format}`);

    // Process report generation (synchronous for now)
    // In production, you would queue this to a job processor (Bull, Agenda, etc.)
    try {
      console.log(`[Generate Report] Starting report generation for ID: ${reportRecord.id}`);
      const completedReport = await processReportGeneration(reportRecord.id, reportRecord);
      console.log(`[Generate Report] Report generation completed - ID: ${reportRecord.id}, Status: ${completedReport.status}`);
      
      const formattedReport = formatReportResponse(completedReport);

      return res.status(201).json({
        success: true,
        data: {
          report: formattedReport
        },
        message: 'Report generated successfully'
      });
    } catch (genError) {
      // If generation fails, return the PENDING report with error info
      console.error(`[Generate Report] Error generating report ${reportRecord.id}:`, genError);
      
      const errorReport = await query(
        `SELECT * FROM ${REPORTS_TABLE} WHERE id = $1`,
        [reportRecord.id]
      );
      
      const formattedReport = formatReportResponse(errorReport.rows[0]);
      
      return res.status(500).json({
        success: false,
        data: {
          report: formattedReport
        },
        message: 'Report creation succeeded but generation failed',
        error: 'Report Generation Failed',
        error_details: genError.message
      });
    }
  } catch (err) {
    // Handle unique constraint violation for report_code
    if (err.code === '23505' && err.constraint?.includes('report_code')) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: 'Bad Request',
        details: {
          report_code: 'Report code already exists'
        }
      });
    }
    next(err);
  }
}

// GET /api/v1/reports/:id/download
export async function downloadReport(req, res, next) {
  // Mark this as a download request to prevent JSON middleware interference
  req.isDownloadRequest = true;
  
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT file_url, file_name, format, status, report_code, report_type, report_name, 
             generated_at, filters, start_date, end_date
      FROM ${REPORTS_TABLE}
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `Report with id '${id}' not found`,
        error: 'NOT_FOUND'
      });
    }

    const report = result.rows[0];

    // Allow download even if status is not COMPLETED (generate on-the-fly)
    if (report.status !== 'COMPLETED' && report.status !== 'PROCESSING') {
      // Still allow download but log warning
      console.warn(`Downloading report ${id} with status: ${report.status}`);
    }

    // Always generate file content on-the-fly (don't require file_url or COMPLETED status)
    // This ensures reports are always downloadable
    let reportData;
    try {
      reportData = await fetchReportData(
        report.report_type,
        report.filters,
        report.start_date,
        report.end_date
      );
      
      // Ensure reportData has valid structure
      if (!reportData || !reportData.headers || !Array.isArray(reportData.headers)) {
        console.error('Invalid reportData structure:', reportData);
        reportData = {
          headers: ['Error'],
          rows: [['Failed to fetch report data']]
        };
      }
      
      if (!reportData.rows || !Array.isArray(reportData.rows)) {
        reportData.rows = [];
      }
      
      // If no data but headers exist, add a message
      if (reportData.rows.length === 0 && reportData.headers.length > 0) {
        reportData.rows = [reportData.headers.map(() => 'No data found')];
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
      reportData = {
        headers: ['Error'],
        rows: [[`Error: ${error.message}`]]
      };
    }

    // Generate file content based on format
    // CRITICAL: Set headers FIRST before any response to prevent JSON middleware interference
    // Don't let Express JSON middleware interfere with file downloads
    
    // Log report details for debugging
    console.log(`\n========== [Download Report ${id}] ==========`);
    console.log(`Format: ${report.format}`);
    console.log(`Type: ${report.report_type}`);
    console.log(`Status: ${report.status}`);
    console.log(`Report Code: ${report.report_code}`);
    console.log(`Report Name: ${report.report_name}`);
    console.log(`Report Data Headers: ${reportData.headers?.length || 0}`);
    console.log(`Report Data Rows: ${reportData.rows?.length || 0}`);
    if (reportData.headers && reportData.headers.length > 0) {
      console.log(`Headers:`, reportData.headers);
    }
    console.log(`==========================================\n`);
    
    // Ensure response is not JSON by setting proper headers first
    if (report.format === 'JSON') {
      // JSON format - proper JSON response
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const fileName = report.file_name || `report_${report.report_code}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      return res.json({
        report_code: report.report_code,
        report_type: report.report_type,
        report_name: report.report_name,
        generated_at: report.generated_at,
        data: {
          headers: reportData.headers,
          rows: reportData.rows
        }
      });
    } else if (report.format === 'CSV' || report.format === 'EXCEL') {
      // CSV/Excel format - proper CSV file
      // IMPORTANT: Use .csv extension for both CSV and EXCEL formats
      // because we're sending CSV content, not actual Excel files
      // Excel can open CSV files natively, and this prevents frontend validation errors
      const fileName = report.file_name 
        ? report.file_name.replace(/\.(xlsx|xls)$/i, '.csv')
        : `report_${report.report_code}.csv`;
      
      // Set headers first - critical for file downloads
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      
      // Add BOM for UTF-8 to ensure Excel opens it correctly
      const BOM = '\uFEFF';
      
      // Generate CSV content with actual data
      let csvContent = BOM;
      
      // Add headers (always include headers for valid CSV)
      if (reportData.headers && reportData.headers.length > 0) {
        const headerRow = reportData.headers.map(h => {
          const headerStr = String(h || '').trim().replace(/"/g, '""');
          return `"${headerStr}"`;
        }).join(',');
        csvContent += headerRow + '\r\n'; // Use \r\n for Windows compatibility
      } else {
        // If no headers, add a default header
        csvContent += '"No Data"\r\n';
      }
      
      // Add data rows
      if (reportData.rows && reportData.rows.length > 0) {
        reportData.rows.forEach(row => {
          if (Array.isArray(row) && row.length > 0) {
            const rowContent = row.map(cell => {
              const cellValue = cell === null || cell === undefined ? '' : String(cell).trim();
              return `"${cellValue.replace(/"/g, '""')}"`;
            }).join(',');
            csvContent += rowContent + '\r\n'; // Use \r\n for Windows compatibility
          }
        });
      } else {
        // If no data rows, add a message row matching header count
        const headerCount = reportData.headers?.length || 1;
        const emptyCells = ',""'.repeat(Math.max(0, headerCount - 1));
        csvContent += `"No data found"${emptyCells}\r\n`;
      }
      
      // Ensure CSV ends with newline
      if (!csvContent.endsWith('\r\n') && !csvContent.endsWith('\n')) {
        csvContent += '\r\n';
      }
      
      // Log for debugging
      console.log(`[Download Report ${id}] CSV File Details:`);
      console.log(`  - Format: ${report.format}`);
      console.log(`  - FileName: ${fileName}`);
      console.log(`  - Content-Type: text/csv; charset=utf-8`);
      console.log(`  - Headers count: ${reportData.headers?.length || 0}`);
      console.log(`  - Rows count: ${reportData.rows?.length || 0}`);
      console.log(`  - CSV Content preview (first 300 chars):`, csvContent.substring(0, 300));
      
      // Send as Buffer to ensure proper file download
      // Use res.end() to ensure response is sent without any JSON wrapping
      const buffer = Buffer.from(csvContent, 'utf-8');
      res.setHeader('Content-Length', buffer.length);
      
      // Final validation before sending
      if (res.headersSent) {
        console.error(`[Download Report ${id}] ERROR: Headers already sent! Cannot send file.`);
        return;
      }
      
      console.log(`[Download Report ${id}] Sending CSV file - Size: ${buffer.length} bytes`);
      console.log(`[Download Report ${id}] Response headers:`, {
        'Content-Type': res.getHeader('Content-Type'),
        'Content-Disposition': res.getHeader('Content-Disposition'),
        'Content-Length': res.getHeader('Content-Length')
      });
      
      // CRITICAL: Use res.end() not res.send() to bypass Express JSON middleware
      // Ensure response is sent as binary file, not JSON
      try {
        res.end(buffer);
        console.log(`[Download Report ${id}] File sent successfully`);
        return;
      } catch (sendError) {
        console.error(`[Download Report ${id}] Error sending file:`, sendError);
        throw sendError;
      }
    } else if (report.format === 'PDF') {
      // PDF format - return text content with .txt extension
      // IMPORTANT: Use .txt extension because we're sending text content, not actual PDF
      // This prevents frontend validation errors
      // TODO: Generate proper PDF using pdfkit library (npm install pdfkit)
      const fileName = report.file_name 
        ? report.file_name.replace(/\.pdf$/i, '.txt')
        : `report_${report.report_code}.txt`;
      
      // Set headers first - critical for file downloads
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
      
      // Generate text content
      let pdfContent = `Report: ${report.report_name}\n`;
      pdfContent += `Report Code: ${report.report_code}\n`;
      pdfContent += `Report Type: ${report.report_type}\n`;
      pdfContent += `Generated At: ${report.generated_at || new Date().toISOString()}\n\n`;
      pdfContent += `--- Report Data ---\n\n`;
      
      if (reportData.headers && reportData.headers.length > 0) {
        pdfContent += reportData.headers.join(' | ') + '\n';
        pdfContent += '-'.repeat(reportData.headers.join(' | ').length) + '\n';
      }
      
      if (reportData.rows && reportData.rows.length > 0) {
        reportData.rows.forEach(row => {
          pdfContent += row.map(cell => String(cell || '')).join(' | ') + '\n';
        });
      }
      
      const pdfBuffer = Buffer.from(pdfContent, 'utf-8');
      res.setHeader('Content-Length', pdfBuffer.length);
      
      console.log(`[Download Report ${id}] PDF File Details:`);
      console.log(`  - Format: ${report.format}`);
      console.log(`  - FileName: ${fileName}`);
      console.log(`  - Content-Type: text/plain; charset=utf-8`);
      console.log(`  - File size: ${pdfBuffer.length} bytes`);
      
      if (res.headersSent) {
        console.error(`[Download Report ${id}] ERROR: Headers already sent! Cannot send file.`);
        return;
      }
      
      res.end(pdfBuffer);
      return;
    } else {
      // Default: return text
      const fileName = report.file_name || `report_${report.report_code}.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(Buffer.from(`Report: ${report.report_name}\nReport Type: ${report.report_type}\n\nData not available in this format.`, 'utf-8'));
      return;
    }
  } catch (err) {
    // If error occurs during file generation, send error as file, not JSON
    // This prevents the error handler middleware from sending JSON response
    console.error('Error in downloadReport:', err);
    
    // Only send error as file if headers haven't been sent yet
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="error.txt"');
      res.status(500).end(`Error generating report: ${err.message}\n\nPlease contact support if this issue persists.`);
      return;
    }
    
    // If headers were already sent, just end the response
    if (!res.finished) {
      res.end();
    }
  }
}

// DELETE /api/v1/reports/:id
export async function deleteReport(req, res, next) {
  try {
    const { id } = req.params;

    // Get report to check if file exists
    const report = await query(
      `
      SELECT file_url, file_name
      FROM ${REPORTS_TABLE}
      WHERE id = $1
      `,
      [id]
    );

    if (report.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `Report with id '${id}' not found`,
        error: 'NOT_FOUND'
      });
    }

    // TODO: Delete file from storage if file_url exists
    // await deleteFileFromStorage(report.rows[0].file_url);

    // Delete report record
    const delRes = await query(
      `
      DELETE FROM ${REPORTS_TABLE}
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    return res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

