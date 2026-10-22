# 🎟️ Coupon Management System — Admin & User Integration Guide

Comprehensive integration documentation for implementing the enhanced **Coupon Management System** across the **Admin Panel** and **User (Web & Mobile Apps)**.

---

## 📌 Table of Contents
1. [Architecture & Core Concepts](#1-architecture--core-concepts)
2. [Admin Panel Integration Guide](#2-admin-panel-integration-guide)
   - [2.1 Authentication & Base URL](#21-authentication--base-url)
   - [2.2 Fetch Users for Specific Restriction](#22-fetch-users-for-specific-restriction)
   - [2.3 Create Coupon](#23-create-coupon)
   - [2.4 Update Coupon](#24-update-coupon)
   - [2.5 Get Coupon by ID](#25-get-coupon-by-id)
   - [2.6 List Coupons with Filters & Search](#26-list-coupons-with-filters--search)
   - [2.7 Delete Coupon](#27-delete-coupon)
   - [2.8 Admin Override Refund & Cashback Reversal](#28-admin-override-refund--cashback-reversal)
   - [2.9 Recommended Admin UI Form Blueprint](#29-recommended-admin-ui-form-blueprint)
3. [User Application (Web/App) Integration Guide](#3-user-application-webapp-integration-guide)
   - [3.1 Fetch Available Coupons](#31-fetch-available-coupons)
   - [3.2 Step 1: Check Availability & Coupon Calculation](#32-step-1-check-availability--coupon-calculation)
   - [3.3 Step 2: Customer Wallet Balance Check](#33-step-2-customer-wallet-balance-check)
   - [3.4 Step 3: Create Booking (Wallet & Mixed Payment)](#34-step-3-create-booking-wallet--mixed-payment)
   - [3.5 Step 4: Online Payment (TAP Gateway)](#35-step-4-online-payment-tap-gateway)
   - [3.6 Step 5: Automated Stay-Completion Cashback Fulfillment](#36-step-5-automated-stay-completion-cashback-fulfillment)
   - [3.7 Step 6: Using Earned Cashback on Subsequent Bookings](#37-step-6-using-earned-cashback-on-subsequent-bookings)
   - [3.8 Step 7: Booking Cancellation & Cashback Reversal](#38-step-7-booking-cancellation--cashback-reversal)
4. [Error Codes & Edge Cases Reference](#4-error-codes--edge-cases-reference)
5. [Complete cURL Request Samples](#5-complete-curl-request-samples)

---

## 1. Architecture & Core Concepts

```
                  ┌──────────────────────────────────────────────┐
                  │             COUPON CONFIGURATION             │
                  ├──────────────────────┬───────────────────────┤
                  │     couponType       │    userRestriction    │
                  ├──────────────────────┼───────────────────────┤
                  │ DISCOUNT  │ CASHBACK │   ALL   │  SPECIFIC   │
                  └───────────┴──────────┴─────────┴─────────────┘
                                    │
                                    ▼
       ┌────────────────────────────┴───────────────────────────┐
       │                                                        │
       ▼                                                        ▼
[DISCOUNT COUPON]                                       [CASHBACK COUPON]
• Instant price reduction at checkout                  • Customer pays full booking price at checkout
• Reduces finalAmount & grandTotal                     • cashbackAmount calculated & held as PENDING
• No wallet balance changes                            • Automatically credited to UserWallet on checkout/stay completion
                                                       • Reversible if booking cancelled post-stay
```

### Key Differences
| Parameter | `DISCOUNT` | `CASHBACK` |
| :--- | :--- | :--- |
| **Price at Checkout** | Deducted immediately (`finalAmount = total - discount`) | Full price paid (`finalAmount` unchanged) |
| **Calculation Base** | Booking subtotal (before platform fee and tax) | Booking subtotal (before platform fee and tax) |
| **Wallet Impact** | None | Credits customer `UserWallet` after stay completes |
| **Crediting Trigger** | Instant at payment | Automated Hourly Cron once `checkOut <= now` |
| **Cancellation Impact** | Coupon usage count restored | If `PENDING` $\to$ `CANCELLED`<br>If `CREDITED` $\to$ Debited back from `UserWallet` (`cashback_reversal`) |

### Strict Ledger Separation
- **Customer Wallet (`UserWallet`)**: Customer cashback credits, wallet payment holds, and customer refunds.
- **Provider Wallet (`Wallet`)**: Host/Provider earnings and 48-hour post-check-in payout releases.
> **Note**: Provider wallets and customer wallets never interact directly.

---

## 2. Admin Panel Integration Guide

### 2.1 Authentication & Base URL
- **Base URL**: `https://<YOUR_API_DOMAIN>/api/admin`
- **Headers**:
```http
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```

---

### 2.2 Fetch Users for Specific Restriction
When the admin toggles **User Restriction** to `SPECIFIC`, use this endpoint to populate the multi-select user dropdown.

```http
GET /api/admin/get-all-users?search=ahmad&page=1&pageSize=20
```

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

### 2.3 Create Coupon
```http
POST /api/admin/createCoupon
```

#### Request Payload Schema:
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `code` | `String` | Yes | Unique coupon code (auto-uppercased, e.g. `SUMMER20`) |
| `couponType` | `String` | Yes | `"DISCOUNT"` or `"CASHBACK"` |
| `discountType` | `String` | Yes | `"PERCENTAGE"` or `"FLAT"` |
| `discountValue` | `Number` | Yes | Percentage (1 to 100) or Flat SAR amount |
| `maxDiscount` | `Number` | Optional | Maximum SAR cap (relevant for `PERCENTAGE`) |
| `minAmount` | `Number` | Optional | Minimum booking subtotal required (default: 0) |
| `userRestriction` | `String` | Yes | `"ALL"` or `"SPECIFIC"` (default: `"ALL"`) |
| `applicableUsers` | `Array<String>` | If `SPECIFIC` | Array of User `_id` strings (must exist in DB) |
| `startDate` | `ISO Date` | Yes | Validity start date |
| `expiryDate` | `ISO Date` | Yes | Validity expiry date (must be $>$ `startDate`) |
| `usageLimit` | `Number` | Optional | Total times coupon can be redeemed across platform |
| `firstTimeUserOnly`| `Boolean` | Optional | Limit to users with 0 prior confirmed bookings |
| `applicableProperties`| `Array<String>` | Optional | Property `_id` restrictions (empty = all properties) |
| `applicableCategories`| `Array<String>` | Optional | Category `_id` restrictions (empty = all categories) |

#### Example 1: 15% Cashback Coupon for Specific Users
```json
{
  "code": "CASHBACKVIP15",
  "couponType": "CASHBACK",
  "discountType": "PERCENTAGE",
  "discountValue": 15,
  "maxDiscount": 200,
  "minAmount": 500,
  "userRestriction": "SPECIFIC",
  "applicableUsers": [
    "664b1f893e18a0e88c0a1122"
  ],
  "startDate": "2026-10-22T00:00:00.000Z",
  "expiryDate": "2026-12-31T23:59:59.000Z",
  "usageLimit": 50,
  "firstTimeUserOnly": false
}
```

#### Example 2: Flat 100 SAR Discount for All Users
```json
{
  "code": "FLAT100OFF",
  "couponType": "DISCOUNT",
  "discountType": "FLAT",
  "discountValue": 100,
  "minAmount": 800,
  "userRestriction": "ALL",
  "startDate": "2026-10-22T00:00:00.000Z",
  "expiryDate": "2026-12-31T23:59:59.000Z",
  "usageLimit": 500
}
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Coupon created successfully",
  "data": {
    "_id": "67174bb09e25bb883b28b7a1",
    "code": "CASHBACKVIP15",
    "couponType": "CASHBACK",
    "discountType": "PERCENTAGE",
    "discountValue": 15,
    "maxDiscount": 200,
    "minAmount": 500,
    "userRestriction": "SPECIFIC",
    "applicableUsers": [
      "664b1f893e18a0e88c0a1122"
    ],
    "cashbackTrigger": "ON_BOOKING_COMPLETED",
    "usageLimit": 50,
    "usedCount": 0,
    "status": "ACTIVE",
    "isActive": true,
    "isDelete": false,
    "startDate": "2026-10-22T00:00:00.000Z",
    "expiryDate": "2026-12-31T23:59:59.000Z",
    "createdAt": "2026-10-22T06:40:00.000Z"
  }
}
```

---

### 2.4 Update Coupon
```http
PATCH /api/admin/updateCoupon/:couponId
```
Admins can modify expiry dates, usage limits, user restrictions, and users.
```json
{
  "discountValue": 20,
  "maxDiscount": 250,
  "expiryDate": "2027-01-31T23:59:59.000Z",
  "userRestriction": "SPECIFIC",
  "applicableUsers": [
    "664b1f893e18a0e88c0a1122",
    "664b1f893e18a0e88c0a3344"
  ]
}
```

---

### 2.5 Get Coupon by ID
Fetches full coupon configuration with populated user details (`firstName`, `lastName`, `email`, `phone`, `profile`).
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
    "code": "CASHBACKVIP15",
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
    "usedCount": 3,
    "status": "ACTIVE",
    "isActive": true
  }
}
```

---

### 2.6 List Coupons with Filters & Search
```http
GET /api/admin/getAllCoupons?couponType=CASHBACK&userRestriction=SPECIFIC&status=ACTIVE&search=VIP&page=1&pageSize=10
```

#### Query Parameters:
| Param | Values | Description |
| :--- | :--- | :--- |
| `couponType` | `DISCOUNT`, `CASHBACK` | Filter by coupon financial behavior |
| `userRestriction` | `ALL`, `SPECIFIC` | Filter by user audience |
| `status` | `ACTIVE`, `EXPIRED`, `INACTIVE` | Filter by status |
| `search` | `String` | Searches code prefix/substring |
| `page`, `pageSize`| `Number` | Pagination controls |

---

### 2.7 Delete Coupon
Soft-deletes the coupon so historical booking audit records remain intact.
```http
DELETE /api/admin/deleteCoupon/:couponId
```

---

### 2.8 Admin Override Refund & Cashback Reversal
When an admin overrides and cancels a booking (`POST /api/admin/adminOverrideRefund/:bookingId`), the backend automatically:
1. Reverses any credited cashback from the user's `UserWallet` (logging a `cashback_reversal` transaction).
2. Marks `cashbackStatus: "REVERSED"` (or `"CANCELLED"` if stay hadn't occurred).
3. Decrements `usedCount` and restores coupon usage eligibility.

---

### 2.9 Recommended Admin UI Form Blueprint

```
+-----------------------------------------------------------------------+
| CREATE / EDIT COUPON                                                  |
+-----------------------------------------------------------------------+
| Coupon Code:        [ CASHBACKVIP15                           ]       |
|                                                                       |
| Coupon Type:        ( ) DISCOUNT             (*) CASHBACK             |
|                                                                       |
| Calculation Mode:   (*) PERCENTAGE (%)       ( ) FLAT (SAR)           |
| Value:              [ 15.00                 ] SAR / %                 |
| Max Cap:            [ 200.00                ] SAR (Optional for %)    |
| Min Spend:          [ 500.00                ] SAR                     |
|                                                                       |
| Target Audience:    ( ) All Customers        (*) Specific Users       |
|                                                                       |
| Applicable Users:   [ Select Users (Ahmad Al-Mansour, Sarah K.)   v ]  |
|                     * Search by name, phone or email                  |
|                                                                       |
| Validity Window:    [ 2026-10-22 ] to [ 2026-12-31 ]                  |
| Total Usage Limit:  [ 50                    ] redemptions             |
| First-time Only:    [ ] Restrict to first-time bookers                |
|                                                                       |
|                     [ CANCEL ]        [ SAVE COUPON ]                 |
+-----------------------------------------------------------------------+
```

---

## 3. User Application (Web/App) Integration Guide

### 3.1 Fetch Available Coupons
Before or during checkout, show valid coupons available to the logged-in customer.
```http
GET /api/user/getAvailableCoupons
Headers: { "Authorization": "Bearer <USER_JWT_TOKEN>" }
```

#### Response (`200 OK`):
The backend automatically returns only:
1. Active coupons configured for `userRestriction: "ALL"`.
2. Active coupons configured for `userRestriction: "SPECIFIC"` where `applicableUsers` contains the current user.

```json
{
  "success": true,
  "message": "Available coupons fetched successfully",
  "data": [
    {
      "_id": "67174bb09e25bb883b28b7a1",
      "code": "CASHBACKVIP15",
      "couponType": "CASHBACK",
      "discountType": "PERCENTAGE",
      "discountValue": 15,
      "maxDiscount": 200,
      "minAmount": 500,
      "expiryDate": "2026-12-31T23:59:59.000Z",
      "userRestriction": "SPECIFIC"
    },
    {
      "_id": "67174bb09e25bb883b28b7b2",
      "code": "FLAT100OFF",
      "couponType": "DISCOUNT",
      "discountType": "FLAT",
      "discountValue": 100,
      "minAmount": 800,
      "expiryDate": "2026-12-31T23:59:59.000Z",
      "userRestriction": "ALL"
    }
  ]
}
```

---

### 3.2 Step 1: Check Availability & Coupon Calculation
Call this endpoint whenever dates, guests, or coupon codes change.
```http
POST /api/booking/check-availability
Headers: {
  "Authorization": "Bearer <USER_JWT_TOKEN>",
  "Content-Type": "application/json"
}

{
  "bookingType": "PROPERTY",
  "hotelId": "664b1f893e18a0e88c0a3344",
  "checkIn": "2026-11-01",
  "checkOut": "2026-11-03",
  "adults": 2,
  "children": 0,
  "couponCode": "CASHBACKVIP15"
}
```

#### Price Details Comparison:

#### Scenario A: With `CASHBACK` Coupon (`CASHBACKVIP15` 15% on 1000 SAR)
```json
{
  "success": true,
  "message": "Property available for booking",
  "priceDetails": {
    "totalAmount": 1000,
    "discountAmount": 0,
    "finalAmount": 1000,
    "platformFee": 50,
    "tax": 150,
    "grandTotal": 1200,
    "couponType": "CASHBACK",
    "couponCode": "CASHBACKVIP15",
    "cashbackAmount": 150
  }
}
```
> **UI Requirement for Cashback**:
> - `grandTotal` remains `1200 SAR`.
> - Show green callout banner:
>   🎁 **150 SAR Cashback Earned!** Will be credited to your OutApp Wallet after checkout.

#### Scenario B: With `DISCOUNT` Coupon (`FLAT100OFF` 100 SAR on 1000 SAR)
```json
{
  "success": true,
  "message": "Property available for booking",
  "priceDetails": {
    "totalAmount": 1000,
    "discountAmount": 100,
    "finalAmount": 900,
    "platformFee": 45,
    "tax": 135,
    "grandTotal": 1080,
    "couponType": "DISCOUNT",
    "couponCode": "FLAT100OFF",
    "cashbackAmount": 0
  }
}
```
> **UI Requirement for Discount**:
> - Show strike-through on original price.
> - `grandTotal` drops to `1080 SAR`.

---

### 3.3 Step 2: Customer Wallet Balance Check
Check the customer's available wallet balance before submitting the booking:
```http
GET /api/user/getWallet
Headers: { "Authorization": "Bearer <USER_JWT_TOKEN>" }
```
#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "balance": 350.00,
    "currency": "SAR",
    "isActive": true
  }
}
```

---

### 3.4 Step 3: Create Booking (Wallet & Mixed Payment)
```http
POST /api/booking/create
Headers: {
  "Authorization": "Bearer <USER_JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

#### Request Payload:
```json
{
  "bookingType": "PROPERTY",
  "propertyId": "664b1f893e18a0e88c0a3344",
  "checkIn": "2026-11-01",
  "checkOut": "2026-11-03",
  "adults": 2,
  "children": 0,
  "couponId": "67174bb09e25bb883b28b7a1",
  "priceDetails": {
    "totalAmount": 1000,
    "discountAmount": 0,
    "finalAmount": 1000,
    "platformFee": 50,
    "tax": 150,
    "grandTotal": 1200,
    "couponType": "CASHBACK",
    "couponCode": "CASHBACKVIP15",
    "cashbackAmount": 150
  },
  "useWallet": true
}
```

#### Case 1: Wallet covers partial amount (e.g., 350 SAR of 1200 SAR)
```json
{
  "success": true,
  "message": "Booking created. 350 SAR deducted from wallet. Please complete online payment for remaining 850 SAR.",
  "bookingId": "67174d829e25bb883b28b801",
  "orderId": "OUT-1729579600000-881",
  "totalAmount": 1200,
  "walletAmountApplied": 350,
  "remainingAmount": 850,
  "onlinePayableAmount": 850,
  "paymentMethod": "MIXED",
  "paymentStatus": "pending",
  "couponType": "CASHBACK",
  "discountAmount": 0,
  "cashbackAmount": 150,
  "cashbackStatus": "PENDING"
}
```
👉 **Action for Client**: Proceed to Step 4 (TAP Payment) for the `remainingAmount` (850 SAR).

#### Case 2: Wallet covers 100% (e.g., Wallet has $\ge$ 1200 SAR)
```json
{
  "success": true,
  "message": "Booking confirmed with wallet payment",
  "bookingId": "67174d829e25bb883b28b801",
  "orderId": "OUT-1729579600000-881",
  "totalAmount": 1200,
  "walletAmountApplied": 1200,
  "remainingAmount": 0,
  "onlinePayableAmount": 0,
  "paymentMethod": "WALLET",
  "paymentStatus": "paid",
  "bookingStatus": "confirmed",
  "couponType": "CASHBACK",
  "discountAmount": 0,
  "cashbackAmount": 150,
  "cashbackStatus": "PENDING"
}
```
👉 **Action for Client**: Booking is complete! Show Confirmation Screen.

---

### 3.5 Step 4: Online Payment (TAP Gateway)
If `remainingAmount > 0`, redirect user to TAP with `orderId` and `onlinePayableAmount`.

Once TAP processes the payment:
- TAP calls `POST /api/payment/webhook`.
- Backend verifies `CAPTURED`, sets `paymentStatus: "paid"`, blocks dates, confirms slots, and locks `cashbackStatus: "PENDING"`.

---

### 3.6 Step 5: Automated Stay-Completion Cashback Fulfillment
1. **Zero Client Effort**: The automated hourly cron runs in the background.
2. When `checkOut` date/time passes (`checkOut <= now`):
   - The booking's `cashbackStatus` atomically transitions from `PENDING` $\to$ `CREDITED`.
   - Customer's `UserWallet` balance increases by `cashbackAmount` (e.g. +150 SAR).
   - An immutable transaction record is written to `UserWalletTransaction`.
3. **Push Notification Received**:
   ```
   Title: Cashback Credited! 🎁
   Body:  You received 150 SAR cashback in your wallet for booking OUT-1729579600000-881.
   ```
4. **Wallet History Endpoint**:
   `GET /api/user/getWalletTransactions` returns:
   ```json
   {
     "type": "credit",
     "transactionType": "cashback",
     "amount": 150,
     "balanceAfter": 500,
     "couponCode": "CASHBACKVIP15",
     "description": "Cashback of 150 SAR credited for booking OUT-1729579600000-881"
   }
   ```

---

### 3.7 Step 6: Using Earned Cashback on Subsequent Bookings
On the next trip, the customer's wallet balance now includes the 150 SAR.
When checking out:
1. `GET /api/user/getWallet` $\to$ balance is `500 SAR`.
2. Customer ticks `[x] Use Wallet Balance`.
3. Up to 500 SAR is deducted from the new booking, reducing the payable amount.

---

### 3.8 Step 7: Booking Cancellation & Cashback Reversal
When a customer cancels via `POST /api/booking/cancel/:bookingId`:

```
                                [BOOKING CANCELLED]
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
        cashbackStatus: PENDING                         cashbackStatus: CREDITED
                 │                                               │
                 ▼                                               ▼
       • Set status = CANCELLED                        • Deduct cashbackAmount from UserWallet
       • No wallet deduction needed                    • Create "cashback_reversal" debit transaction
       • Restore Coupon usedCount                      • Set status = REVERSED
                                                       • Restore Coupon usedCount
```

---

## 4. Error Codes & Edge Cases Reference

| HTTP Status | Error Message | Cause / Solution |
| :--- | :--- | :--- |
| `400 Bad Request` | `"couponType must be either DISCOUNT or CASHBACK"` | Admin sent invalid `couponType` payload. |
| `400 Bad Request` | `"At least one user must be selected when userRestriction is SPECIFIC"` | `applicableUsers` array was empty when `userRestriction === "SPECIFIC"`. |
| `400 Bad Request` | `"One or more selected users do not exist or are deleted"` | Admin supplied invalid/deleted User `_id`s in `applicableUsers`. |
| `400 Bad Request` | `"This coupon is only available to selected users"` | Customer tried to apply a `SPECIFIC` coupon that was not issued to them. |
| `400 Bad Request` | `"Coupon has expired"` | Current date $>$ `expiryDate`. |
| `400 Bad Request` | `"Coupon usage limit has been reached"` | `usedCount >= usageLimit`. |
| `400 Bad Request` | `"Minimum booking amount of X SAR required to use this coupon"` | Booking subtotal is less than `minAmount`. |
| `400 Bad Request` | `"This coupon is only valid for first-time bookings"` | Customer has 1 or more previous confirmed bookings. |
| `403 Forbidden` | `"Identity verification required before booking."` | User has not completed Saudi Nafath / ID verification (`identityVerificationStatus !== "VERIFIED"`). |

---

## 5. Complete cURL Request Samples

### Admin: Create Cashback Coupon
```bash
curl -X POST "https://api.outapp.com/api/admin/createCoupon" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "CASHBACK10",
    "couponType": "CASHBACK",
    "discountType": "PERCENTAGE",
    "discountValue": 10,
    "maxDiscount": 100,
    "minAmount": 300,
    "userRestriction": "ALL",
    "startDate": "2026-10-22T00:00:00.000Z",
    "expiryDate": "2026-12-31T23:59:59.000Z",
    "usageLimit": 200
  }'
```

### User: Check Availability with Coupon
```bash
curl -X POST "https://api.outapp.com/api/booking/check-availability" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "PROPERTY",
    "hotelId": "664b1f893e18a0e88c0a3344",
    "checkIn": "2026-11-10",
    "checkOut": "2026-11-12",
    "adults": 2,
    "couponCode": "CASHBACK10"
  }'
```

### User: Create Booking with Wallet & Cashback
```bash
curl -X POST "https://api.outapp.com/api/booking/create" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "PROPERTY",
    "propertyId": "664b1f893e18a0e88c0a3344",
    "checkIn": "2026-11-10",
    "checkOut": "2026-11-12",
    "adults": 2,
    "couponId": "67174bb09e25bb883b28b7a1",
    "priceDetails": {
      "totalAmount": 1000,
      "discountAmount": 0,
      "finalAmount": 1000,
      "platformFee": 50,
      "tax": 150,
      "grandTotal": 1200,
      "couponType": "CASHBACK",
      "couponCode": "CASHBACK10",
      "cashbackAmount": 100
    },
    "useWallet": true
  }'
```
