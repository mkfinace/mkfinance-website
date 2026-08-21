# CLAUDE.md — New Car Website + Dealer + Finance CRM
### Permanent Project Instruction File (Root of Repository)

This file is the **single source of truth** for this project. It combines:
1. The uploaded **PDF Business Requirement Document** ("New Car Website + Dealer + Finance CRM – Full System Blueprint") — the **primary business requirement**.
2. The **FINAL MASTER DEVELOPMENT PROMPT** — the **technical implementation requirement**.

Any AI assistant (Claude or otherwise) or developer working on this repository **must read this file first** and follow it strictly. Do not silently override, remove, or reinterpret anything in this file.

---

## 1. PROJECT OBJECTIVE

Build a complete, production-ready **New Car Sales + Dealer + Finance CRM platform** connecting:

```
CUSTOMER → NEW CAR WEBSITE → LEAD → ADMIN → DEALER EXECUTIVE + FINANCE EXECUTIVE
→ SALES + FINANCE PARALLEL PROCESS → BOOKING → DELIVERY → CLOSED DEAL
```

A single **Lead ID** (format: `CAR-2026-000001`) must connect the entire customer journey across every module, from first website enquiry through to delivery and closure.

This is a **real, working application** — not a mockup, not sample code, not a static site. It must have a real frontend, real backend, real database, real authentication, real role-based permissions, real APIs, and real workflows.

---

## 2. LOCKED TECHNOLOGY STACK

**Do not change any of the following without explicit owner approval.** If a change seems necessary, propose it separately and wait for approval — never switch silently.

| Layer | Technology |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Backend | Node.js + NestJS + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | Mobile OTP + Secure Session + RBAC |
| File/Document Storage | AWS S3-compatible storage |
| Realtime | WebSocket / Socket.IO |
| API Style | REST + Swagger/OpenAPI |
| Version Control | Git + GitHub |
| Frontend Hosting | Vercel |
| Backend Hosting | Cloud-hosted NestJS |
| Database Hosting | Managed Cloud PostgreSQL |

---

## 3. ARCHITECTURE RULES

- One consistent architecture across the whole project — established **before** any module implementation begins:
  1. Architecture
  2. Database
  3. Authentication
  4. Role/Permission system
  5. API structure
  6. UI structure
- Recommended structure: **Public Website + Customer Portal + Admin CRM + Dealer CRM + Finance CRM**, all connected to **one secure backend API and one database**.
- Build **module by module**, but never change the database structure or architecture at random between modules.
- Do not remove existing functionality when adding new functionality.
- Do not create duplicate APIs or duplicate database models unnecessarily.
- All permission checks must be enforced on the **backend/API**. Hiding buttons/menus on the frontend is never sufficient security on its own.
- Before any major architecture, database, or technology change: **stop and ask for approval.**

---

## 4. USER ROLES

| Role | Main Responsibilities |
|---|---|
| Super Admin | Full system control — users, dealers, banks/NBFCs, leads, reports, settings, permissions |
| Sales Admin | Dealer leads, assignments, sales monitoring, follow-up monitoring |
| Finance Admin | Banks/NBFCs, finance executives, finance cases, sanction and disbursement monitoring |
| Dealer Manager | Dealer team, assigned leads, executive performance |
| Dealer Executive | Customer contact, quotation, test drive, negotiation, booking, delivery |
| Finance Executive | Documents, finance login, verification, bank query, sanction, agreement, disbursement |
| Customer | Enquiry, selected car, quotation, finance progress, booking and delivery updates |

Each role must see and act on **only** the data/actions permitted for that role. This must be enforced server-side for every API endpoint, not just in the UI.

---

## 5. CUSTOMER WEBSITE (Public)

Pages/sections required:
- Home (Brands, Models, Prices, Offers, Finance, Test Drive, Exchange, enquiry CTAs)
- Car catalogue: Brand → Model → Variant → Fuel → Transmission → Price → Features
- Car detail page: Images, price, variants, specifications, features, safety, colours, EMI calculator, dealer availability, enquiry buttons
- Car Comparison
- Lead CTAs: Get Best Price, Get Finance Offer, Book Test Drive, Request Callback, Check Exchange Value
- Lead form: Name, Mobile, WhatsApp, City, preferred car, variant, budget, finance requirement, expected purchase date
- OTP verification before final lead creation
- Every enquiry generates a unique **Lead ID** (`CAR-2026-000001` format)

