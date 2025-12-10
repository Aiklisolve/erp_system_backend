-- Migration script to add updated_by column to invoices table
-- Run this if your invoices table doesn't have the updated_by column

-- Check if column exists, if not add it
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

