# Testing Category-Based Seller Filtering

## Manual Testing Guide

This guide helps you manually test the category-based seller filtering implementation.

## Prerequisites

1. Start the backend server: `npm run dev` (in backend directory)
2. Ensure database is seeded with test data
3. Have API testing tool ready (Postman, Thunder Client, or curl)

## Test Scenarios

### Scenario 1: Super Admin Access (Should see ALL sellers)

**Login as Super Admin:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "super_admin@example.com",
  "password": "your_password"
}
```

**List Sellers:**
```
GET http://localhost:5000/api/sellers
Authorization: Bearer {super_admin_token}
```

**Expected Result:** Should return ALL sellers in the system, regardless of category.

---

### Scenario 2: Admin with Electronics Category (Should see only electronics sellers)

**Login as Admin (akshat):**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "akshat@example.com",
  "password": "your_password"
}
```

**List Sellers:**
```
GET http://localhost:5000/api/sellers
Authorization: Bearer {admin_token}
```

**Expected Result:** 
- Should return ONLY sellers who have products in the "electronics" category
- Should return ONLY sellers created by akshat OR by super admin
- Should NOT return sellers from other categories (fashion, home, etc.)
- Should NOT return sellers created by other admins

---

### Scenario 3: Admin Accessing Unauthorized Seller (Should get 403)

**Get Seller Details (seller NOT in admin's category):**
```
GET http://localhost:5000/api/sellers/{seller_id_from_different_category}
Authorization: Bearer {admin_token}
```

**Expected Result:** 
- Status: 403 Forbidden
- Message: "You do not have permission to access this seller..."

---

### Scenario 4: Admin with Multiple Categories

**Login as Admin with multiple category assignments:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "multi_category_admin@example.com",
  "password": "your_password"
}
```

**List Sellers:**
```
GET http://localhost:5000/api/sellers
Authorization: Bearer {admin_token}
```

**Expected Result:** Should return sellers from ANY of the admin's assigned categories (OR logic).

---

### Scenario 5: Admin with No Assigned Categories (Should get empty list)

**Login as Admin with no category assignments:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "no_category_admin@example.com",
  "password": "your_password"
}
```

**List Sellers:**
```
GET http://localhost:5000/api/sellers
Authorization: Bearer {admin_token}
```

**Expected Result:** Should return empty array `[]`.

---

### Scenario 6: Update Seller (Authorization Check)

**Admin attempts to update seller in their category:**
```
PUT http://localhost:5000/api/sellers/{authorized_seller_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "businessName": "Updated Business Name"
}
```

**Expected Result:** Success - seller updated.

**Admin attempts to update seller NOT in their category:**
```
PUT http://localhost:5000/api/sellers/{unauthorized_seller_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "businessName": "Updated Business Name"
}
```

**Expected Result:** 
- Status: 403 Forbidden
- Message: "You do not have permission to update this seller..."

---

### Scenario 7: Delete Seller (Authorization Check)

**Admin attempts to delete seller in their category:**
```
DELETE http://localhost:5000/api/sellers/{authorized_seller_id}
Authorization: Bearer {admin_token}
```

**Expected Result:** Success - seller deleted.

**Admin attempts to delete seller NOT in their category:**
```
DELETE http://localhost:5000/api/sellers/{unauthorized_seller_id}
Authorization: Bearer {admin_token}
```

**Expected Result:** 
- Status: 403 Forbidden
- Message: "You do not have permission to delete this seller..."

---

## Verification Checklist

- [ ] Super admin sees all sellers
- [ ] Admin sees only sellers in their assigned categories
- [ ] Admin sees only sellers created by themselves or super admin
- [ ] Admin with multiple categories sees sellers from all assigned categories
- [ ] Admin with no categories gets empty list
- [ ] Admin cannot view unauthorized seller details (403)
- [ ] Admin cannot update unauthorized seller (403)
- [ ] Admin cannot delete unauthorized seller (403)
- [ ] Authorization failures are logged to console
- [ ] Error messages are descriptive and helpful

## Database Verification

To verify the filtering logic, check the database:

```sql
-- Check admin's assigned categories
SELECT ac.*, c.name as category_name 
FROM "AdminCategory" ac
JOIN "Category" c ON ac."categoryId" = c.id
WHERE ac."adminId" = 'admin_user_id';

-- Check sellers with products in specific category
SELECT DISTINCT u.id, u.name, u.email, p."categoryId"
FROM "User" u
JOIN "Product" p ON u.id = p."sellerId"
WHERE u.role = 'seller' AND p."categoryId" IN (category_ids);

-- Check seller creator
SELECT id, name, email, "createdById"
FROM "User"
WHERE role = 'seller';
```

## Notes

- All authorization failures should be logged to the console with format:
  `[timestamp] [WARN] Authorization failure: User {userId} (role: {role}) attempted to {operation} seller {sellerId}. Reason: {reason}`

- The filtering is based on:
  1. Seller has products in admin's assigned categories
  2. Seller was created by the admin OR by a super admin

- Super admins are never restricted and always see all sellers.
