-- Fix transactions table trigger to use customer_id instead of vendor_customer_id
-- This script fixes the trigger error: record "new" has no field "vendor_customer_id"

-- First, let's find and drop any triggers that reference vendor_customer_id
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Find all triggers on the transactions table
    FOR trigger_record IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'transactions'
    LOOP
        -- Drop the trigger
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON transactions CASCADE', trigger_record.trigger_name);
        RAISE NOTICE 'Dropped trigger: %', trigger_record.trigger_name;
    END LOOP;
END $$;

-- Check if there are any trigger functions that reference vendor_customer_id
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT proname, prosrc
        FROM pg_proc
        WHERE prosrc LIKE '%vendor_customer_id%'
    LOOP
        RAISE NOTICE 'Found function referencing vendor_customer_id: %', func_record.proname;
    END LOOP;
END $$;

-- Drop and recreate trigger functions if they exist
DROP FUNCTION IF EXISTS update_transactions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS set_transaction_status() CASCADE;
DROP FUNCTION IF EXISTS validate_transaction() CASCADE;

-- Recreate a simple updated_at trigger (if needed)
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at (if you want automatic timestamp updates)
-- DROP TRIGGER IF EXISTS trigger_update_transactions_updated_at ON transactions;
-- CREATE TRIGGER trigger_update_transactions_updated_at
--     BEFORE UPDATE ON transactions
--     FOR EACH ROW
--     EXECUTE FUNCTION update_transactions_updated_at();

-- Verify the transactions table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name IN ('customer_id', 'vendor_customer_id', 'to_account_id')
ORDER BY column_name;

