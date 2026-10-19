# PRD — MCC Newark Hub

**Version:** 1.0 (the first version is what is already live) · **Date:** 2026-10-17 · **Product owner:** Leonard Alves
**Address:** https://mcc-newark-hub.vercel.app
**Other languages:** [Português](pt/PRD.md)

> How to read: ✅ done and in use · ⚠️ exists but incomplete · ❌ does not exist. Items marked **(proposal)** were suggested by the author and still need the owner's validation.

---

## 1. Summary

MCC Newark Hub was born to **take seminar registrations out of spreadsheets** and give church secretaries a single, reliable, fast tool. From registrations it grew into a portal for the Newark, Texas and West Coast Area, with a member directory, schedules, the praise-song list and an org chart.

**The core of v1 is Registrations.** Everything else is an expansion that reuses the same directory.

---

## 2. Problem

Seminar registrations were handled in a **spreadsheet**. What went wrong:

| Pain | Consequence |
|---|---|
| It was hard to control what had been updated | The number of registrants **did not add up** |
| There was no way to know **who** changed the spreadsheet | Errors with no owner and no way to fix the cause |
| At close-out, the money collected **did not match** the spreadsheet | Rework and distrust in the numbers |
| When the pastor asked, finding the answer was hard: how many registered, how much was collected, how many paid and how many are missing, how many per church, class and group | Delay, and different answers to the same question |
| The spreadsheet was not always up to date and was slow to update | Decisions made on stale data |
| Only the secretaries could register people | **Overload** on the secretaries, who became the bottleneck |

**Who suffers most:** church secretaries. **Who pays the price:** participants (waiting, billing mistakes) and pastors (no reliable number).

---

## 3. Who it is for

| Profile | Role in the product | Priority |
|---|---|---|
| **Church secretary** | The focus of the product: record payments, cancel, reactivate, fix data, register people who did not use the portal. Sees only their own church | **Focus** |
| **Participant** (member or visitor, and their family) | Registers on their own through the portal. Ease of use is the goal | **Experience priority** |
| **Pastor** | Looks up the numbers without asking the secretary (an extra that relieves the secretary). Approves exceptions | Extra |
| **Group (GA) and team leader** | Follows their people and their team | Support |
| **Treasurer** | Closes the event's accounts | Support |
| **Administrator** | Configures events, users, lists and access | Support |

---

## 4. Goals and how to tell it worked **(proposal)**

1. **The numbers add up.** The total collected in the system equals the cash at close-out, with zero discrepancy.
2. **Every change has an owner.** Every change is recorded with the **person's name** (audit log).
3. **The secretary stops being the bottleneck.** Most registrations are made by the participant, and the pastor's question answers itself on screen.
4. **Recording a payment takes seconds.** The secretary confirms a payment on the spot, without a spreadsheet.
5. **Fast answers for the pastor:** registered, paid, pending, collected and seats, by church, class and group, on one screen.

*Not measured yet: there is no timer or registration-source counter today. If these numbers matter, they must be added.*

---

## 5. Ideal flow × what exists today

| # | Ideal step | Today |
|---|---|---|
| 1 | The participant opens the portal and starts registering | ✅ Public portal (`/events/register`), in Portuguese and English, mobile-friendly |
| 2 | Fills in their data and their family's | ✅ Individual and family registration, with search of people already in the directory |
| 3 | Receives the receipt, preferably by email | ⚠️ The receipt is shown **on screen**. The email is only sent when the **secretary clicks "resend"**; it is not automatic |
| 4 | The portal says payment is made with the secretary, listing the one for their church | ⚠️ It says payment is **in person, with authorized staff**, but **does not list each church's secretary** |
| 5 | The participant pays | ✅ In person (cash or transfer recorded by staff). Online: ❌ not possible yet |
| 6 | The secretary updates it on the spot: paid | ✅ Record payment, mark exempt, cancel, reactivate |
| 7 | The participant receives a payment receipt by email | ❌ Does not exist. Only the manual resend of the confirmation, which already shows the "Paid" status |

---

## 6. v1 features (what is already built)

### 6.1 Core: Registrations ✅

