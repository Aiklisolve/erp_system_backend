// Script to fix transactions table trigger that references vendor_customer_id
// Run this script: node fix-transactions-trigger.js

import { query } from './src/config/database.js';

async function fixTransactionsTrigger() {
  try {
    console.log('🔍 Checking for triggers on transactions table...');
    
    // Step 1: Find all triggers on transactions table
    const triggersRes = await query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'transactions'
    `);
    
    console.log(`Found ${triggersRes.rows.length} trigger(s) on transactions table:`);
    triggersRes.rows.forEach(trigger => {
      console.log(`  - ${trigger.trigger_name} (${trigger.event_manipulation})`);
    });
    
    // Step 2: Get trigger function names
    const triggerFunctionsRes = await query(`
      SELECT DISTINCT action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'transactions'
    `);
    
    // Step 3: Drop all triggers on transactions table (this will help identify problematic ones)
    console.log('\n🗑️  Dropping triggers on transactions table...');
    for (const trigger of triggersRes.rows) {
      try {
        await query(`DROP TRIGGER IF EXISTS ${trigger.trigger_name} ON transactions CASCADE`);
        console.log(`  ✓ Dropped trigger: ${trigger.trigger_name}`);
      } catch (err) {
        console.error(`  ✗ Error dropping trigger ${trigger.trigger_name}:`, err.message);
      }
    }
    
    // Step 4: Try to find and drop functions that might reference vendor_customer_id
    console.log('\n🔍 Checking for functions that might reference vendor_customer_id...');
    try {
      const funcNamesRes = await query(`
        SELECT proname, pronargs
        FROM pg_proc
        WHERE proname LIKE '%transfer%' OR proname LIKE '%transaction%'
        ORDER BY proname
      `);
      
      console.log(`Found ${funcNamesRes.rows.length} potential function(s):`);
      for (const func of funcNamesRes.rows) {
        try {
          // Try to get the function source to check for vendor_customer_id
          const funcSourceRes = await query(`
            SELECT prosrc
            FROM pg_proc
            WHERE proname = $1
            LIMIT 1
          `, [func.proname]);
          
          if (funcSourceRes.rows.length > 0 && funcSourceRes.rows[0].prosrc.includes('vendor_customer_id')) {
            console.log(`  ⚠️  Function ${func.proname} references vendor_customer_id - dropping...`);
            await query(`DROP FUNCTION IF EXISTS ${func.proname} CASCADE`);
            console.log(`    ✓ Dropped function: ${func.proname}`);
          }
        } catch (err) {
          // Skip if we can't check or drop
        }
      }
    } catch (err) {
      console.log('  (Could not check functions, continuing...)');
    }
    
    // Step 5: Verify table structure
    console.log('\n✅ Verifying transactions table structure...');
    const columnsRes = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      AND column_name IN ('customer_id', 'vendor_customer_id', 'to_account_id')
      ORDER BY column_name
    `);
    
    console.log('Relevant columns in transactions table:');
    columnsRes.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Check if vendor_customer_id still exists
    const hasVendorCustomerId = columnsRes.rows.some(col => col.column_name === 'vendor_customer_id');
    if (hasVendorCustomerId) {
      console.log('\n⚠️  WARNING: vendor_customer_id column still exists in the table!');
      console.log('   You may need to rename it: ALTER TABLE transactions RENAME COLUMN vendor_customer_id TO customer_id;');
    }
    
    // Step 6: Recreate a simple updated_at trigger (optional)
    console.log('\n🔧 Creating updated_at trigger function...');
    try {
      await query(`
        CREATE OR REPLACE FUNCTION update_transactions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      console.log('  ✓ Created update_transactions_updated_at() function');
      
      // Create the trigger
      await query(`
        DROP TRIGGER IF EXISTS trigger_update_transactions_updated_at ON transactions;
        CREATE TRIGGER trigger_update_transactions_updated_at
          BEFORE UPDATE ON transactions
          FOR EACH ROW
          EXECUTE FUNCTION update_transactions_updated_at()
      `);
      console.log('  ✓ Created trigger_update_transactions_updated_at trigger');
    } catch (err) {
      console.error('  ✗ Error creating updated_at trigger:', err.message);
    }
    
    console.log('\n✅ Trigger fix completed!');
    console.log('   You can now try creating a transaction again.');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error fixing triggers:', err);
    process.exit(1);
  }
}

fixTransactionsTrigger();

