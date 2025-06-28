# Beeeyond-Backend Architecture
## **Project Overview**
Beeeyond is a Nigerian real estate tokenization platform that allows everyday investors to buy fractional shares of real estate starting from ₦10,000. It uses the Stellar blockchain for property token issuance and a P2P exchange for fiat-crypto onboarding.

This repository contains the **Node.js monolithic backend**, powered by **Express**, **PostgreSQL**, and **Sequelize ORM** — with full control over authentication, KYC, Stellar integration, and P2P exchange.

## Project Structure
beeeyond- backend /
├── src /
│   ├── config /
│   │   ├── database.ts
│   │   ├── stellar.ts
│   │   ├── jwt.ts
│   │   ├── redis.ts   <-- Redis config for BullMQ
│   │   └── index.ts
│   ├── models /
│   │   ├── User.ts
│   │   ├── Property.ts
│   │   ├── Transaction.ts
│   │   ├── Wallet.ts
│   │   ├── KycVerification.ts
│   │   ├── Notification.ts
│   │   ├── P2PVendor.ts
│   │   ├── P2POrder.ts
│   │   └── index.ts
│   ├── middleware /
│   │   ├── auth.ts
│   │   ├── validation.ts
│   │   ├── rateLimit.ts
│   │   ├── upload.ts
│   │   └── errorHandler.ts
│   ├── routes /
│   │   ├── auth.ts
│   │   ├── properties.ts
│   │   ├── investments.ts
│   │   ├── wallet.ts
│   │   ├── kyc.ts
│   │   ├── p2p.ts
│   │   ├── stellar.ts
│   │   └── index.ts
│   ├── services /
│   │   ├── authService.ts
│   │   ├── stellarService.ts
│   │   ├── emailService.ts
│   │   ├── smsService.ts
│   │   ├── kycService.ts //dojah, decrypt
│   │   ├── paymentService.ts
│   │   └── notificationService.ts
│   ├── jobs /
│   │   ├── portfolioJob.ts    # daily valuation
│   │   ├── stellarSyncJob.ts  # blockchain sync
│   │   ├── notificationJob.ts # batch emails/SMS
│   │   ├── kycMonitorJob.ts   # recheck pending verifications
│   │   ├── index.ts            # exports & queue initializers
│   ├── utils /
│   │   ├── validation.ts
│   │   ├── encryption.ts
│   │   ├── helpers.ts
│   │   └── logger.ts
│   ├── types /
│   │   └── index.ts
│   └── app.ts
├── migrations /
├── seeders /
├── package.json
├── tsconfig.json
├── .env.example
└── README.md

<!-- ##check deprecated packages, stellar-sdk, multer -->

## ⚙️ Tech Stack

| Layer                | Technology                   |
|----------------------|------------------------------|
| **Language**         | Node, Typescript             |
| **Framework**        | Express.js                   |
| **Database**         | PostgreSQL                   |
| **ORM**              | Sequelize                    |
| **Blockchain**       | Stellar SDK                  |
| **Auth**             | JWT + bcrypt                 |
| **Payments**         | Fincra, Paystack/Flutterwave |
| **Queues/Jobs**      | BullMQ (Redis)               |
| **File Storage**     | Cloudinary                   |
| **Emails/SMS**       | Resend, Twilio               |
| **Error Monitoring** | Sentry                       |
| **Perf Monitoring**  | Vercel Analytics             |
| **Environment**      | Docker + PM2 (optional)      |


## ✅ Features


## **1. Database Schema & Models**

## **2. API Endpoints Architecture**

### **Authentication & User Management**
```
POST   /auth/signup                    # User registration
POST   /auth/signin                    # User login
POST   /auth/signout                   # User logout
POST   /auth/refresh                   # Refresh tokens
GET    /auth/user                      # Get current user
PUT    /auth/user                      # Update user profile
```

### **KYC & Verification**
```
POST   /kyc/submit                     # Submit KYC documents
GET    /kyc/status                     # Get KYC status
POST   /kyc/verify-bvn                 # Verify BVN
GET    /kyc/verification/{id}          # Get verification details
```

### **Properties**
```
GET    /properties                     # List all properties (with filters)
GET    /properties/{id}                # Get property details
GET    /properties/{id}/analytics      # Property performance data
GET    /properties/search              # Search properties
GET    /properties/featured            # Featured properties
```

