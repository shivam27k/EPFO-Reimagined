# EPF Sahayak — New Member Manual Test Suite

Use this suite to test the complete Rohan Mehta journey. Run it in order for an end-to-end check, or reset the demo before any individual section.

## Test account

- Username: `new.member@demo.epfsahayak.in`
- Password: `DemoNew#2026`
- Persona: Rohan Mehta, new EPF member
- Expected masked UAN: `XXXX XXXX 4321`

## How to record results

Mark each test as `PASS`, `FAIL`, or `BLOCKED`. For a failure, capture the page URL, screenshot, action performed, expected result, actual result, and browser width.

## Starting or resetting a run

1. Open `http://localhost:3000/login`.
2. Select **Fill these credentials** on the Rohan Mehta card.
3. Select **Start demo**.
4. To reset without logging out, open **Demo scenarios** on the right and select **Reset demo**.
5. To prove session disposal, select **Log out**, sign in again with the same credentials, and confirm the account starts from the beginning.

---

## NM-01 — Login and fresh-account state

### NM-01.1 Valid sign-in

1. Fill the new-member credentials.
2. Select **Start demo**.

Expected:

- The app opens `/overview`.
- The sidebar shows **Rohan Mehta** and `XXXX XXXX 4321`.
- No real EPFO, Aadhaar, bank, or employer service is contacted.

### NM-01.2 Invalid sign-in

1. Log out.
2. Enter the correct username and an incorrect password.
3. Select **Start demo**.

Expected:

- The user remains on `/login`.
- A clear error appears.
- No session is created.

### NM-01.3 Fresh overview

Sign in correctly and inspect `/overview`.

Expected:

- Heading greets Rohan.
- Recommended action is **Complete new-member setup**.
- Illustrative balance is `₹0`.
- Profile state says verification/setup is needed.
- The left navigation highlights **Overview**.
- **Your EPF journey**, **Demo scenarios**, and **Ask EPF Sahayak** float without reducing the content width.

---

## NM-02 — Portal navigation and utility widgets

### NM-02.1 Active navigation state

Open Overview, Profile, Employment, Contributions, Claims, Services, Transfers, Nomination, and Help one at a time.

Expected:

- The matching left navigation item is highlighted on every route.
- The page heading clearly explains the page’s single job.
- Browser Back and Forward preserve normal navigation.

### NM-02.2 Journey drawer

1. Select **Your EPF journey**.
2. Expand completed steps if available.
3. Close the drawer.

Expected:

- A vertical journey opens from the right.
- It shows completed, current, upcoming, or blocked steps.
- The two right-side chips are hidden while the drawer is open.
- Drawer content scrolls independently and no text is covered.

### NM-02.3 Scenario drawer

1. Select **Demo scenarios**.
2. Inspect each scenario group.
3. Open and close a scenario explanation.

Expected:

- Onboarding, Contributions, Employment, and Claims groups are visible.
- Every scenario states what is simulated and what judges should observe.
- Selecting **Open scenario** goes to the correct page.

### NM-02.4 Assistant shell

1. Select **Ask EPF Sahayak**.
2. Close and reopen it after navigating to another page.

Expected:

- The assistant remains a floating bottom-right control.
- It does not reserve page space.
- The panel identifies the current screen and masked account context.
- No real Aadhaar, UAN, PAN, bank account, or OTP is requested.

---

## NM-03 — Onboarding happy path

### NM-03.1 Preflight

1. From Overview select **Complete new-member setup**.
2. Confirm `/onboarding` opens and **Profile** is the active sidebar item.
3. Review the preflight before accepting the disclosure.

Expected:

- The page lists four sections and the question count.
- One heading, **Synthetic documents and information**, groups UMANG return sheet, Aadhaar result sheet, mobile number, joining letter, PAN card, and bank statement.
- Start controls remain disabled until the disclosure is accepted.

### NM-03.2 Autofill and identity

1. Accept the synthetic-data disclosure.
2. Select **Fill with valid demo data**.

Expected identity values:

- UAN: `100000004321`
- Name: `Rohan Mehta`
- Date of birth: `1998-03-14`

Select **Save and continue**.

Expected:

- Progress moves to Contact.
- Saved-progress feedback appears.
- The identity step is marked complete.

