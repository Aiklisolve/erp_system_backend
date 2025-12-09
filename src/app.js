// src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import { httpLogger } from './middleware/logger.js';

// Core routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import sessionRoutes from './routes/session.routes.js';
import crmRoutes from './routes/crm.routes.js';

// New module routes (CJS is fine, Node will treat module.exports as default)
import financeRoutes from './routes/finance.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import manufacturingRoutes from './routes/manufacturing.routes.js';
import procurementRoutes from './routes/procurement.routes.js';
import ordersRoutes from './routes/orders.routes.js'; 
import warehouseRoutes from './routes/warehouse.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import productsRoutes from './routes/products.routes.js';
import customersRoutes from './routes/customers.routes.js';
import workforceRoutes from './routes/workforce.routes.js';

// If/when you create these files, uncomment the imports + app.use below
// import hrRoutes from './routes/hr.routes.js';
// import tasksRoutes from './routes/tasks.routes.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(httpLogger); // Custom HTTP logger to file

const base = `/api/${config.apiVersion}`;

// Auth & user
app.use(`${base}/auth`, authRoutes);
app.use(`${base}/users`, userRoutes);
app.use(`${base}/sessions`, sessionRoutes);
app.use(`${base}/crm`, crmRoutes);

// Later, when you have HR/Tasks route files ready:
// app.use(`${base}/hr`, hrRoutes);
// app.use(`${base}/tasks`, tasksRoutes);

// Finance, inventory, etc.
app.use(`${base}/finance`, financeRoutes);
app.use(`${base}/inventory`, inventoryRoutes);
app.use(`${base}/manufacturing`, manufacturingRoutes);
app.use(`${base}/procurement`, procurementRoutes);
app.use(`${base}/orders`, ordersRoutes);
app.use(`${base}/warehouse`, warehouseRoutes);
app.use(`${base}/projects`, projectsRoutes);
app.use(`${base}/upload`, uploadRoutes);
app.use(`${base}`, productsRoutes);
app.use(`${base}/customers`, customersRoutes);
app.use(`${base}/workforce`, workforceRoutes);

// Optional: a simple health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: config.apiVersion,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
import { errorHandler } from './middleware/errorHandler.js';
app.use(errorHandler);

export default app;