### **Investment Management**
```
POST   /investments/buy                # Buy property tokens
POST   /investments/sell               # Sell property tokens
GET    /investments/portfolio          # User portfolio
GET    /investments/transactions       # Transaction history
GET    /investments/holdings           # Current holdings
GET    /investments/analytics          # Portfolio analytics
```

### **Wallet Management**
```
GET    /wallet/balance                 # Get wallet balance
POST   /wallet/deposit                 # Initiate deposit
POST   /wallet/withdraw                # Initiate withdrawal
GET    /wallet/transactions            # Wallet transaction history
POST   /wallet/stellar/connect         # Connect Stellar wallet
GET    /wallet/stellar/assets          # Get Stellar assets
```

### **P2P Exchange**
```
GET    /p2p/vendors                    # List available vendors
POST   /p2p/orders                     # Create fiat-to-crypto order
GET    /p2p/orders                     # Get user orders
PUT    /p2p/orders/{id}/confirm        # Confirm payment
GET    /p2p/rates                      # Get exchange rates
```

### **Stellar Integration**
```
POST   /stellar/create-account         # Create Stellar account
POST   /stellar/fund-account           # Fund account with XLM
POST   /stellar/create-trustline       # Create asset trustline
POST   /stellar/transfer-tokens        # Transfer property tokens
GET    /stellar/account/{id}           # Get account details
GET    /stellar/transactions           # Get Stellar transactions
```

### **Admin & Analytics**
```
GET    /admin/properties               # Admin property management
POST   /admin/properties               # Create new property
PUT    /admin/properties/{id}          # Update property
GET    /admin/users                    # User management
GET    /admin/kyc/pending             # Pending KYC verifications
PUT    /admin/kyc/{id}/approve         # Approve KYC
GET    /admin/analytics               # Platform analytics

```
### **Manual Jobs & Background Tasks (for admin only)**
POST   /jobs/portfolio/recalculate     # Manually trigger portfolio valuation job
POST   /jobs/stellar/sync              # Manually trigger Stellar sync job
POST   /jobs/notifications/dispatch    # Manually dispatch queued notifications
POST   /jobs/kyc/recheck               # Manually run KYC recheck job
GET    /jobs/status                    # Get status of job queues and workers
---


### 🧑‍💼 **Authentication & User Management**
- Sign up / Sign in with JWT
- Secure password hashing with bcrypt
- Role-based access (user, admin)
- Profiles & avatars

### 🏠 **Properties**
- CRUD for property listings
- Token Fraction supply/destribution
- token price tracking
- Images & documents storage (Cloudinary)
- property analytics

### 💰 **Investments**
- Buy/sell property tokens
- Real-time portfolio and holding records
- Transaction logs
- Calculate returns
- Generate investment reports

### 🪪 **KYC & BVN Verification**
- Submit KYC docs
- Integrate Smile Identity & BVN APIs
- Admin review & approval

### 🪙 **Wallets & Payments**
- Fiat wallet balances (PostgreSQL)
- Stellar wallet generation & token trustlines
- Deposit & withdrawal via Paystack/Flutterwave
- P2P vendor system for fiat-to-crypto exchange

### 🔗 **Stellar Blockchain**
- Create Stellar accounts
- Issue property tokens
- Transfer tokens between investors
- Sync blockchain transactions with DB

### ⚙️ **Admin Panel (API)**
- Manage users, properties, KYC, vendors
- Platform analytics endpoints

### 📨 **Notifications**
- Send transaction confirmations
- KYC status updates
- Investment opportunities
- Portfolio performance alerts

---
#### **Payment Processing**
- Process onramp and off ramps using anchor(yellow card)
- Handle P2P order matching
- Calculate exchange rates

#### **Analytics Engine**
- Calculate property performance
- Generate portfolio analytics
- Market trend analysis
- Risk assessment

## 🔑 Security

- JWT auth middleware
- Role-based permissions
- Input validation (Joi)
- Rate limiting
- Encrypted secret key storage
- Environment variables for sensitive configs

---

## 🚀 Deployment & Scaling