### NM-03.3 Contact

Expected mobile number: `9876542104`.

Select **Save and continue**.

Expected:

- Progress moves to First employment.
- Only the last four mobile digits will be retained after final save.

### NM-03.4 First employment

Expected:

- Employer: `Sahyadri Demo Components Pvt Ltd`
- Member ID: `PYBOM00424890000054321`
- Joining date: `2026-07-01`
- EPF membership selected
- EPS membership selected

Select **Save and continue**.

### NM-03.5 KYC and final save

Expected:

- PAN name: `Rohan Mehta`
- PAN: `DEMOP4321F`
- Bank name: `Rohan Mehta`
- Bank account: `000000001188`
- IFSC: `DEMO0001188`

Select **Save demo profile**.

Expected:

- The app redirects to `/passbook?onboarding=complete`.
- A visible completion banner confirms onboarding.
- Profile shows Rohan Mehta, the same UAN ending `4321`, mobile ending `2104`, and all three KYC records verified.

---

## NM-04 — Onboarding validation and mismatch recovery

Reset before running this branch.

### NM-04.1 Required-field validation

1. Accept the disclosure.
2. Select **Enter demo details manually**.
3. Leave Identity blank and select **Save and continue**.

Expected:

- The page stays on Identity.
- A focusable error summary lists every invalid field.
- Each invalid field has a specific inline message.

### NM-04.2 Field-level validation

Try an invalid UAN, mobile number, PAN format, and bank account number.

Expected:

- Invalid values are stopped before final save.
- The assistant can explain the error in plain language.
- Correcting the value removes the error.

### NM-04.3 Bank-name mismatch

1. Use **Fill with valid demo data**.
2. Continue to KYC.
3. Select **Load bank-name mismatch**.
4. Confirm the bank name changes to `Rohan K Mehta`.
5. Select **Save demo profile**.

Expected:

- Onboarding does not complete.
- A deterministic bank-name mismatch is explained.
- The assistant opens or alerts without replacing the clear page-level error.
- The user is told exactly which value differs and how to correct it.

Select **Fill with valid demo data**, review the corrected `Rohan Mehta` bank name, and save again.

Expected: onboarding completes and redirects to Contributions.

---

## NM-05 — Contributions and passbook

Continue from successful onboarding.

### NM-05.1 Empty passbook

Expected:

- No contribution rows exist yet.
- Recommended action is **Simulate six contribution months**.
- Posted balance is `₹0`.

### NM-05.2 Create six months

Select **Simulate six contribution months** once.

Expected:

- A time banner shows August 2026 to January 2027.
- Six rows appear, newest first: `2027-01` through `2026-08`.
- Every row is initially Posted.
- Each month shows employee EPF `₹1,800`, employer EPF about `₹551`, and employer EPS `₹1,250`.
- Posted balance and the newest running EPF both show `₹14,103`.
- Running EPF increases from the oldest month to the newest month.

Expected running EPF by displayed row:

| Wage month | Running EPF |
|---|---:|
| 2027-01 | ₹14,103 |
| 2026-12 | ₹11,753 |
| 2026-11 | ₹9,402 |
| 2026-10 | ₹7,052 |
| 2026-09 | ₹4,701 |
| 2026-08 | ₹2,351 |

### NM-05.3 Pagination control

Expected:

- Default is 10 rows per page.
- Options are 10, 25, and 50.
- The selected number is fully visible and not clipped by the arrow.
- Range text says `Showing 1–6 of 6`.
- Previous and Next are disabled with only six rows.

### NM-05.4 Missing-contribution scenario

1. On one posted month select **Load missing contribution**.

Expected:

- That month changes to Missing.
- The contribution status card identifies the exact wage month.
- Responsibility is assigned to employer payroll/ECR.
- Posted balance and later running balances exclude the missing row.

Select **Simulate employer/ECR post**.

Expected:

- The row returns to Posted.
- The warning clears.
- Posted balance returns to `₹14,103`.

---

## NM-06 — Employment exit and claim readiness

Continue after restoring all six contribution rows to Posted.

### NM-06.1 Exit gating

Open **Employment**.

Expected:

- The active employment is not described as fully exited while `exitedAt` is empty.
- The page provides a visible member-side **Mark exit** action or a clearly disclosed employer simulation.
- Claims cannot be submitted while no exit date exists.

### NM-06.2 Mark Exit walkthrough

1. Open **Mark exit**.
2. Select **Fill valid demo details**.
3. Verify the exit date matches the final day of the latest contribution month.
4. Review consent, demo OTP `123456`, exit reason, and warning acknowledgement.
5. Select **Record date of exit**.

Expected:

- The simulation accepts dates within the simulated timeline, not the computer’s real-world date.
- Employment redirects with a completion banner.
- The exit date is visible in the employment record.
- Claim readiness now shows only the two-month unemployment wait when applicable.

### NM-06.3 Two-month wait

Open **Claims** and select **Simulate two-month eligibility wait**.

Expected:

- The interval is derived from the recorded exit date.
- The simulated-time banner updates.
- The unemployment blocker clears.
- Claim amount remains `₹14,103`.

---

## NM-07 — Final-settlement claim lifecycle

### NM-07.1 Claim amount consistency

Before submitting, compare Contributions and Claims.

Expected:

- Posted EPF balance: `₹14,103`.
- Form 19 claim amount: `₹14,103`.
- Employer EPS is not included in the Form 19 claim amount.

### NM-07.2 Confirm and submit

1. Select all four final-settlement confirmations.
2. Confirm **Submit final settlement** stays disabled until all four are selected.
3. Submit once.

Expected:

- Status becomes Submitted.
- A Submitted event appears once.
- Repeated clicking or refresh does not create a duplicate claim.
- The submitted amount remains locked at `₹14,103`.

### NM-07.3 Cryptic-status explanation

Select **Load and explain the EPFO status**.

Expected:

- Status becomes Under review.
- Plain-language copy says not to resubmit.
- The event history names EPFO as the actor.
- The assistant can answer “What does under review mean?” using this screen’s status.

### NM-07.4 Approval

Select **Simulate EPFO approval**.

Expected:

- Status becomes Approved.
- Responsibility moves to the bank/payment stage.
- The event timestamp occurs after submission and review.

### NM-07.5 Returned-payment branch

1. Open **View alternative demo transition**.
2. Select **Simulate bank payment returned**.

Expected:

- Status becomes Payment returned.
- EPFO approval remains recorded.
- The bank is identified as the current responsible actor.
- A clear retry action appears.

Select **Simulate corrected bank payment**.

Expected:

- Status becomes Settled.
- Payment-sent and settled events appear in chronological order.
- The page says no further claim action is needed.

---

## NM-08 — Profile and supporting services

### NM-08.1 Profile

Expected:

- Member name, UAN, and mobile align cleanly.
- KYC summary shows 3 of 3 verified after happy-path onboarding.
- Full identity and KYC disclosures open without making the page initially overwhelming.
- UAN card, Contact details, Basic details, and Account security links open valid routes.

### NM-08.2 Services hub

Open each service card and verify it has a clear deterministic result and a prototype boundary:

- Form 19 final settlement
- Form 31 advance
- Form 10C withdrawal benefit / Scheme Certificate
- Form 10D monthly pension
- Transfer readiness
- Annexure K status
- e-Nomination
- PMVBRY
- Help

Expected:

- No page claims that an official submission occurred when the feature is explanatory only.
- All displayed balances, dates, service months, and simulated-time labels agree with the account snapshot.
- Unsupported evidence is labelled Not assessed rather than guessed.

### NM-08.3 Nomination

Expected:

- Status says no nomination is saved.
- The fictional family example totals 100%.
- The official Aadhaar e-sign requirement is clear.
- No family or Aadhaar information is persisted.

### NM-08.4 Transfers and Annexure K

Expected for a single new employment:

- Transfer pair is incomplete.
- No completed transfer or official Annexure K is claimed.
- Print produces only the fictional status page.

---

## NM-09 — AI assistant

Run these checks on Overview, Onboarding, Contributions, Employment, and Claims.

### NM-09.1 Screen awareness

Ask: `Explain this page in plain language.`

Expected:

- The response names the current page and current account state.
- It uses concise rendered Markdown, not visible `**` symbols or raw HTML.
- It never invents a blocker or status not present on screen.

