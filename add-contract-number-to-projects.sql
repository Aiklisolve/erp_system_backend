-- Add contract_number column to projects table if it doesn't exist
-- This script is idempotent and can be run multiple times safely

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'projects' 
        AND column_name = 'contract_number'
    ) THEN
        ALTER TABLE projects 
        ADD COLUMN contract_number VARCHAR(100);
        
        RAISE NOTICE 'Column contract_number added to projects table';
    ELSE
        RAISE NOTICE 'Column contract_number already exists in projects table';
    END IF;
END $$;

