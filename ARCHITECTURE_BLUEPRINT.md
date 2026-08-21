# ARCHITECTURE_BLUEPRINT.md — New Car Website + Dealer + Finance CRM
### Pre-Development Design Document (companion to `/CLAUDE.md`)

This document fulfills the "First Response Requirement": complete architecture, database, API list, screen list, role matrix, workflows, and roadmap — **before any code is written**. No application development has started. This is the design for review and approval.

---

## 1. COMPLETE SYSTEM ARCHITECTURE

```
                              ┌─────────────────────┐
                              │   PostgreSQL (RDS)   │
                              │   via Prisma ORM     │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │   NestJS Backend API   │
                              │  (REST + Swagger/OAS)  │
                              │  RBAC + OTP Auth Guard │
                              │  WebSocket (Socket.IO) │
                              └──────────┬───────────┘
              ┌───────────────┬──────────┼──────────┬───────────────┐
              │               │          │          │               │
      ┌───────▼──────┐ ┌──────▼─────┐ ┌──▼───┐ ┌────▼─────┐ ┌───────▼──────┐
      │ Public Website│ │ Customer   │ │Admin │ │ Dealer   │ │ Finance      │
      │ (Next.js SSR) │ │ Portal     │ │ CRM  │ │ Exec CRM │ │ Exec CRM     │
      └───────────────┘ └────────────┘ └──────┘ └──────────┘ └──────────────┘
                                         all under one Next.js app,
                                         route-guarded by role

      External: AWS S3-compatible storage (documents/images)
                Future: WhatsApp API, SMS, Email providers
```

**Principles:**
- One NestJS backend, one PostgreSQL database — all five frontend surfaces (Website, Customer Portal, Admin CRM, Dealer CRM, Finance CRM) consume the same API.
- Frontend is a single Next.js app with role-based route groups (`/admin`, `/dealer`, `/finance`, `/portal`, public routes) — not five separate apps, to avoid duplicated logic.
- All business logic and permission checks live in NestJS services/guards — frontend only renders what the API allows.
- Realtime (Socket.IO) used for: live notifications, overdue-SLA alerts, live lead status updates on dashboards.

---

## 2. TECHNOLOGY STACK (confirmed, per `/CLAUDE.md` — locked)

Frontend: Next.js + React + TypeScript · Backend: Node.js + NestJS + TypeScript · DB: PostgreSQL · ORM: Prisma · Auth: Mobile OTP + Session + RBAC · Storage: AWS S3-compatible · Realtime: Socket.IO · API: REST + Swagger · Hosting: Vercel (frontend) + Cloud NestJS (backend) + Managed Postgres (DB).

**Additional recommendations (not in original doc — flagged for approval, not assumed):**
- `bull`/`bullmq` + Redis for background jobs (SLA overdue checks, notification dispatch) — needed once WhatsApp/SMS/Email are wired in.
- `zod` or `class-validator` (NestJS native) for request validation.
- Sentry (or similar) for error monitoring in production.
- These are suggestions only — confirm before adding to the locked stack.

---

## 3. COMPLETE DATABASE SCHEMA (Prisma model summary)

> Full `.prisma` file will be generated at implementation time; this is the reviewable structure.

**Identity & Access**
- `User` (id, name, mobile, email, passwordHash?, role, dealerId?, bankId?, status, createdAt)
- `Role` (id, name, description)
- `Permission` (id, code, description)
- `RolePermission` (roleId, permissionId)

**Catalogue**
- `Brand` (id, name, logoUrl, status)
- `Model` (id, brandId, name, status)
- `Variant` (id, modelId, name, fuelType, transmission, exShowroomPrice, features Json, specs Json)
- `Vehicle` (id, variantId, colourOptions Json, images Json, isActive)

**Customer & Lead**
- `Customer` (id, name, mobile, whatsapp, city, email?, otpVerified, createdAt)
- `Lead` (id, leadCode `CAR-2026-000001`, customerId, brandId, modelId, variantId, dealerId?, dealerExecutiveId?, financeExecutiveId?, bankId?, salesStatus, financeStatus, source, budget, financeRequired, expectedPurchaseDate, isHold, isLost, lostReasonId?, createdAt)
- `LostReason` (id, label)