- **Participant portal:** individual or family registration, age categories (0-3, Child, Intermediate, Teen, Youth, Adult), fee per category, terms acceptance, registration number, **lookup of one's own registration** (`/events/lookup`).
- **Secretary panel:** registration list with filters; register someone who did not use the portal; **record payment** (paid/exempt); **cancel and reactivate**; fix data; resend the confirmation email; overdue tab.
- **Event rules:** capacity, **waiting list** (manual promotion by the secretary), **over-capacity seat** with pastor approval, payment deadline with warning and acceptance, automatic exemption for Pastor and Anointed, deadline exemption for workers, teams and their families.
- **Pastor approvals:** late registration, full event, exemption, reactivation and deadline extension.
- **Numbers:** event summary (registered, paid, pending, collected, waiting list), reports by church, class and group, and a registrations dashboard.
- **Treasury:** balance (expected × collected), expenses, other income, with restricted access.

### 6.2 Event day ✅
QR-code check-in (by an attendant or self-service), PDF badges, kitchen planning, teams and work schedules.

### 6.3 Directory ✅
Members (with filters, including gender), families, churches, hubs and areas, assistance groups (grouped by church), functions, instruments and voices, **spreadsheet import**, **Org chart** (Area › Hub › Church, with the people in charge, drawing and image/PDF export) and the directory **Overview**, with access limited by church.

### 6.4 Schedules and praise songs ✅
Door-duty schedule (public monthly calendar), 24h prayer agenda (public, per list) and the service **Praise Song List** (catalogue, history, public page for the Praise Group, image and PDF export).

### 6.5 Access and control ✅
- Login by **4-digit PIN**; profiles: administrator, secretary, pastor, GA leader, team leader, treasurer; one person can hold several profiles.
- **Scope by church** (the secretary and some pastors see only their own).
- **Audit log:** every change is recorded with author, action and date; accounts can be **deactivated** without erasing history.
- **Automatic daily backup** of the database and a **maintenance mode** for larger changes.

---

## 7. What stays out of v1

**Decided:**
- ❌ **Online payment.** Today in person only; a future wish with no defined solution.

**Partially exists and is deferred:**
- ⚠️ **Automatic email** for registration and payment (today only the manual resend).
- ⚠️ **Showing the church secretary** on the receipt and confirmation screen.
- ⚠️ **Automatic move to the waiting list** when the deadline passes. The code exists but is **not scheduled**; today it is manual.
- ⚠️ **Per-person login everywhere:** named accounts exist, but some shared accounts are still being retired.

**Does not exist and is not a v1 priority:**
- ❌ Native mobile app (the portal works in the browser).
- ❌ Event calendar and service attendance.
- ❌ Seminar programme/agenda.
- ❌ WhatsApp or SMS notifications.

*(Items under "out" other than online payment are a proposal; confirm or adjust.)*

---

## 8. Non-functional requirements

- **Works on any device** (phone, tablet, computer), in **Portuguese and English**; every user-facing text is localizable.
- **Fast for the secretary:** actions save immediately and the screen responds without waiting for the server.
- **Traceable:** no change without an author.
- **Resilient:** daily backup; versioned migrations in the repository.
- **Technology:** React (Vite), Supabase (database), Vercel (hosting and functions), email through Resend.

---

## 9. Risks and known debts

| Risk | Severity | Status |
|---|---|---|
| **PINs can be read** by anyone holding the site's public key (verification happens in the browser and the database does not restrict reads) | **High** | Open. Requires verifying the PIN on the server |
| The source code (**public repository**) contains **test PINs that still sign in**, including the administrator's | **High** | Open. Simple fix: turn off this fallback outside development |
| Shared accounts (per-church Secretary, Admin) remove the name from the audit log | Medium | In progress: named accounts created, retirement under way |
| Maintenance mode is on: only the administrator and Pr Nairon can sign in | Medium | Must be turned off for launch |
| Some tables and functions existed only in code, with no migration (already fixed for three lists and the church scope) | Low | Review the rest |
| Incomplete data (immigration status on 5 of 454 members; 163 without a group) | Low | Track through the Overview |

---

## 10. Suggested next steps **(proposal)**

1. **Login security:** remove the fallback test PINs from the code and plan server-side PIN verification.
2. **Automatic email** for registration and payment confirmation (steps 3 and 7 of the ideal flow).
3. **Show the church secretary** on the receipt (step 4).
4. **Finish the move to named logins** and deactivate the shared accounts.
5. **Schedule the automatic waiting-list move** after validating it in dry-run mode.
6. **Turn off maintenance mode** and open the app to the secretaries.
7. Study a form of **online payment** that suits the churches.

---

## 11. Open questions

- How do we measure success (section 4)? Is there a time target or a target share of registrations made by participants?
- Which items in section 7 really stay out of v1, besides online payment?
- Should the payment receipt email include who received the payment?
- Will the portal also be used for events that are not seminars (baptisms, retreats)?
