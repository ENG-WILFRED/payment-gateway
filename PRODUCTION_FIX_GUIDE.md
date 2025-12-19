# Production Database Fix Guide

## Problem Summary

Your production database had a corrupted migration state because the initial migration (001-create-payments-table.js) had a syntax error. This caused the table to be created but without many of the required columns, including `referenceId`.

**Error in production:** 
```
column "referenceId" of relation "payments" does not exist
```

## What We Did

### 1. Fixed the Syntax Error (Locally)
The first migration had incorrect syntax - the index creation code was outside the `up()` function. This was fixed in [migrations/001-create-payments-table.js](migrations/001-create-payments-table.js).

### 2. Created a Fix Migration
Since the production database was partially migrated, we created a new migration [migrations/003-fix-missing-columns.js](migrations/003-fix-missing-columns.js) that:
- Checks which columns are missing
- Adds only the missing columns
- Handles columns that may already exist gracefully
- Creates indexes if they don't exist

### 3. Pushed to Repository
The fix migration is now committed to git and will be applied during the next deployment.

## What Happens on Next Deploy

When Render.com redeploys your application:

1. It will pull the latest code from git (including the fix migration)
2. Run: `npm install; npm run build ; npx sequelize-cli db:migrate`
3. Sequelize will detect that migration 003 hasn't run yet
4. It will execute 003, adding the missing columns
5. Your application will work correctly

## Verification Commands

To verify everything is working, you can run these commands locally:

### Verify local database is set up correctly:
```bash
npm run migrate
```

Should show both migrations as migrated:
```
== 001-create-payments-table: migrated
== 002-add-provider-metadata: migrated
```

### Check what columns exist in the database:
```bash
# After migrations, the payments table should have all these columns:
- id (UUID, primary key)
- provider (STRING)
- providerTransactionId (STRING)
- amount (DECIMAL)
- status (STRING)
- raw (JSONB)
- providerMetadata (JSONB)
- referenceId (STRING) ✓ This was missing in production
- merchantId (STRING)
- userId (UUID)
- transactionDescription (STRING)
- notes (TEXT)
- customerPhone (STRING)
- customerEmail (STRING)
- completedAt (DATE)
- retryCount (INTEGER)
- nextRetryAt (DATE)
- createdAt (DATE)
- updatedAt (DATE)
```

### Test M-Pesa endpoint locally:
```bash
curl -X POST http://localhost:3001/payments/mpesa/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "amount": "100",
    "stkCallback": "https://webhook.site/your-id",
    "referenceId": "TEST-ORDER-001"
  }'
```

## Timeline

1. **Fixed locally** - Corrected syntax in 001 migration
2. **Committed** - Pushed fix migration 003 to git
3. **Next Deploy** - When Render redeploys, migration 003 will run and fix the production DB

## Important Notes

- **Do NOT manually reset the production database** - The fix migration handles it gracefully
- The fix migration is idempotent - it only adds columns if they don't exist
- If you deployed before the fix, your current deployed code has the corrected migration files
- All new API requests to M-Pesa and other endpoints will work once the migration runs

## What If You Need Immediate Fix?

If you need to manually trigger the migration fix in production, you would need SSH access to the Render container and could run:

```bash
cd /app
npx sequelize-cli db:migrate
```

But this should happen automatically on the next deployment.

## Prevention for Future

To prevent similar issues:
- Always test migrations locally first
- Ensure all code is tested before git push
- Run `npm run migrate` locally after making migration changes
- Test API endpoints that depend on the new schema