**Dealer Structure**
- `Dealer` (id, name, brandId, address, city, status)
- `DealerBranch` (id, dealerId, name, address, city)
- `DealerManager` (id, userId, dealerId)
- `DealerExecutive` (id, userId, dealerId, branchId)

**Bank/NBFC Structure**
- `Bank` (id, name, status)
- `BankBranch` (id, bankId, name, city, serviceArea, vehicleEligibility Json)
- `FinanceExecutive` (id, userId, bankId, branchId)

**Workflow entities**
- `Assignment` (id, leadId, dealerExecutiveId?, financeExecutiveId?, assignedBy, assignedAt)
- `FollowUp` (id, leadId, userId, type, result, notes, nextFollowUpAt, createdAt)
- `Activity` (id, leadId, userId, action, meta Json, createdAt) — audit timeline, append-only
- `Quotation` (id, leadId, price, onRoadPrice, exchangeValue?, validTill, createdAt)
- `TestDrive` (id, leadId, scheduledAt, status, feedback)
- `Document` (id, leadId, type, fileUrl, status, rejectionReason?, version, uploadedBy, verifiedBy?, createdAt)
- `FinanceCase` (id, leadId, bankId, financeExecutiveId, loanAmount, downPayment, tenureMonths, roi, emi, processingFee, otherCharges, stage, createdAt)
- `FinanceStatusHistory` (id, financeCaseId, fromStage, toStage, changedBy, notes, createdAt)
- `Booking` (id, leadId, bookingAmount, bookedAt, bookedBy)
- `Delivery` (id, leadId, scheduledAt, deliveredAt?, status)
- `Notification` (id, userId, type, title, body, channel, isRead, createdAt)
- `Message` (id, leadId, senderUserId, recipientUserId?, body, createdAt) — internal + customer-visible flag
- `AuditLog` (id, userId, entity, entityId, action, before Json?, after Json?, createdAt) — system-level, immutable

**Key relational rules:**
- `Lead` is the central entity — every workflow table (`FollowUp`, `Document`, `FinanceCase`, `Booking`, `Delivery`, `Activity`) references `leadId`, keeping Sales and Finance on the same case.
- `FinanceCase.stage` and `Lead.salesStatus` are independent enums — never merged into one status field.
- `Activity` and `AuditLog` rows are never hard-deleted by application code (soft-delete/immutable only, DB-level constraint).

---

## 4. ER DIAGRAM DESCRIPTION

```
Customer 1───* Lead *───1 Brand
                │   *───1 Model
                │   *───1 Variant
                │   *───1 Dealer ───1 DealerBranch
                │   *───1 DealerExecutive (User)
                │   *───1 FinanceExecutive (User) ───1 Bank
                │
                ├──* FollowUp
                ├──* Activity
                ├──* Quotation
                ├──* TestDrive
                ├──* Document
                ├──1 FinanceCase ──* FinanceStatusHistory
                ├──1 Booking
                ├──1 Delivery
                └──* Message

User *───1 Role ───* RolePermission ───* Permission
User 1───1 DealerExecutive / FinanceExecutive / DealerManager (role-specific profile)
```

Every workflow entity chains back to `Lead.id` — this is what keeps Sales and Finance "parallel but connected," per the blueprint requirement.

---

## 5. COMPLETE API LIST (REST, grouped by module)

**Auth**
`POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`

**Leads**
`POST /leads` (public enquiry) · `GET /leads` · `GET /leads/:id` · `PATCH /leads/:id` · `POST /leads/:id/assign` · `POST /leads/:id/hold` · `POST /leads/:id/lost` · `GET /leads/:id/timeline`

**Catalogue**
`GET/POST/PATCH /brands` · `GET/POST/PATCH /models` · `GET/POST/PATCH /variants` · `GET /catalogue/search`

**Follow-ups**
`POST /leads/:id/followups` · `GET /leads/:id/followups` · `GET /followups/overdue`

**Sales**
`POST /leads/:id/quotations` · `POST /leads/:id/test-drives` · `PATCH /test-drives/:id` · `POST /leads/:id/booking`

**Finance**
`POST /leads/:id/finance-case` · `GET /finance-cases` · `PATCH /finance-cases/:id/stage` · `GET /finance-cases/:id/history`

