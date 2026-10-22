# 🛠️ Admin Panel — Coupon Management Integration Guide

This guide is for the **Admin Panel Frontend Engineering Team**. It explains how to build and integrate the enhanced **Coupon Management System** supporting both **DISCOUNT** and **CASHBACK** coupons, **PERCENTAGE** and **FLAT** calculations, and **ALL** vs. **SPECIFIC** user targeting.

---

## 📌 Table of Contents
1. [Core Features & Business Rules](#1-core-features--business-rules)
2. [API Reference for Admin Panel](#2-api-reference-for-admin-panel)
   - [2.1 Headers & Authentication](#21-headers--authentication)
   - [2.2 User Search & Autocomplete API](#22-user-search--autocomplete-api)
   - [2.3 Create Coupon API](#23-create-coupon-api)
   - [2.4 Update Coupon API](#24-update-coupon-api)
   - [2.5 Get Coupon by ID API](#25-get-coupon-by-id-api)
   - [2.6 List & Filter Coupons API](#26-list--filter-coupons-api)
   - [2.7 Delete Coupon API](#27-delete-coupon-api)
   - [2.8 Admin Override Refund & Cashback Reversal](#28-admin-override-refund--cashback-reversal)
   - [2.9 Inspect User Wallet](#29-inspect-user-wallet)
3. [Admin UI Wireframe & Form Field Rules](#3-admin-ui-wireframe--form-field-rules)
4. [Error Codes & Field Validation Table](#4-error-codes--field-validation-table)
5. [cURL Examples for Admin Testing](#5-curl-examples-for-admin-testing)

---

## 1. Core Features & Business Rules

### 1.1 Coupon Types
- **`DISCOUNT`**: Reduces the current booking subtotal (`finalAmount`) immediately at checkout.
- **`CASHBACK`**: Customer pays the full booking subtotal at checkout. The calculated cashback is stored as `PENDING` on the booking and automatically credited to the customer's **Customer Wallet (`UserWallet`)** once their stay/service is completed (`checkOut <= now`).

### 1.2 Calculation Types
- **`PERCENTAGE`**: Calculates discount/cashback as a percentage of the booking subtotal (1% - 100%).
  - Supports optional `maxDiscount` (maximum SAR cap).
- **`FLAT`**: Calculates discount/cashback as a fixed SAR amount.

### 1.3 User Restrictions
- **`ALL`**: Any customer on the platform can use the coupon.
- **`SPECIFIC`**: Only customers explicitly whitelisted in `applicableUsers` can view or apply the coupon.

### 1.4 Automatic Cancellation Handling
- If a booking with `cashbackStatus: "CREDITED"` is cancelled or refunded by an admin, the system automatically deducts/reverses the cashback from the customer's wallet (`transactionType: "cashback_reversal"`), sets `cashbackStatus: "REVERSED"`, and restores coupon usage.

---

## 2. API Reference for Admin Panel

### 2.1 Headers & Authentication
All Admin endpoints require an Admin Bearer token:
```http
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```

---

### 2.2 User Search & Autocomplete API
Use this endpoint in the admin form when the admin selects `userRestriction: "SPECIFIC"` to search and pick users.

```http
GET /api/admin/get-all-users?search={query}&page={page}&pageSize={pageSize}
```

#### Query Parameters:
| Param | Type | Description |
| :--- | :--- | :--- |
| `search` | `String` | Search term (matches first name, last name, phone, or email) |
| `page` | `Number` | Page number (default: 1) |
| `pageSize` | `Number` | Results per page (default: 10 or 20) |
| `status` | `String` | `"active"` or `"inactive"` |

#### Response (`200 OK`):
```json
{
  "success": true,
  "message": "Users fetched successfully",
  "data": [
    {
      "_id": "664b1f893e18a0e88c0a1122",
      "firstName": "Ahmad",
      "lastName": "Al-Mansour",
      "email": "ahmad@example.com",
      "phone": "+966580000001",
      "profile": "uploads/profiles/ahmad.jpg",
      "userId": "USR-10023",
      "isActive": true
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### 2.3 Create Coupon API
```http
POST /api/admin/createCoupon
```

#### Request Payload Specification:
| Field | Type | Required | Valid Values / Constraints |
| :--- | :--- | :--- | :--- |
| `code` | `String` | **Yes** | Coupon code string. Automatically trimmed and converted to UPPERCASE. Unique. |
| `couponType` | `String` | **Yes** | `"DISCOUNT"` or `"CASHBACK"` (default: `"DISCOUNT"`) |
| `discountType` | `String` | **Yes** | `"PERCENTAGE"` or `"FLAT"` |
| `discountValue` | `Number` | **Yes** | Number $> 0$. If `PERCENTAGE`, must be $\le 100$. |
| `maxDiscount` | `Number` | Optional | Cap amount in SAR (only applicable when `discountType` is `PERCENTAGE`). |
| `minAmount` | `Number` | Optional | Minimum booking subtotal in SAR (default: 0). |
| `userRestriction` | `String` | **Yes** | `"ALL"` or `"SPECIFIC"` (default: `"ALL"`). |
| `applicableUsers` | `Array<String>` | **If SPECIFIC** | Non-empty array of valid User `_id` strings. All users must exist in DB. |
| `startDate` | `ISO Date` | **Yes** | Start of validity period (e.g. `"2026-10-22T00:00:00.000Z"`). |
| `expiryDate` | `ISO Date` | **Yes** | End of validity period. Must be after `startDate`. |
| `usageLimit` | `Number` | Optional | Maximum total redemptions platform-wide. |
| `firstTimeUserOnly` | `Boolean` | Optional | `true` if restricted to customers with 0 previous confirmed bookings. |
| `applicableProperties`| `Array<String>` | Optional | Property `_id`s (empty array = valid on all properties). |
| `applicableCategories`| `Array<String>` | Optional | Category `_id`s (empty array = valid on all categories). |

#### Payload Examples:

##### Example A: 15% Cashback Coupon for Specific Whitelisted Users (Capped at 200 SAR)
```json
{
  "code": "VIPCASH15",
  "couponType": "CASHBACK",
  "discountType": "PERCENTAGE",
  "discountValue": 15,
  "maxDiscount": 200,
  "minAmount": 500,
  "userRestriction": "SPECIFIC",
  "applicableUsers": [
    "664b1f893e18a0e88c0a1122",
    "664b1f893e18a0e88c0a3344"
  ],
  "startDate": "2026-10-22T00:00:00.000Z",
  "expiryDate": "2026-12-31T23:59:59.000Z",
  "usageLimit": 100,
  "firstTimeUserOnly": false
}
```

##### Example B: Flat 50 SAR Cashback for All Users
```json
{
  "code": "CASH50FLAT",
  "couponType": "CASHBACK",
  "discountType": "FLAT",
  "discountValue": 50,
  "minAmount": 300,
  "userRestriction": "ALL",
  "startDate": "2026-10-22T00:00:00.000Z",
  "expiryDate": "2026-12-31T23:59:59.000Z",
  "usageLimit": 500
}
```

##### Example C: 20% Instant Discount for All Users (Capped at 150 SAR)
```json
{
  "code": "SAVE20",
  "couponType": "DISCOUNT",
  "discountType": "PERCENTAGE",
  "discountValue": 20,
  "maxDiscount": 150,
  "minAmount": 400,
  "userRestriction": "ALL",
  "startDate": "2026-10-22T00:00:00.000Z",
  "expiryDate": "2026-11-30T23:59:59.000Z",
  "usageLimit": 1000
}
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Coupon created successfully",
  "data": {
    "_id": "67174bb09e25bb883b28b7a1",
    "code": "VIPCASH15",
    "couponType": "CASHBACK",
    "discountType": "PERCENTAGE",
    "discountValue": 15,
    "maxDiscount": 200,
    "minAmount": 500,
    "userRestriction": "SPECIFIC",
    "applicableUsers": [
      "664b1f893e18a0e88c0a1122",
      "664b1f893e18a0e88c0a3344"
    ],
    "cashbackTrigger": "ON_BOOKING_COMPLETED",
    "usageLimit": 100,
    "usedCount": 0,
    "status": "ACTIVE",
    "isActive": true,
    "isDelete": false,
    "startDate": "2026-10-22T00:00:00.000Z",
    "expiryDate": "2026-12-31T23:59:59.000Z",
    "createdAt": "2026-10-22T06:50:00.000Z"
  }
}
```

---

### 2.4 Update Coupon API
```http
PATCH /api/admin/updateCoupon/:couponId
```
Admins can modify expiry dates, usage limits, user restriction type, or user arrays.

```json
{
  "discountValue": 20,
  "maxDiscount": 250,
  "expiryDate": "2027-01-31T23:59:59.000Z",
  "usageLimit": 150,
  "userRestriction": "SPECIFIC",
  "applicableUsers": [
    "664b1f893e18a0e88c0a1122"
  ]
}
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "message": "Coupon updated successfully",
  "data": { ... }
}
```

---

### 2.5 Get Coupon by ID API
Fetches the full details of a single coupon with populated `applicableUsers` details.
```http
GET /api/admin/getCouponById/:couponId
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "message": "Coupon retrieved successfully",
  "data": {
    "_id": "67174bb09e25bb883b28b7a1",
    "code": "VIPCASH15",
    "couponType": "CASHBACK",
    "discountType": "PERCENTAGE",
    "discountValue": 15,
    "maxDiscount": 200,
    "minAmount": 500,
    "userRestriction": "SPECIFIC",
    "applicableUsers": [
      {
        "_id": "664b1f893e18a0e88c0a1122",
        "firstName": "Ahmad",
        "lastName": "Al-Mansour",
        "email": "ahmad@example.com",
        "phone": "+966580000001",
        "profile": "uploads/profiles/ahmad.jpg",
        "userId": "USR-10023"
      }
    ],
    "usageLimit": 100,
    "usedCount": 12,
    "status": "ACTIVE",
    "isActive": true,
    "startDate": "2026-10-22T00:00:00.000Z",
    "expiryDate": "2026-12-31T23:59:59.000Z"
  }
}
```

---

### 2.6 List & Filter Coupons API
```http
GET /api/admin/getAllCoupons?couponType=CASHBACK&userRestriction=SPECIFIC&status=ACTIVE&search=VIP&page=1&pageSize=10
```

#### Query Filter Parameters:
| Param | Values | Function |
| :--- | :--- | :--- |
| `couponType` | `DISCOUNT` or `CASHBACK` | Filters by coupon mode |
| `userRestriction` | `ALL` or `SPECIFIC` | Filters by user audience |
| `status` | `ACTIVE`, `EXPIRED`, `INACTIVE` | Filters by active status |
| `search` | `String` | Searches code prefix or substring |
| `page`, `pageSize`| `Number` | Pagination controls |

#### Response (`200 OK`):
```json
{
  "success": true,
  "message": "Coupons retrieved successfully",
  "data": [
    {
      "_id": "67174bb09e25bb883b28b7a1",
      "code": "VIPCASH15",
      "couponType": "CASHBACK",
      "discountType": "PERCENTAGE",
      "discountValue": 15,
      "maxDiscount": 200,
      "minAmount": 500,
      "userRestriction": "SPECIFIC",
      "applicableUsers": [
        {
          "_id": "664b1f893e18a0e88c0a1122",
          "firstName": "Ahmad",
          "lastName": "Al-Mansour",
          "email": "ahmad@example.com",
          "phone": "+966580000001"
        }
      ],
      "usedCount": 5,
      "usageLimit": 100,
      "status": "ACTIVE"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pageSize": 10,
    "totalPages": 1
  }
}
```

---

### 2.7 Delete Coupon API
Soft-deletes the coupon so existing historical bookings referencing this coupon are preserved.
```http
DELETE /api/admin/deleteCoupon/:couponId
```

---

### 2.8 Admin Override Refund & Cashback Reversal
When an admin cancels and refunds a booking:
```http
POST /api/admin/adminOverrideRefund/:bookingId
Content-Type: application/json

{
  "refundAmount": 1200,
  "reason": "Host maintenance issue; full refund approved"
}
```
**Automatic Backend Actions**:
1. If the booking had `cashbackStatus: "CREDITED"`, the cashback amount is automatically deducted from the customer's wallet (`UserWalletTransaction` logged with `transactionType: "cashback_reversal"`).
2. Sets `booking.cashbackStatus: "REVERSED"`.
3. If the booking was still `PENDING`, sets `cashbackStatus: "CANCELLED"`.
4. Decrements `Coupon.usedCount` and restores user eligibility.

---

### 2.9 Inspect User Wallet
To verify a customer's wallet balance and transactions from the admin panel:
```http
GET /api/admin/getUserWallet/:userId
```
Returns current balance and full transaction history including `"cashback"` credits and `"cashback_reversal"` debits.

---

## 3. Admin UI Wireframe & Form Field Rules

### Dynamic Form Behavior
1. **Coupon Type Selector**:
   - Radio buttons: `[ ] Discount (Price Reduction)` vs. `[*] Cashback (Wallet Credit Post-Stay)`.
2. **Calculation Mode**:
   - Radio buttons: `[*] Percentage (%)` vs. `[ ] Flat (SAR)`.
   - **Conditional Field**: If `Percentage`, show **Max Discount Cap (SAR)**. If `Flat`, hide or disable **Max Discount Cap**.
3. **Audience Restriction**:
   - Radio buttons: `[*] All Users` vs. `[ ] Specific Users`.
   - **Conditional Field**: If `Specific Users`, display the **User Search & Autocomplete Multiselect Box**. Use `GET /api/admin/get-all-users?search=...` to populate the options.
4. **Dates**:
   - Start Date and Expiry Date with date-picker (`expiryDate > startDate`).

```
+---------------------------------------------------------------------------------+
| CREATE COUPON                                                                   |
+---------------------------------------------------------------------------------+
| Coupon Code:        [ VIPCASH15                                ]                |
|                                                                                 |
| Coupon Type:        ( ) DISCOUNT             (*) CASHBACK                       |
|                     (Reduces price now)      (Credits to wallet after stay)     |
|                                                                                 |
| Calculation Mode:   (*) PERCENTAGE (%)       ( ) FLAT AMOUNT (SAR)              |
| Value:              [ 15.00                ] % / SAR                            |
| Max Discount Cap:   [ 200.00               ] SAR (Optional cap for %)           |
| Minimum Spend:      [ 500.00               ] SAR                                |
|                                                                                 |
| Target Audience:    ( ) All Users            (*) Specific Users                 |
|                                                                                 |
| Applicable Users:   [ Ahmad Al-Mansour (+966580000001) [x]    ]                 |
|                     [ Type name, phone or email to add...   v ]                 |
|                                                                                 |
| Start Date:         [ 2026-10-22 00:00     ]                                    |
| Expiry Date:        [ 2026-12-31 23:59     ]                                    |
| Total Usage Limit:  [ 100                  ] (Leave empty for unlimited)        |
| First-time Only:    [ ] Only allow for customers with 0 previous bookings       |
|                                                                                 |
|                     [ CANCEL ]             [ CREATE COUPON ]                    |
+---------------------------------------------------------------------------------+
```

---

## 4. Error Codes & Field Validation Table

| HTTP Status | Error Message | Reason & Admin UI Action |
| :--- | :--- | :--- |
| `400 Bad Request` | `"couponType must be either DISCOUNT or CASHBACK"` | Validate radio selection before submitting. |
| `400 Bad Request` | `"Percentage discount/cashback cannot exceed 100"` | Ensure percentage value is between 1 and 100. |
| `400 Bad Request` | `"Expiry date must be after start date"` | Ensure `expiryDate > startDate`. |
| `400 Bad Request` | `"At least one user must be selected when userRestriction is SPECIFIC"` | Require at least 1 selected user in the multiselect box when `SPECIFIC` is active. |
| `400 Bad Request` | `"Invalid user ID(s) in applicableUsers"` | Ensure IDs are 24-char MongoDB ObjectIds. |
| `400 Bad Request` | `"One or more selected users do not exist or are deleted"` | User was deleted from DB; refresh user dropdown. |
| `400 Bad Request` | `"Coupon code already exists"` | Code must be unique across non-deleted coupons. Prompt admin to use another code. |

---

## 5. cURL Examples for Admin Testing

### 1. Create a 10% Cashback Coupon (All Users)
```bash
curl -X POST "http://localhost:8088/api/admin/createCoupon" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "CASHBACK10",
    "couponType": "CASHBACK",
    "discountType": "PERCENTAGE",
    "discountValue": 10,
    "maxDiscount": 150,
    "minAmount": 400,
    "userRestriction": "ALL",
    "startDate": "2026-10-22T00:00:00.000Z",
    "expiryDate": "2026-12-31T23:59:59.000Z",
    "usageLimit": 200
  }'
```

### 2. Create a Specific User Cashback Coupon
```bash
curl -X POST "http://localhost:8088/api/admin/createCoupon" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "EXCLUSIVEVIP",
    "couponType": "CASHBACK",
    "discountType": "FLAT",
    "discountValue": 100,
    "minAmount": 500,
    "userRestriction": "SPECIFIC",
    "applicableUsers": ["664b1f893e18a0e88c0a1122"],
    "startDate": "2026-10-22T00:00:00.000Z",
    "expiryDate": "2026-12-31T23:59:59.000Z",
    "usageLimit": 50
  }'
```

### 3. Filter Coupons in Admin Table
```bash
curl -X GET "http://localhost:8088/api/admin/getAllCoupons?couponType=CASHBACK&userRestriction=SPECIFIC" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```
