-- Migration script to add missing columns to invoices table
-- Run this if your invoices table is missing columns

-- Add updated_by column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE invoices 
        ADD COLUMN updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Column updated_by added to invoices table';
    ELSE
        RAISE NOTICE 'Column updated_by already exists in invoices table';
    END IF;
END $$;

-- Add project_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'invoices' 
        AND column_name = 'project_id'
    ) THEN
        ALTER TABLE invoices 
        ADD COLUMN project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Column project_id added to invoices table';
    ELSE
        RAISE NOTICE 'Column project_id already exists in invoices table';
    END IF;
END $$;

-- Add other potentially missing columns
DO $$ 
BEGIN
    -- Add invoice_code if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'invoice_code'
    ) THEN
        ALTER TABLE invoices ADD COLUMN invoice_code VARCHAR(50);
        RAISE NOTICE 'Column invoice_code added';
    END IF;
    
    -- Add invoice_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'invoice_type'
    ) THEN
        ALTER TABLE invoices ADD COLUMN invoice_type VARCHAR(20) DEFAULT 'SALES';
        RAISE NOTICE 'Column invoice_type added';
    END IF;
    
    -- Add quote_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'quote_id'
    ) THEN
        ALTER TABLE invoices ADD COLUMN quote_id BIGINT;
        RAISE NOTICE 'Column quote_id added';
    END IF;
    
    -- Add is_recurring if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'is_recurring'
    ) THEN
        ALTER TABLE invoices ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Column is_recurring added';
    END IF;
    
    -- Add recurring_frequency if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'recurring_frequency'
    ) THEN
        ALTER TABLE invoices ADD COLUMN recurring_frequency VARCHAR(20);
        RAISE NOTICE 'Column recurring_frequency added';
    END IF;
    
    -- Add recurring_end_date if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'recurring_end_date'
    ) THEN
        ALTER TABLE invoices ADD COLUMN recurring_end_date DATE;
        RAISE NOTICE 'Column recurring_end_date added';
    END IF;
END $$;