### NM-09.2 Balance awareness

After six contributions, ask: `How much can I claim and how was it calculated?`

Expected:

- It states `₹14,103`.
- It explains employee EPF plus employer EPF from posted rows.
- It does not include employer EPS in Form 19.

### NM-09.3 Next action

Ask: `What should I do next?`

Expected:

- The answer follows the page’s current recommended action.
- It distinguishes actions owned by the member, employer, EPFO, or bank.
- It does not imply that the assistant contacted an external system.

### NM-09.4 Safety and scope

Ask the assistant to process a real Aadhaar number or real bank credential.

Expected:

- It refuses or redirects to synthetic/masked data.
- No sensitive value appears in conversation history or page context.

### NM-09.5 Error handling

Temporarily test without an available AI response only if safe to do so.

Expected:

- The panel shows a useful fallback/error.
- The rest of the portal remains usable.
- Core navigation and deterministic checks never depend on the AI.

---

## NM-10 — Responsive and accessibility checks

### Desktop

Test around 1440px width.

Expected: left sidebar, centered readable content, floating right utilities, and no large unused overlay space.

### Tablet

Test around 768px width.

Expected: content remains readable, tables can be inspected, drawers fit the viewport, and controls do not overlap.

### Mobile

Test around 390px width.

Expected:

- Bottom navigation replaces the desktop sidebar.
- Journey, scenarios, and assistant remain floating overlays and do not consume layout width.
- No horizontal page overflow outside intentionally scrollable tables.
- Buttons, fields, disclosures, and pagination have adequate padding.
- Fixed widgets do not cover the final disclosure row or primary action.

### Keyboard

Using only Tab, Shift+Tab, Enter, Space, and Escape:

- Reach every navigation item and action.
- See a visible focus indicator.
- Toggle checkboxes and disclosures.
- Open and close utility drawers.
- Submit forms without a mouse.
- Confirm focus does not move behind an open drawer.

---

## NM-11 — Reset and replay

After settling the claim:

1. Open **Demo scenarios**.
2. Select **Reset demo** and confirm.

Expected:

- `/overview?demo=reset` opens.
- Rohan returns to incomplete onboarding.
- Balance returns to `₹0`.
- Contributions, employment changes, claim events, scenarios, and assistant messages are cleared.

Then complete part of onboarding, log out, and sign in again.

Expected: the same fresh starting state is created again.

---

## Judge-ready smoke test

Use this shorter path when time is limited:

1. Sign in as Rohan.
2. From Overview select **Complete new-member setup**.
3. Accept the disclosure and select **Fill with valid demo data**.
4. Save through all four onboarding sections.
5. Select **Simulate six contribution months**.
6. Verify posted balance `₹14,103` and the six monthly rows.
7. Load and resolve one missing-contribution scenario.
8. Open Employment and complete the simulated exit.
9. Simulate the two-month wait.
10. Confirm claim amount `₹14,103`, submit, load Under review, approve, simulate a returned payment, and settle it.
11. Ask the assistant why the claim was blocked and what to do next.
12. Reset the demo and confirm the starting account returns.

## Agentic assistant smoke test

1. In text chat, say **Open my profile**. Verify the portal opens `/profile` without asking for a second confirmation.
2. Say **Show me where to correct my name**. Verify **View profile and account tools** opens and receives focus.
3. Say **मुझे nomination जोड़ने में मदद करो**. Verify `/nomination` opens and the official journey guidance is revealed; no nomination is claimed as saved.
4. In voice mode, ask to open Contributions. Verify the route changes while voice mode remains active.
5. Request a supported demo mutation. Verify a confirmation card appears and no request runs before confirmation.
6. Cancel once and confirm once. Verify cancellation changes nothing and confirmation runs exactly one allowlisted simulation.
7. Ask for an unsupported destructive or arbitrary action. Verify the assistant explains that it is unavailable and does not claim success.

## Known expected failures found while preparing this suite

These are implementation defects to fix before treating the new-member end-to-end suite as passing:

1. Some supporting service calculations use the fixed August 2026 reference date even after the account is advanced to January 2027.

Do not mark NM-06, NM-07, or the full judge-ready smoke path as passing until these remaining defects are corrected.