---

## 6. CUSTOMER PORTAL

Customer (after login) must see:
- My Enquiry, Selected Car, Variant, Dealer, Dealer Executive, Finance Executive
- Quotation, Price, Finance Amount, EMI
- Documents Required, Document Status, Finance Status
- Booking Status, Delivery Status, Important Updates
- Customer-appropriate follow-up information only

**Visual progress timeline:**
```
Enquiry Received → Executive Assigned → Car Selected → Quotation → Test Drive
→ Finance Applied → Finance Approved → Booking → Delivery Scheduled → Delivered → Closed
```

**Customer must NEVER see:**
- Dealer margin
- Commission
- Internal Admin notes
- Internal bank remarks
- Any other confidential/internal information

---

## 7. ADMIN CRM

Dashboard cards: Total Leads, New Leads, Today's Leads, Pending Follow-ups, Overdue Follow-ups, Dealer Assigned, Finance Assigned, Documents Pending, Finance Login Pending, Sanction Pending, Booking Pending, Delivery Pending, Closed, Lost.

Admin capabilities:
- Create/manage Dealer, Dealer Branch, Dealer Manager, Dealer Executive
- Create/manage Bank/NBFC, Finance Executive
- Assign/Reassign Leads (manual now; Auto Assignment/Round Robin is a Phase 2+ feature)
- Manage Customers, Cars, Brands, Models, Variants
- Manage Users, Roles, Permissions
- View full Activity Timeline / Audit Trail
- View Reports, Export Data
- Monitor SLA and Executive Performance
- Search/filter by Lead ID, mobile, customer, brand, model, dealer, executive, bank, city, status, date

---

## 8. DEALER EXECUTIVE CRM

Sees only leads assigned to them.

Dashboard: New Leads, Today's Follow-up, Overdue Follow-up, Interested, Test Drive, Quotation Pending, Negotiation, Booking Pending, Finance Pending, Delivery Pending, Closed, Lost.

Actions: Call Customer, WhatsApp Customer, Add Follow-up, Add Note, Send Quotation, Schedule Test Drive, Update Price, Add Exchange Details, Request Finance, Upload Documents, Mark Booking, Schedule Delivery, Mark Delivery, Close Lead.

**After every meaningful interaction, capture:**
- Follow-up Type
- Call/Meeting Result
- Notes
- Next Follow-up Date
- Next Follow-up Time

---

## 9. SALES PIPELINE (LOCKED SEQUENCE)

```
NEW → CONTACTED → QUALIFIED → INTERESTED → TEST DRIVE → QUOTATION
→ NEGOTIATION → BOOKING → DELIVERY → CLOSED
```

Also supported at any point: **HOLD**, **LOST**.

**Lost reason is mandatory** and must be one of: Price High, Other Brand, Other Dealer, Finance Rejected, Loan Amount Issue, Purchase Postponed, No Response, Not Interested, Other.

---

## 10. FINANCE EXECUTIVE CRM

Dashboard: New Finance Cases, Documents Pending, Login Pending, Login Done, Verification Pending, Bank Query, Query Resolved, Sanction Pending, Sanctioned, Agreement, Disbursed, Rejected, Hold.

Finance case data: Customer, vehicle, dealer, requested loan amount, down payment, tenure, ROI, EMI, processing fee, other charges, bank/NBFC assignment, owning finance executive.

**Finance case must always remain linked to the same Lead ID as the sales case.**

---

## 11. FINANCE PIPELINE (LOCKED SEQUENCE)

```
NOT REQUIRED → PENDING → DOCUMENTS → LOGIN → VERIFICATION → BANK QUERY
→ QUERY RESOLVED → SANCTION → AGREEMENT → DISBURSEMENT → FINANCE COMPLETED
```

Sales and Finance are **separate pipelines** but always connected to the **same Lead ID**. Both pipelines must appear together on the Admin Lead Detail page.

---

## 12. DOCUMENT MANAGEMENT

Documents: Aadhaar, PAN, Address Proof, Income Proof, Bank Statement, ITR, GST, other case-specific documents.

