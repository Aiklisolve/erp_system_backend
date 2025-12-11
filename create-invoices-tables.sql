-- Create invoices and invoice_items tables schema
-- Run this SQL script to create the invoices tables

-- Drop tables if they exist (for development only - remove in production)
-- DROP TABLE IF EXISTS invoice_items CASCADE;
-- DROP TABLE IF EXISTS invoices CASCADE;

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_code VARCHAR(50),
  invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('SALES', 'PURCHASE', 'SERVICE', 'PRODUCT', 'RECURRING')),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED')),
  
  -- Customer information (denormalized for historical records)
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address TEXT,
  customer_city VARCHAR(100),
  customer_state VARCHAR(100),
  customer_postal_code VARCHAR(20),
  customer_country VARCHAR(100),
  customer_tax_id VARCHAR(50),
  
  -- Invoice dates
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  
  -- Financial information
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(15, 2) DEFAULT 0,
  shipping_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  balance_amount DECIMAL(15, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  
  -- Payment information
  payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'CHEQUE', 'ONLINE_PAYMENT', 'OTHER')),
  payment_reference VARCHAR(100),
  payment_notes TEXT,
  
  -- Additional information
  notes TEXT,
  terms TEXT,
  po_number VARCHAR(100),
  reference_number VARCHAR(100),
  
  -- Related entities
  order_id BIGINT,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  quote_id BIGINT,
  
  -- Recurring invoice
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency VARCHAR(20) CHECK (recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
  recurring_end_date DATE,
  
  -- Metadata
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  description TEXT,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  discount DECIMAL(5, 2) DEFAULT 0,
  line_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Add comments
COMMENT ON TABLE invoices IS 'Stores invoice records with customer and financial information';
COMMENT ON TABLE invoice_items IS 'Stores line items for each invoice';
COMMENT ON COLUMN invoices.invoice_number IS 'Human-readable invoice number (e.g., INV-202501-ABC123)';
COMMENT ON COLUMN invoices.invoice_code IS 'Auto-generated invoice code (e.g., INV-2025-001)';
COMMENT ON COLUMN invoices.status IS 'Invoice status: DRAFT, PENDING, SENT, PAID, PARTIALLY_PAID, OVERDUE, CANCELLED, REFUNDED';
COMMENT ON COLUMN invoices.invoice_type IS 'Type of invoice: SALES, PURCHASE, SERVICE, PRODUCT, RECURRING';
COMMENT ON COLUMN invoices.balance_amount IS 'Remaining balance (total_amount - paid_amount)';

