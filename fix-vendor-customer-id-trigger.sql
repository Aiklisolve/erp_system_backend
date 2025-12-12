-- Fix transactions trigger: Replace vendor_customer_id with customer_id
-- Run this script in your PostgreSQL database

-- Step 1: Find and list all triggers on transactions table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transactions';

-- Step 2: Find trigger functions that reference vendor_customer_id
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
WHERE pg_get_functiondef(p.oid) LIKE '%vendor_customer_id%';

-- Step 3: Drop all triggers on transactions table (they will be recreated if needed)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'transactions'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON transactions CASCADE', r.trigger_name);
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- Step 4: Drop functions that reference vendor_customer_id
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT proname, oid
        FROM pg_proc
        WHERE pg_get_functiondef(oid) LIKE '%vendor_customer_id%'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I CASCADE', r.proname);
        RAISE NOTICE 'Dropped function: %', r.proname;
    END LOOP;
END $$;

-- Step 5: Verify transactions table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'transactions' 
AND column_name IN ('customer_id', 'vendor_customer_id', 'to_account_id')
ORDER BY column_name;

-- If you see vendor_customer_id in the results above, you may need to rename it:
-- ALTER TABLE transactions RENAME COLUMN vendor_customer_id TO customer_id;

-- Step 6: Recreate a simple updated_at trigger (if you had one before)
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Uncomment the following if you want automatic updated_at timestamp:
-- CREATE TRIGGER trigger_update_transactions_updated_at
--     BEFORE UPDATE ON transactions
--     FOR EACH ROW
--     EXECUTE FUNCTION update_transactions_updated_at();

