import { query } from '../config/database.js';

// Dashboard Summary API
export async function getDashboardSummary(req, res, next) {
  try {
    // ====== 1. REVENUE (MTD) ======
    const revenueSql = `
      SELECT COALESCE(SUM(amount), 0) AS revenue_mtd
      FROM transactions
      WHERE transaction_type = 'INCOME'
      AND DATE(created_at) >= DATE(date_trunc('month', CURRENT_DATE))
    `;
    const revenueRes = await query(revenueSql);
    const revenue_mtd = revenueRes.rows[0]?.revenue_mtd || 0;

    // ====== 2. ORDERS IN PIPELINE ======
    const pipelineSql = `
      SELECT COUNT(*) AS orders_in_pipeline
      FROM production_orders
      WHERE status NOT IN ('COMPLETED', 'CLOSED')
    `;
    const pipelineRes = await query(pipelineSql);
    const orders_in_pipeline = pipelineRes.rows[0]?.orders_in_pipeline || 0;

    // ====== 3. INVENTORY HEALTH (%) ======
    // Logic example:
    // Stock Health = (Available Stock / Total Stock Capacity) * 100
    const inventoryRes = await query(`
  SELECT
    COALESCE(SUM(quantity_available), 0) AS total_available,
    COALESCE(SUM(quantity_on_hand), 1) AS total_on_hand
  FROM inventory_stock
`);

const available = inventoryRes.rows[0].total_available;
const onHand = inventoryRes.rows[0].total_on_hand;

const inventoryHealth = Math.round((available / onHand) * 100);

    // ====== 4. WORKFORCE AVAILABILITY (%) ======
    const workforceSql = `
      SELECT 
        (SELECT COUNT(*) FROM employees) AS total_employees,
        (SELECT COUNT(*) FROM employees WHERE is_active = true AND status = 'ACTIVE') AS active_employees;
    `;
    const workforceRes = await query(workforceSql);
    const { total_employees, active_employees } = workforceRes.rows[0];

    const workforce_availability =
      total_employees > 0
        ? Math.round((active_employees / total_employees) * 100)
        : 0;

    // FINAL RESPONSE
    return res.json({
  revenue_mtd,
  orders_in_pipeline,
  inventory_health: `${inventoryHealth}%`,
  workforce_availability: `${workforce_availability}%`
});

  } catch (error) {
    console.error('Dashboard Summary Error =>', error);
    return res.status(500).json({ message: 'Failed to fetch dashboard summary', error });
  }
}
//weekly productin orders//
export async function getWeeklyProductionOrders(req, res) {
  try {
    const sql = `
      SELECT 
          TO_CHAR(created_at, 'Dy') AS day,
          COUNT(*) AS total_orders
      FROM production_orders
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY MIN(created_at);
    `;

    const result = await query(sql);

    return res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error("Weekly Orders Error =>", error);
    return res.status(500).json({ message: "Failed to load weekly data", error });
  }
}
//sla//
export async function getCurrentMonthSlaHitRate(req, res) {
  try {
    const sql = `
      SELECT
        COUNT(*) FILTER (
            WHERE actual_completion_date IS NOT NULL
        ) AS total_completed,

        COUNT(*) FILTER (
            WHERE actual_completion_date IS NOT NULL
            AND actual_completion_date <= expected_completion_date
        ) AS completed_on_time
      FROM production_orders
      WHERE actual_completion_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND actual_completion_date <= NOW();
    `;

    const result = await query(sql);
    const { total_completed, completed_on_time } = result.rows[0];

    const sla =
      total_completed > 0
        ? Math.round((completed_on_time / total_completed) * 100)
        : 0;

    return res.json({
      success: true,
      current_month_sla: sla + "%"
    });

  } catch (error) {
    console.error("Current Month SLA Error =>", error);
    return res.status(500).json({ message: "Failed to load SLA data", error });
  }
}
//pie chart//
export async function getProductionStatusPie(req, res) {  
    try {
        const sql = `
            SELECT 
                status AS label,
                COUNT(*) AS value
            FROM production_orders
            GROUP BY status
            ORDER BY status;
        `;

        const result = await query(sql);
        const rows = result.rows;

        const total = rows.reduce((acc, r) => acc + Number(r.value), 0);

        const formatted = rows.map(r => ({
            label: r.label,
            value: Number(r.value),
            percentage: ((r.value / total) * 100).toFixed(2)
        }));

        return res.json({
            success: true,
            total,
            data: formatted
        });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}
//bar graph//
export async function getLastFiveMonthsIncome(req, res) {
  try {
    const sql = `
      SELECT 
          to_char(transaction_date, 'YYYY-MM') AS month,
          SUM(CASE WHEN transaction_type = 'INCOME' THEN amount ELSE 0 END) AS total_income,
          SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount ELSE 0 END) AS total_expense,
          SUM(CASE WHEN transaction_type = 'INCOME' THEN amount ELSE 0 END)
            - SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount ELSE 0 END) AS profit
      FROM transactions
      WHERE transaction_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY month
      ORDER BY month;
    `;

    const result = await query(sql);

    // Format numbers
    const formatted = result.rows.map(row => ({
      month: row.month,
      income: Number(row.total_income),
      expense: Number(row.total_expense),
      profit: Number(row.profit)
    }));

    // Find highest profit month
    const highestProfit = formatted.reduce((max, m) =>
      m.profit > max.profit ? m : max,
      formatted[0] || { profit: 0 }
    );

    return res.json({
      success: true,
      highestProfitMonth: highestProfit.month,
      highestProfitValue: highestProfit.profit,
      data: formatted
    });

  } catch (err) {
    console.error("Error in getLastFiveMonthsIncome:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