**Documents**
`POST /leads/:id/documents` (S3 upload) · `PATCH /documents/:id/status` · `GET /leads/:id/documents`

**Dealers / Banks**
`GET/POST/PATCH /dealers` · `GET/POST/PATCH /dealers/:id/branches` · `GET/POST/PATCH /dealer-executives` · `GET/POST/PATCH /banks` · `GET/POST/PATCH /banks/:id/branches` · `GET/POST/PATCH /finance-executives`

**Delivery**
`POST /leads/:id/delivery` · `PATCH /deliveries/:id`

**Users / Roles / Permissions**
`GET/POST/PATCH /users` · `GET/POST/PATCH /roles` · `GET/POST/PATCH /permissions`

**Notifications**
`GET /notifications` · `PATCH /notifications/:id/read` · WebSocket channel `notifications:{userId}`

**Reports**
`GET /reports/sales` · `GET /reports/finance` · `GET /reports/dealer-performance` · `GET /reports/export`

**Messaging**
`POST /leads/:id/messages` · `GET /leads/:id/messages`

All endpoints documented in Swagger/OpenAPI at `/api/docs`; every non-public endpoint behind the RBAC guard.

---

## 6. COMPLETE PAGE / SCREEN LIST

**Public Website:** Home · Brand listing · Model listing · Car detail · Compare · EMI Calculator · Offers · Test Drive request · Exchange value · Enquiry form · OTP verify

**Customer Portal:** Login (OTP) · Dashboard/Timeline · My Enquiry detail · Documents · Finance status · Booking/Delivery status · Messages

**Admin CRM:** Dashboard · Leads list/detail · Dealers (list/detail/branches) · Banks (list/detail/branches) · Users & Roles · Catalogue management · Reports · Activity/Audit log viewer · Settings

**Dealer Executive CRM:** Dashboard · My Leads · Lead detail (sales panel) · Follow-up form · Quotation form · Test Drive scheduler · Booking form

**Finance Executive CRM:** Dashboard · My Finance Cases · Case detail (finance panel) · Document review · Stage update form

Shared: Notification center · Login/Logout · 403/404 pages.

---

## 7. USER ROLE & PERMISSION MATRIX (summary)

| Module | Super Admin | Sales Admin | Finance Admin | Dealer Manager | Dealer Exec | Finance Exec | Customer |
|---|---|---|---|---|---|---|---|
| All Leads | Full | Full | Read | Own Dealer | Own only | — | Own only |
| Assign Leads | Yes | Yes | — | Own Dealer | — | — | — |
| Sales Pipeline | Full | Full | Read | Own Dealer | Own leads | Read | Read (own) |
| Finance Pipeline | Full | Read | Full | Read | Read | Own cases | Read (own) |
| Documents | Full | Read | Full | Read | Upload | Verify/Reject | Upload/View own |
| Dealers/Banks Mgmt | Full | Dealer only | Bank only | — | — | — | — |
| Users/Roles | Full | — | — | — | — | — | — |
| Reports | Full | Sales reports | Finance reports | Dealer reports | — | — | — |
| Internal Notes/Margin | Full | Full | Full | Full | Full | Full | **Never** |

Exact permission codes will be enumerated in the `Permission` table at implementation time; this matrix is the design-level reference.

---

## 8. LEAD STATUS ARCHITECTURE

Two independent status fields on every `Lead`, always visible together on the Admin lead detail screen:

- `salesStatus`: NEW → CONTACTED → QUALIFIED → INTERESTED → TEST DRIVE → QUOTATION → NEGOTIATION → BOOKING → DELIVERY → CLOSED (+ HOLD, LOST)
- `financeStatus`: NOT REQUIRED → PENDING → DOCUMENTS → LOGIN → VERIFICATION → BANK QUERY → QUERY RESOLVED → SANCTION → AGREEMENT → DISBURSEMENT → FINANCE COMPLETED

Both are enums enforced server-side; transitions are validated (no skipping stages without an explicit override reason logged to `Activity`).

---

## 9. SALES WORKFLOW

