# Test Script: Seller Visibility Bug Fix

## Prerequisites
- Backend server running: `cd backend && npm run dev`
- Database seeded with test data
- Admin "Akshat" exists with electronics category assigned
- Super Admin account exists

## Test Case 1: Admin Creates Seller (Main Bug Fix)

### Step 1: Login as Admin Akshat
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "akshat@example.com",
    "password": "your_password"
  }'
```

**Save the token from response as `ADMIN_TOKEN`**

### Step 2: Create Seller
```bash
curl -X POST http://localhost:5000/api/sellers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "adminEmail": "akshat@example.com",
    "email": "bhupesh@example.com",
    "password": "password123",
    "name": "Bhupesh Chandel",
    "phone": "9334968238",
    "businessName": "Mobile company",
    "commissionRate": 15
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Seller created",
  "data": {
    "id": "seller_id",
    "name": "Bhupesh Chandel",
    "email": "bhupesh@example.com",
    "role": "seller",
    "businessName": "Mobile company",
    "createdBy": "admin_id"
  }
}
```

### Step 3: List Sellers as Admin (CRITICAL TEST)
```bash
curl -X GET http://localhost:5000/api/sellers \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected Result:** ✅ Seller "Bhupesh Chandel" MUST appear in the list

**Before Fix:** ❌ Seller would NOT appear
**After Fix:** ✅ Seller DOES appear

---

## Test Case 2: Super Admin View

### Step 1: Login as Super Admin
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@example.com",
    "password": "your_password"
  }'
```

**Save the token from response as `SUPER_ADMIN_TOKEN`**

### Step 2: List All Sellers
```bash
curl -X GET http://localhost:5000/api/sellers \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Sellers fetched",
  "data": [
    {
      "id": "seller_id",
      "name": "Bhupesh Chandel",
      "email": "bhupesh@example.com",
      "role": "seller",
      "businessName": "Mobile company",
      "admin": {
        "id": "admin_id",
        "name": "Akshat",
        "email": "akshat@example.com"
      },
      "createdByUser": {
        "id": "admin_id",
        "name": "Akshat",
        "email": "akshat@example.com",
        "role": "admin"
      }
    }
  ]
}
```

**Expected Result:** ✅ All sellers visible with admin name displayed

---

## Test Case 3: Admin Adds Product to Seller

### Step 1: Create Product for Seller (as Admin)
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "sellerId": "seller_id_from_step_2",
    "categoryId": 1,
    "name": "Test Product",
    "description": "Test Description",
    "price": 100,
    "stock": "available",
    "deity": "Ganesh",
    "material": "Brass",
    "height": 10,
    "weight": 100,
    "religionCategory": "Hindu",
    "packagingType": "Box"
  }'
```

### Step 2: List Sellers Again
```bash
curl -X GET http://localhost:5000/api/sellers \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected Result:** ✅ Seller still visible (now with products)

---

## Test Case 4: Admin Cannot See Other Admin's Sellers

### Step 1: Login as Different Admin (e.g., "Fashion Admin")
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fashion_admin@example.com",
    "password": "your_password"
  }'
```

**Save the token as `FASHION_ADMIN_TOKEN`**

### Step 2: List Sellers
```bash
curl -X GET http://localhost:5000/api/sellers \
  -H "Authorization: Bearer FASHION_ADMIN_TOKEN"
```

**Expected Result:** ❌ Seller "Bhupesh Chandel" should NOT appear (created by Akshat, not fashion admin)

---

## Test Case 5: Admin Cannot Access Other Admin's Seller Details

### Step 1: Try to Get Seller Details
```bash
curl -X GET http://localhost:5000/api/sellers/seller_id \
  -H "Authorization: Bearer FASHION_ADMIN_TOKEN"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "You do not have permission to access this seller. Sellers must belong to your assigned categories and be created by you or a super admin."
}
```

**Expected Status Code:** 403 Forbidden

---

## Test Case 6: Seller with Products in Wrong Category

### Step 1: Create Seller (as Akshat - electronics admin)
```bash
curl -X POST http://localhost:5000/api/sellers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "adminEmail": "akshat@example.com",
    "email": "test_seller@example.com",
    "password": "password123",
    "name": "Test Seller",
    "businessName": "Test Business"
  }'
```

### Step 2: Verify Seller is Visible
```bash
curl -X GET http://localhost:5000/api/sellers \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected:** ✅ Seller visible (no products yet)

### Step 3: Add Product in Fashion Category (not electronics)
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -d '{
    "sellerId": "test_seller_id",
    "categoryId": 2,
    "name": "Fashion Product",
    "price": 100,
    "stock": "available"
  }'
```

### Step 4: List Sellers Again
```bash
curl -X GET http://localhost:5000/api/sellers \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Expected:** ❌ Seller should become invisible (has products but not in electronics category)

---

## Verification Checklist

- [ ] Admin sees newly created seller immediately (no products)
- [ ] Admin sees seller after adding products in their category
- [ ] Super Admin sees all sellers
- [ ] Super Admin sees admin name for each seller
- [ ] Admin cannot see sellers from other admins
- [ ] Admin cannot access seller details from other admins (403)
- [ ] Seller becomes invisible if all products are in wrong category
- [ ] Authorization failures are logged to console

---

## Expected Console Logs

When authorization fails, you should see logs like:

```
[2026-02-09T...] [WARN] Authorization failure: User {userId} (role: admin) attempted to view seller {sellerId}. Reason: Seller not in admin's assigned categories or not created by admin/super_admin
```

---

## Troubleshooting

### Seller Not Visible After Creation

1. Check admin has category assigned:
```sql
SELECT * FROM "AdminCategory" WHERE "adminId" = 'admin_id';
```

2. Check seller was created with correct adminId:
```sql
SELECT id, name, email, "adminId", "createdById" FROM "User" WHERE role = 'seller';
```

3. Check backend logs for authorization errors

### Super Admin Not Seeing Admin Name

1. Verify seller has adminId set:
```sql
SELECT id, name, "adminId" FROM "User" WHERE role = 'seller';
```

2. Check API response includes `admin` field

### Products Not Affecting Visibility

1. Verify product has correct categoryId:
```sql
SELECT id, name, "sellerId", "categoryId" FROM "Product";
```

2. Verify admin has that category assigned:
```sql
SELECT * FROM "AdminCategory" WHERE "adminId" = 'admin_id';
```

---

## Success Criteria

✅ All test cases pass
✅ No console errors
✅ Authorization failures are logged
✅ Admin sees their sellers immediately after creation
✅ Super Admin sees all sellers with admin names
✅ Data integrity maintained (no orphaned records)
