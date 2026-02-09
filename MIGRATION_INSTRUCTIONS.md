# Migration Instructions

## To Fix the Seller Creation Error:

1. **Stop the backend server** (if it's running) - Press Ctrl+C in the terminal where the server is running

2. **Run the migration** to add the `adminId` field to the User table:
   ```bash
   cd backend
   npx prisma migrate dev --name add_admin_id_to_sellers
   ```

3. **Regenerate Prisma client**:
   ```bash
   npm run prisma:generate
   ```

4. **Restart the server**:
   ```bash
   npm run dev
   ```

The migration will:
- Add the `adminId` column to the `User` table
- Create the foreign key relationship
- Add the index for better query performance