Status flow: **Pending → Uploaded → Verified / Rejected**

- Rejection requires a mandatory rejection reason.
- Maintain document version/history where applicable.
- Finance documents are sensitive — access is **permission-based only**, never public, never accessible to unauthorized roles.

---

## 13. LEAD ACTIVITY TIMELINE (AUDIT TRAIL)

Every meaningful event must be recorded with **date, time, user, and action**, including but not limited to: Lead Created, Lead Assigned, Customer Contacted, Follow-up Added, Quotation Created, Test Drive Scheduled/Completed, Finance Requested, Documents Uploaded/Verified, Finance Login, Bank Query, Sanction, Booking, Delivery Scheduled/Completed, Lead Closed.

**Normal users must never be able to silently delete audit history.**

---

## 14. FOLLOW-UP + SLA SYSTEM

- Follow-up types: Call, WhatsApp, Meeting, Test Drive, Dealer Visit.
- Results: Interested, Very Interested, Price Issue, Finance Issue, Waiting, Not Interested, Call Later.
- **Next Follow-up Date and Time are mandatory** on every follow-up.
- Configurable first-contact SLA (recommended default: within 15 minutes of a new lead).
- Overdue follow-ups shown as **RED/OVERDUE**, visible to Admin with: which executive, how long overdue, count of overdue leads, last contact, next follow-up.

---

## 15. NOTIFICATIONS

Notification architecture required for: Admin, Dealer Executive, Finance Executive, Customer.

- Admin: New Website Lead, Lead Not Contacted, Overdue Follow-up, Finance Delay, Booking/Delivery Pending.
- Dealer: New Lead, Follow-up Due/Overdue, Finance Update, Customer Message.
- Finance: New Case, Document Uploaded/Rejected, Bank Query, Sanction Update.
- Customer: Enquiry received, executive assigned, quotation, finance status, booking, delivery updates.

Build the architecture to support future channels: **In-app (MVP), Email, SMS, WhatsApp API (Phase 2+)**.

---

## 16. DEALER MANAGEMENT

Hierarchy: **Dealer → Branch → Manager → Executive → Leads**

Manage: Dealer Name, Brand, Branch, Address, Location, Manager, Executives, Contact Details, Status.

---

## 17. BANK / NBFC MANAGEMENT

Hierarchy: **Bank/NBFC → Branch → Finance Executive → Finance Cases**

Manage: Bank Name, Branch, Finance Executive, Contact, Service Area, Vehicle Eligibility (New/Used), Status.

---

## 18. REPORTS AND ANALYTICS

- **Sales reports:** Dealer-wise, Executive-wise, Brand-wise, Model-wise, City-wise, Conversion Rate, Lost Leads.
- **Finance reports:** Bank-wise, Finance Executive-wise, Sanction Rate, Rejection Rate, Average TAT, Disbursement.
- **Dealer performance:** Leads → Contacted → Test Drives → Bookings → Deliveries.
- All reports support date filters, search, sorting, and export (Excel/CSV/PDF).

---

## 19. DATABASE RULES

Design a proper **normalized relational database in PostgreSQL via Prisma**.

**Minimum required entities:**
```
Users, Roles, Permissions, Customers, Leads, Brands, Models, Variants, Vehicles,
Dealers, DealerBranches, DealerManagers, DealerExecutives, Banks, FinanceExecutives,
Assignments, FollowUps, Activities, Quotations, TestDrives, Documents, FinanceCases,
FinanceStatusHistory, Bookings, Deliveries, Notifications, Messages, LostReasons, AuditLogs
```

Rules:
- The complete ER/database structure must be reviewed and approved **before** implementation begins.
- Do not randomly change the database structure between modules.
- Do not create duplicate models for the same concept.
- Every schema change affecting existing modules must be flagged and approved, not applied silently.

---

## 20. SECURITY RULES

- Secure authentication (Mobile OTP + secure session).
- Role-Based Access Control (RBAC) enforced on **every backend/API endpoint**.
- Secure password/credential handling.
- Session management with timeout.
- File access control — finance documents are never publicly accessible.
- Full audit logging of sensitive actions.
- Input validation and API authorization on every request.
- Secure, encrypted database access and transport.
- Dealer Executives see only their permitted dealer leads; Finance Executives see only their assigned/permitted finance cases; Customers never see internal notes, margins, or confidential pricing.