`Website enquiry → Lead created (OTP verified) → Admin assigns Dealer Executive → Executive contacts customer → Follow-ups logged → Test Drive → Quotation → Negotiation → Booking → (parallel: Finance completes) → Delivery scheduled → Delivered → Closed`

Lost can occur at any stage prior to Booking, with mandatory reason.

---

## 10. FINANCE WORKFLOW

`Admin/Dealer requests finance → Admin assigns Bank + Finance Executive → Document collection → Login → Verification → Bank Query (if any) → Query Resolved → Sanction → Agreement → Disbursement → Finance Completed`

Runs in parallel to the Sales Workflow, same Lead ID, independent stage tracking, visible together in Admin's combined case view.

---

## 11. CUSTOMER WORKFLOW

`Browse website → Submit enquiry (OTP) → Receive Lead ID → Login to portal → See executive assigned → See quotation → See finance progress (approved-level detail only) → See booking confirmation → See delivery schedule → Case closed`

Customer never initiates internal status changes — portal is read + limited-write (e.g., document upload, message).

---

## 12. ADMIN WORKFLOW

`Monitor new leads → Assign Dealer Executive + Finance Executive → Track SLA/overdue → Oversee combined Sales+Finance pipeline per lead → Resolve escalations → Manage dealer/bank masters → Run reports → Maintain audit oversight`

---

## 13. NOTIFICATION ARCHITECTURE

- All notifications write to `Notification` table + emit via Socket.IO to `notifications:{userId}` channel for real-time in-app delivery (MVP).
- `channel` field (`IN_APP`, `EMAIL`, `SMS`, `WHATSAPP`) built into the schema now so Phase 2+ channels plug in without a schema change — only a new dispatcher service.
- Trigger points: lead creation, assignment, follow-up due/overdue, document status change, finance stage change, booking, delivery — matching section 15/16 of `/CLAUDE.md`.

---

## 14. FILE / DOCUMENT ARCHITECTURE

- All uploads go to AWS S3-compatible storage via pre-signed URLs generated by NestJS — files never pass through the app server unencrypted at rest.
- Access to any document URL is permission-checked server-side per request (signed URL expiry + role check), never a public bucket.
- `Document.version` increments on re-upload after rejection; prior versions retained, not overwritten.
- Bucket structure: `leads/{leadId}/documents/{documentType}/{version}-{filename}`.

---

## 15. SECURITY ARCHITECTURE

- OTP-based auth for Customers; session-based auth (with password) for internal roles, both behind NestJS Guards.
- RBAC middleware/guard on every controller — checked against `Permission` table, not hardcoded role strings.
- Rate limiting on OTP request/verify endpoints (brute-force protection).
- All traffic over HTTPS/TLS; DB connections encrypted.
- `AuditLog` captures every create/update/delete on sensitive entities (`FinanceCase`, `Document`, `User`, `Lead` status changes) with before/after snapshots.
- Secrets (DB creds, S3 keys, JWT/session secrets) only via environment variables / secret manager — never committed (per `/CLAUDE.md` §24).

---

## 16. DEVELOPMENT ROADMAP

| Phase | Scope | Key Deliverables |
|---|---|---|
| 0 | Foundation | Repo setup, CLAUDE.md, DB schema + migrations, Auth/OTP, RBAC skeleton, CI |
| 1 (MVP) | Website + Catalogue + OTP + Lead ID + Admin CRM | Public site, enquiry→Lead, Admin dashboard & lead list/detail |
| 2 (MVP) | Dealer Executive CRM | Assignment, follow-ups, quotation, test drive, sales pipeline |
| 3 (MVP) | Finance Executive CRM | Document mgmt, finance pipeline, bank assignment |
| 4 (MVP) | Customer Portal + Notifications + Reports | Timeline UI, in-app notifications, sales/finance/dealer reports |
| 5 | WhatsApp/SMS/Email, auto-routing, advanced analytics, EMI calc polish, exchange workflow | |
| 6 | Bank/Dealer API integrations, e-sign, OCR, AI follow-up, automation | |

Matches the MVP Module Priority table already recorded in `/CLAUDE.md` §26.

---

*This document, together with `/CLAUDE.md`, is the complete design baseline. Awaiting your review — after approval, Phase 0 (Foundation) implementation will begin.*