- Docker-ready with `.env` support
- PM2 process manager recommended
- Redis for BullMQ queues & caching
- Cloud SQL or managed Postgres
- CDN for static assets
- CI/CD pipeline (GitHub Actions)

---

## 📊 Monitoring

- Sentry for error tracking
- Daily database backups
- Audit trails for transactions & KYC
- Alerts for failed transactions

---
## **Security & Authentication**

### **Row Level Security (RLS) Policies**
```sql
-- Users can only access their own data
CREATE POLICY "user_own_data" ON user_wallets
  FOR ALL USING (auth.uid() = user_id);

-- Public read access for properties
CREATE POLICY "public_read_properties" ON properties
  FOR SELECT USING (true);

-- Restrict sensitive KYC data
CREATE POLICY "user_own_kyc" ON kyc_verifications
  FOR ALL USING (auth.uid() = user_id);
```

### **API Security**
- JWT authentication via Supabase Auth
- Role-based access control (RBAC)
- Rate limiting on sensitive endpoints
- Input validation and sanitization
- Encrypted storage for sensitive data

### **Blockchain Security**
- Multi-signature wallets for property tokens
- Stellar account security best practices
- Private key management
- Transaction signing validation

## **Performance & Scalability**

### **Database Optimization**
```sql
-- Optimized indexes for common queries
CREATE INDEX idx_properties_location ON properties(location);
CREATE INDEX idx_properties_type_status ON properties(property_type, status);
CREATE INDEX idx_transactions_user_date ON property_transactions(user_id, created_at DESC);
CREATE INDEX idx_holdings_user_active ON user_property_holdings(user_id) WHERE tokens_owned > 0;
```

### **Caching Strategy**
- **Redis** for session storage and caching
- **CDN** for static assets (images, documents)
- **Query caching** for property listings
- **Real-time subscriptions** for price updates

### **Background Jobs**
- Daily portfolio value calculations
- Exchange rate updates
- Stellar blockchain synchronization
- Email notification queues
- KYC status monitoring

External Integrations**

### **Required Third-Party Services**

#### **Payment Processing**
- **Paystack/Flutterwave** - Naira deposits/withdrawals
- **Bank APIs** - Direct bank transfers
- **Mobile Money** - MTN, Airtel integration

#### **KYC/Identity Verification**
- **Smile Identity** - Nigerian identity verification
- **Trulioo** - Global ID verification
- **BVN Verification API** - Banking verification

#### **Stellar Blockchain**
- **Stellar SDK** - Blockchain interactions
- **Horizon Server** - Stellar network API
- **Freighter Wallet** - User wallet connection

#### **Communication**
- **Resend** - Email notifications (already integrated)
- **Twilio** - SMS notifications
- **WhatsApp Business API** - Customer support

#### **Infrastructure**
- aws cloud hosting
- **aws s3 bucket** - Document/image storage
- **Sentry** - Error monitoring
- **Vercel Analytics** - Performance monitoring

## **Monitoring & Maintenance**

### **Key Metrics to Track**
- User registration and KYC completion rates
- Property investment volume
- Transaction success rates
- Stellar blockchain sync status
- P2P order fulfillment times
- Wallet balance accuracy

### **Alerting System**
- Failed blockchain transactions
- Wallet balance discrepancies
- KYC verification delays
- Payment processing failures
- System performance issues

### **Backup & Recovery**
- Daily database backups
- Stellar account recovery procedures
- Document storage redundancy
- Transaction audit trails

---

## **Compliance & Legal**

### **Nigerian Regulations**
- SEC (Securities and Exchange Commission) compliance
- CBN (Central Bank) guidelines for digital assets
- EFCC anti-money laundering requirements
- Data protection (NDPR) compliance

### **International Standards**
- KYC/AML procedures using dojah
- GDPR for international users
- Stellar network compliance
- Financial reporting standards
## ✅ Getting Started

### 1️⃣ Install dependencies
```bash
npm install
2️⃣ Configure environment
Create .env and set:


3️⃣ Run migrations
npx sequelize-cli db:migrate

4️⃣ Start development server
pnpm run dev
5️⃣ Start background workers (if any)
pnpm run worker


📃 License
Beeeyond © 2025 — All rights reserved.

🙌 Contributions
Pull requests and suggestions are welcome!