---

## 21. UI / UX RULES

- Modern, professional, production-quality UI — responsive across Desktop, Tablet, Mobile.
- Admin/executive dashboards must be CRM-style: cards, tables, filters, search, status badges, timeline, Kanban where useful, charts, notifications, modal forms, side navigation.
- The system must feel like a professional automotive CRM, not a demo or template.

---

## 22. RECOMMENDED LEAD DETAIL SCREEN LAYOUT

- **Top:** Lead ID + Customer + Car + Overall Status
- **Left:** Customer and Vehicle information
- **Center:** Sales Pipeline + Finance Pipeline (side by side)
- **Right:** Next Follow-up + Dealer Executive + Finance Executive + SLA
- **Bottom:** Activity Timeline + Notes + Documents + Quotations + Communication History

---

## 23. CODING RULES

- TypeScript strict mode across frontend and backend — no implicit `any` in shared/business logic.
- All API endpoints documented via Swagger/OpenAPI.
- All database access through Prisma — no raw SQL unless explicitly justified and approved.
- Shared types/interfaces (e.g., Lead, pipeline statuses, roles) must be defined once and reused, not redefined per module.
- No hardcoded role checks scattered across the codebase — use a centralized RBAC/permissions layer.
- No feature is considered "done" without the corresponding backend authorization check.
- Consistent naming conventions across API routes, database tables, and frontend types.

---

## 24. GITHUB RULES

- **Never commit** secrets, passwords, API keys, database credentials, or `.env` files. Use `.env.example` with placeholder values only, and ensure `.env` is in `.gitignore`.
- Feature work happens on branches, not directly on `main`, once the team is more than one person.
- Meaningful commit messages describing the module/feature changed.
- `CLAUDE.md` stays in the repository root as the permanent project instruction file.
- Do not create a separate `PROJECT_RULES.md` — this file is the single instruction source.

---

## 25. TESTING RULES

- Every backend module needs at minimum: unit tests for business logic (pipeline transitions, permission checks) and integration tests for its API endpoints.
- RBAC/permission enforcement must have explicit tests — verify that each role can only access what it should.
- Lead status transitions (Sales and Finance pipelines) must be tested for valid/invalid transitions.
- No module is marked complete without passing tests for its critical paths (lead creation, assignment, status updates, document upload/verification).

---

## 26. DEVELOPMENT RULES

- Do not skip functionality because the project is large — build incrementally, module by module, without dropping requirements.
- If a technical requirement is missing from the business document, propose it clearly as an **additional recommendation** — never silently alter the business requirement.
- Before full implementation of any phase, confirm scope and get approval.

**Development Phases (from blueprint):**
1. Website, car catalogue, enquiry forms, OTP, Lead ID, Admin CRM
2. Dealer Executive CRM, assignments, follow-up, quotation, test drive, sales pipeline
3. Finance Executive CRM, document management, finance pipeline, bank assignment
4. Customer Portal, timeline, notifications, reports
5. WhatsApp API, SMS/Email, automatic lead routing, advanced analytics, EMI calculator, exchange workflow
6. Dealer/Bank API integrations, e-sign, OCR, AI follow-up, advanced automation

**MVP Module Priority:**
1. Website + Car Catalogue
2. Customer Enquiry + OTP
3. Admin CRM
4. Dealer Executive CRM
5. Finance Executive CRM
6. Follow-up + Activity Timeline
7. Customer Portal
8. Notifications
9. Reports
10. WhatsApp / Bank API / AI Automation (Phase 2+)

---

## 27. SOURCE OF TRUTH HIERARCHY

1. **This file (`CLAUDE.md`)** — permanent, authoritative project instructions.
2. **The uploaded Business Requirement PDF** — primary business requirement (features must not be removed).
3. **The FINAL MASTER DEVELOPMENT PROMPT** — technical implementation requirement (locked stack, architecture order).

If any future instruction conflicts with this file, flag the conflict and ask for approval before proceeding — do not resolve it silently.

---

*End of CLAUDE.md — do not begin application development until this file is reviewed and approved.*
