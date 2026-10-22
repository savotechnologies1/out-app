# 📱 User App (Web & Mobile) — Coupon & Cashback Integration Guide

This guide is for the **Customer Web & Mobile App (iOS / Android / React Native / Flutter) Engineering Team**. It explains how to implement the enhanced **Coupon & Cashback System**, including coupon selection, checkout calculations, wallet integration, post-stay cashback crediting, and cancellation reversals.

---

## 📌 Table of Contents
1. [Customer Experience & Concepts](#1-customer-experience--concepts)
   - [1.1 Discount vs. Cashback](#11-discount-vs-cashback)
   - [1.2 The Complete Cashback Lifecycle](#12-the-complete-cashback-lifecycle)
2. [Step-by-Step API Implementation Flow](#2-step-by-step-api-implementation-flow)
   - [2.1 Headers & Authentication](#21-headers--authentication)
   - [2.2 Step 1: Discover Available Coupons](#22-step-1-discover-available-coupons)
   - [2.3 Step 2: Check Availability & Price Calculation](#23-step-2-check-availability--price-calculation)
   - [2.4 Step 3: Fetch Customer Wallet Balance](#24-step-3-fetch-customer-wallet-balance)
   - [2.5 Step 4: Create Booking (Wallet & Mixed Payment)](#25-step-4-create-booking-wallet--mixed-payment)
   - [2.6 Step 5: Online Payment (TAP Gateway)](#26-step-5-online-payment-tap-gateway)
   - [2.7 Step 6: Automated Post-Stay Cashback Fulfillment](#27-step-6-automated-post-stay-cashback-fulfillment)
   - [2.8 Step 7: Spending Earned Cashback on Subsequent Bookings](#28-step-7-spending-earned-cashback-on-subsequent-bookings)
   - [2.9 Step 8: Booking Cancellation & Reversal Rules](#29-step-8-booking-cancellation--reversal-rules)
3. [UI / UX Design Blueprint](#3-ui--ux-design-blueprint)
   - [3.1 Coupon List & Selection Bottom Sheet](#31-coupon-list--selection-bottom-sheet)
   - [3.2 Price Breakdown UI Component](#32-price-breakdown-ui-component)
   - [3.3 Wallet Payment Toggle Component](#33-wallet-payment-toggle-component)
   - [3.4 Booking Detail / History Status Badges](#34-booking-detail--history-status-badges)
4. [Error Codes & Client Handling](#4-error-codes--client-handling)
5. [cURL Examples for Mobile/Web Testing](#5-curl-examples-for-mobileweb-testing)

---

## 1. Customer Experience & Concepts

### 1.1 Discount vs. Cashback

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COUPON APPLICATION MODES                        │
├───────────────────────────────────┬────────────────────────────────────┤
│         DISCOUNT COUPON           │          CASHBACK COUPON           │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Instant price deduction         │ • Customer pays full booking price │
│ • Reduces finalAmount & grandTotal│ • finalAmount is NOT reduced       │
│ • No wallet interaction           │ • cashbackAmount is calculated     │
│ • Pay less immediately            │ • Credited to wallet after stay    │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 1.2 The Complete Cashback Lifecycle

```
[1. Checkout]
Customer books with CASHBACK coupon.
Pays full booking price (or uses available wallet + card).
Booking saved with:
  • couponType: "CASHBACK"
  • cashbackAmount: 150 SAR
  • cashbackStatus: "PENDING"
        │
        ▼
[2. During Stay]
Cashback status remains PENDING while guest enjoys their stay.
        │
        ▼
[3. Post-Stay Completion (checkOut <= now)]
Automated hourly system worker executes:
  • Booking cashbackStatus transitions to "CREDITED"
  • Customer UserWallet balance credited +150 SAR
  • Push notification sent to customer: "Cashback Credited! 🎁"
  • Immutable audit transaction logged in UserWalletTransaction
        │
        ▼
[4. Subsequent Booking]
Customer books their next trip.
Customer sees 150 SAR in wallet and ticks "[x] Use Wallet Balance".
150 SAR is deducted, lowering their payable amount!
```

---

## 2. Step-by-Step API Implementation Flow

### 2.1 Headers & Authentication
All customer requests require the User JWT Bearer token:
```http
Authorization: Bearer <USER_JWT_TOKEN>
Content-Type: application/json
```

---

### 2.2 Step 1: Discover Available Coupons
Fetch the list of coupons the current logged-in customer is eligible to use.
```http
GET /api/user/getAvailableCoupons
```

#### What the Backend Returns:
- Coupons configured for all users (`userRestriction: "ALL"`).
- Coupons targeted specifically to this customer (`userRestriction: "SPECIFIC"` where the user is in `applicableUsers`).
- **Filtered automatically**: The client does not need to filter by user ID.

#### Response (`200 OK`):
```json
{
  "success": true,
  "message": "Available coupons fetched successfully",
  "data": [
    {
      "_id": "67174bb09e25bb883b28b7a1",
      "code": "CASHBACK15",
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

### 2.3 Step 2: Check Availability & Price Calculation
Call this endpoint when the customer selects dates, guests, or applies/removes a coupon code.
```http
POST /api/booking/check-availability
```

#### Request Payload:
```json
{
  "bookingType": "PROPERTY",
  "hotelId": "664b1f893e18a0e88c0a3344",
  "checkIn": "2026-11-01",
  "checkOut": "2026-11-03",
  "adults": 2,
  "children": 0,
  "couponCode": "CASHBACK15"
}
```

#### How to Handle the Response:

##### Case A: When `couponType === "CASHBACK"`
The booking subtotal is **NOT** reduced. Customer pays the normal total, but earns wallet cashback upon completion:
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
    "couponCode": "CASHBACK15",
    "cashbackAmount": 150
  }
}
```
👉 **UI Handling**:
- Show `grandTotal = 1200 SAR`.
- Show green cashback banner:
  > 🎁 **150 SAR Cashback Earned!** Will be credited to your wallet after checkout.

##### Case B: When `couponType === "DISCOUNT"`
The booking subtotal is reduced immediately:
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
👉 **UI Handling**:
- Strike through original price `1200 SAR`.
- Show `grandTotal = 1080 SAR` with line item `-100 SAR Discount`.

---

### 2.4 Step 3: Fetch Customer Wallet Balance
Before rendering the payment method selector on the checkout screen:
```http
GET /api/user/getWallet
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "balance": 250.00,
    "currency": "SAR",
    "isActive": true
  }
}
```
👉 **UI Handling**:
- If `balance > 0`, display a checkbox:
  `[x] Use Wallet Balance (250 SAR Available)`

---

### 2.5 Step 4: Create Booking (Wallet & Mixed Payment)
```http
POST /api/booking/create
```

#### Request Payload:
Pass the `priceDetails` object obtained from `check-availability` along with `useWallet`:
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
    "couponCode": "CASHBACK15",
    "cashbackAmount": 150
  },
  "useWallet": true
}
```

#### Handling the 2 Payment Scenarios:

##### Scenario 1: Mixed Payment (`onlinePayableAmount > 0`)
Customer wallet had 250 SAR. Grand Total is 1200 SAR.
```json
{
  "success": true,
  "message": "Booking created. 250 SAR deducted from wallet. Please complete online payment for remaining 950 SAR.",
  "bookingId": "67174d829e25bb883b28b801",
  "orderId": "OUT-1729579600000-881",
  "totalAmount": 1200,
  "walletAmountApplied": 250,
  "remainingAmount": 950,
  "onlinePayableAmount": 950,
  "paymentMethod": "MIXED",
  "paymentStatus": "pending",
  "couponType": "CASHBACK",
  "cashbackAmount": 150,
  "cashbackStatus": "PENDING"
}
```
👉 **Action for Client**: Prompt the user to pay `950 SAR` via TAP Payment Gateway (Step 5).

##### Scenario 2: 100% Wallet Payment (`onlinePayableAmount === 0`)
Customer wallet had $\ge$ 1200 SAR.
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
  "cashbackAmount": 150,
  "cashbackStatus": "PENDING"
}
```
👉 **Action for Client**: No external payment needed! Navigate to Booking Success Screen immediately.

---

### 2.6 Step 5: Online Payment (TAP Gateway)
If `remainingAmount > 0`:
1. Use TAP iOS / Android SDK or Web Checkout with `onlinePayableAmount`.
2. When payment succeeds, TAP sends webhook to the backend.
3. Backend marks `paymentStatus: "paid"`, confirms booking, and holds `cashbackStatus: "PENDING"`.

---

### 2.7 Step 6: Automated Post-Stay Cashback Fulfillment
- **Zero Client Trigger Required**: Handled completely by the backend hourly cron worker.
- As soon as `checkOut` passes (`checkOut <= now`), the backend atomically credits the customer's `UserWallet`.
- **Push Notification Received**:
  ```
  Title: Cashback Credited! 🎁
  Body:  You received 150 SAR cashback in your wallet for booking OUT-1729579600000-881.
  ```
- **Fetch Wallet Ledger History**:
  ```http
  GET /api/user/getWalletTransactions
  ```
  Returns:
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "67175f829e25bb883b28b999",
        "type": "credit",
        "transactionType": "cashback",
        "amount": 150,
        "balanceAfter": 400,
        "currency": "SAR",
        "couponCode": "CASHBACK15",
        "description": "Cashback of 150 SAR credited for booking OUT-1729579600000-881",
        "createdAt": "2026-11-03T14:00:00.000Z"
      }
    ]
  }
  ```

---

### 2.8 Step 7: Spending Earned Cashback on Subsequent Bookings
Once credited, the cashback balance is indistinguishable from standard cash balance in `UserWallet`.
On the customer's next trip:
1. `GET /api/user/getWallet` returns the updated balance.
2. The user checks `[x] Use Wallet Balance`.
3. The balance is applied toward the new booking.

---

### 2.9 Step 8: Booking Cancellation & Reversal Rules
When the customer requests cancellation (`POST /api/booking/cancel/:bookingId`):

```
                        CUSTOMER CANCELS BOOKING
                                    │
               ┌────────────────────┴────────────────────┐
               │                                         │
     CASHBACK WAS PENDING                     CASHBACK WAS CREDITED
  (Cancelled before check-out)              (Cancelled after check-out)
               │                                         │
               ▼                                         ▼
   • cashbackStatus: "CANCELLED"             • Cashback deducted from UserWallet
   • No wallet balance deducted              • Transaction logged: "cashback_reversal"
   • Coupon usedCount decremented            • cashbackStatus: "REVERSED"
                                             • Coupon usedCount decremented
```

---

## 3. UI / UX Design Blueprint

### 3.1 Coupon List & Selection Bottom Sheet
Display available coupons clearly differentiating between **Discount** and **Cashback**:

```
+-----------------------------------------------------------------+
| APPLICABLE COUPONS                                          [X] |
+-----------------------------------------------------------------+
| [🏷️ FLAT100OFF]                       [ APPLY ]                 |
| Instant Discount: 100 SAR OFF                                   |
| Min. booking 800 SAR • Expires 31 Dec                           |
+-----------------------------------------------------------------+
| [🎁 CASHBACK15]                        [ APPLY ]                 |
| Cashback: 15% (Up to 200 SAR)                                   |
| Earned into your OutApp Wallet after your stay                  |
| Min. booking 500 SAR • Exclusive for you! • Expires 31 Dec      |
+-----------------------------------------------------------------+
```

### 3.2 Price Breakdown UI Component

#### For Cashback Coupon:
```
+-----------------------------------------------------------------+
| Price Summary                                                   |
+-----------------------------------------------------------------+
| Booking Subtotal (2 Nights)                           1,000 SAR |
| Platform Fee (5%)                                        50 SAR |
| VAT (15%)                                               150 SAR |
+-----------------------------------------------------------------+
| Grand Total                                           1,200 SAR |
+-----------------------------------------------------------------+
| 🎁 Cashback Reward (CASHBACK15):                       +150 SAR |
| * 150 SAR will be credited to your wallet after checkout        |
+-----------------------------------------------------------------+
```

#### For Discount Coupon:
```
+-----------------------------------------------------------------+
| Price Summary                                                   |
+-----------------------------------------------------------------+
| Booking Subtotal (2 Nights)                           1,000 SAR |
| Coupon Discount (FLAT100OFF)                           -100 SAR |
| Platform Fee (5%)                                        45 SAR |
| VAT (15%)                                               135 SAR |
+-----------------------------------------------------------------+
| Grand Total                                           1,080 SAR |
+-----------------------------------------------------------------+
```

### 3.3 Wallet Payment Toggle Component
```
+-----------------------------------------------------------------+
| [x] Use OutApp Wallet Balance                                   |
| Available: 250.00 SAR                                           |
|                                                                 |
| - Wallet applied:                                      -250 SAR |
| - Remaining amount to pay online:                       950 SAR |
+-----------------------------------------------------------------+
```

### 3.4 Booking Detail / History Status Badges
On the Booking Detail Screen, display the cashback progress:
- **`PENDING`**: 🟡 `Cashback Pending (+150 SAR after checkout)`
- **`CREDITED`**: 🟢 `Cashback Credited (+150 SAR in Wallet)`
- **`REVERSED`**: ⚪ `Cashback Reversed (Booking Cancelled)`
- **`CANCELLED`**: ⚪ `Cashback Cancelled`

---

## 4. Error Codes & Client Handling

| HTTP Code | Error Message | Frontend Toast / Alert Handling |
| :--- | :--- | :--- |
| `400 Bad Request` | `"This coupon is only available to selected users"` | *"This coupon is exclusive to specific users and cannot be applied to this account."* |
| `400 Bad Request` | `"Coupon has expired"` | *"This promo code has expired."* |
| `400 Bad Request` | `"Coupon usage limit has been reached"` | *"This coupon has reached its maximum redemptions."* |
| `400 Bad Request` | `"Minimum booking amount of X SAR required to use this coupon"` | *"Add more items or extend your stay to meet the minimum spend of X SAR."* |
| `400 Bad Request` | `"This coupon is only valid for first-time bookings"` | *"This discount is only valid on your first booking."* |
| `400 Bad Request` | `"Coupon already used"` | *"You have already redeemed this coupon."* |
| `403 Forbidden` | `"Identity verification required before booking."` | Redirect customer to Saudi Nafath verification screen. |

---

## 5. cURL Examples for Mobile/Web Testing

### 1. Customer Gets Available Coupons
```bash
curl -X GET "http://localhost:8088/api/user/getAvailableCoupons" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

### 2. Check Availability with Cashback Coupon
```bash
curl -X POST "http://localhost:8088/api/booking/check-availability" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "PROPERTY",
    "hotelId": "664b1f893e18a0e88c0a3344",
    "checkIn": "2026-11-10",
    "checkOut": "2026-11-12",
    "adults": 2,
    "couponCode": "CASHBACK15"
  }'
```

### 3. Customer Creates Booking (Applying Wallet + Cashback)
```bash
curl -X POST "http://localhost:8088/api/booking/create" \
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
      "couponCode": "CASHBACK15",
      "cashbackAmount": 150
    },
    "useWallet": true
  }'
```

### 4. Fetch Wallet History to Verify Cashback Credit
```bash
curl -X GET "http://localhost:8088/api/user/getWalletTransactions" \
  -H "Authorization: Bearer <USER_TOKEN>"
```
