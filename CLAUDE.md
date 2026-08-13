# Zebra Screens & Rollers — Blinds Quote App

Internal business app for a blinds/window-covering sole proprietorship. Two tools in one app:
1. **Quote Generator** — build client quotes (rooms, windows, motor/solar, pricing, PDF-less text/CSV export)
2. **Supplier Measurements** — turn a confirmed quote into a precise-measurement sheet for the fabric supplier, exported as CSV/Excel

**Stack:** Create React App (react-scripts 5), no TypeScript, no test suite. Deployed on **Vercel**, auto-deploys from **GitHub: zebrascreensllc/blinds-quote-app**. Data layer: **Firebase Firestore** (real-time sync, offline-first) + **Firebase Auth** (email/password). Previously localStorage-only; mid-migration to Firestore — see "Firebase migration status" below.

The person you're working with (owner/operator) is non-technical, works mostly from an iPhone, and is often on-site at client homes with weak/no signal. **Offline reliability is a real business requirement, not a nice-to-have.**

---

## Before you touch anything: read this

This codebase has already had several serious incidents. Read this section before making changes, especially to pricing math or Firestore writes.

1. **Firestore rejects any literal `undefined` value in a document, full stop.** JS objects with `undefined` fields serialize fine to localStorage (silently dropped) but **crash Firestore writes**. This already caused one real data-loss scare (see `src/services/firestoreCollectionSync.js` — `sanitizeForFirestore`). Every write goes through that sanitizer. If you add a new Firestore write path, route it through `saveDocument`/`deleteDocument` in that file, not a raw `setDoc` call.

2. **Never call `setQuotes(...)` or `setSheets(...)` directly to make a change.** `quotes` state in `App.js` and `sheets` state in `SupplierMeasurements.js` are **only ever set by the Firestore real-time listener**. To make a change, call `updateQuotes(...)` / `updateSheets(...)` — these diff old vs new, push exactly the changed/added/removed items to Firestore, and let the listener round-trip back into state. A raw `setQuotes`/`setSheets` call updates local state but **never persists anywhere**, and gets silently overwritten the next time the listener fires. This exact bug has caused real incidents twice.

3. **`updateQuotes`/`updateSheets` return `Promise<{success, errors}>`.** For high-frequency calls (every keystroke in Supplier Measurements), it's fine to ignore the return value — a persistent, non-blocking sync-status banner handles failure visibility instead of popups. For **checkpoint-style operations** (create quote, create sheet, delete, save version), always `await` it and check `.success` before navigating away or declaring success to the user. Don't add a new checkpoint operation that skips this — "Sheet not found" (a real incident) was caused by navigating before confirming the write landed.

4. **A new quote version must carry forward `editedPrices`.** `generateQuote()` in `App.js` builds `quoteData` for a new version; it must include `editedPrices: editingQuote ? editingQuote.editedPrices : undefined`. Forgetting this silently wipes every manually-adjusted price (motor cost, solar cost, tax rate, per-window overrides) back to recalculated defaults — this was a real, serious incident.

5. **When exporting/generating data, check `row.solar` is actually read, not just tracked.** The data model has tracked `row.solar` correctly for a long time; the CSV export function simply never read it, so solar-equipped windows silently exported with zero indication of solar. This class of bug (field exists in the data model, one specific consumer forgets to read it) has happened more than once — when adding a new field, grep for every place the sibling fields are consumed and update all of them together.

6. **Run the verification checklist below before considering any change done.** This project has no test suite; these are the substitute.

---

## Verification checklist (run before calling any change finished)

No test suite exists. Use these instead, every time:

**1. Bracket/paren/brace balance** — a Python script that walks the file char-by-char respecting strings/comments (regex alone gives false positives on JSX). Ask Claude Code to write this fresh each time, or keep one in `/scripts/check_balance.py` — walks `(`, `[`, `{` and their closers, skips string/comment contents, reports exact mismatched line.

**2. Unused/never-referenced-again variable check** — flag any `const`/`let` declared but referenced ≤1 time total (i.e., never used after declaration). Cross-file exports will false-positive (declared in file A, only consumed in file B) — that's expected and fine, just eyeball those specifically.

**3. Setter-declared-but-never-called / called-but-never-declared audit** — for React state: extract every `set[A-Z]...` used as a function call, cross-check against every `const [x, setX] = useState(...)` declaration. Catches orphaned setters left over from refactors.

**4. Prop-wiring audit for the split components** — `SupplierMeasurements.js` was split into `components/measurements/{SheetListScreen,QuoteSelectScreen,SheetEditorScreen}.js`. Automated check: extract the destructured prop list from each child's function signature, extract the props actually passed at each `<ComponentName ... />` usage site in the parent, diff them. React fails silently (renders `undefined`) on a missing prop — it will not throw, so this has to be checked explicitly, not assumed from a clean build.

**5. Numeric/logic tests via Node** — for pure functions (`utils/pricing.js`, `utils/measurementUtils.js`, `utils/formatters.js`), copy them to a scratch dir, fix the extension-less imports Node ESM needs (`from './formatters'` → `from './formatters.js'`), and actually run them with realistic inputs. Don't just read the code and reason about it — this project has repeatedly found real bugs (including two in the core pricing engine) that only surfaced by executing the function.

**Known sandbox limitation** (may not apply to Claude Code, which has full local network/npm access): the environment this project was built in could not reach the npm registry or any live Firebase project, so new dependencies (`firebase`, `exceljs`) and the full Firestore integration were written carefully against known API shapes but never literally executed before shipping. If you're in an environment with real `npm install` and ideally a Firebase emulator, use them — actual execution beats careful reading every time, which this project's history proves repeatedly.

---

## Architecture

```
src/
├── App.js                          (~2350 lines — quote generator: form, pricing table, history, dashboard, migration screen)
├── AuthGate.js                     (top-level: shows Login or App based on Firebase auth state)
├── firebase.js                     (Firestore + Auth init; REAL config now filled in, offline persistence enabled)
├── firestore.rules                 (security: each user can only read/write their own users/{uid}/... data)
├── components/
│   ├── Login.js                    (email/password sign up + log in)
│   ├── SupplierMeasurements.js     (container: state, Firestore sync, routes to 3 screens below)
│   └── measurements/
│       ├── SheetListScreen.js      (saved sheets list)
│       ├── QuoteSelectScreen.js    (pick quote(s) to build a sheet from)
│       └── SheetEditorScreen.js    (bulk tools + per-window editor + export — biggest of the three, most frequently touched)
├── services/
│   ├── authService.js              (signUp/logIn/logOut/subscribeToAuthState)
│   ├── firestoreCollectionSync.js  (generic subscribe/save/delete + the undefined-sanitizer — read rule #1 above)
│   ├── quoteSync.js                (thin wrapper: subscribeToQuotes/saveQuoteRemote/deleteQuoteRemote)
│   └── measurementSync.js          (thin wrapper, same shape, for measurementSheets collection)
├── utils/
│   ├── pricing.js                  (calculateGroupCost, calculateGroupQuote — the core $ engine, see "Pricing model" below)
│   ├── constants.js                (getPricingSnapshot, INITIAL_FORM_STATE — note: some exports here are dead code, harmless, predate recent work)
│   ├── formatters.js                (parseUnits, formatPrice, formatMoney)
│   ├── measurementUtils.js         (pure, zero dependencies on pricing.js — deliberate isolation, see below)
│   └── xlsxExport.js               (ExcelJS-based .xlsx export with real cell highlighting — CSV cannot hold color)
└── data/
    └── pricingData.js              (~491 fabric price entries)
```

**Deliberate isolation:** `utils/measurementUtils.js` has **zero imports from `pricing.js`**. Supplier Measurements only reads room/window *identity* data from quotes (location, motor, solar, dimensions) — it never touches pricing calculations. This was a deliberate architectural choice so a bug in one feature can never break the other. Preserve this boundary.

**Component split rationale:** `SupplierMeasurements.js` was split for maintainability (was 692 lines). All **state and Firestore logic stays in the container**; the three screen files are close to pure presentational components, receiving the same variable names as props that they used to close over directly. When extending, prefer adding to the container + passing props, rather than giving child screens their own Firestore calls.

---

## Pricing model (utils/pricing.js)

Core formula per window group: `cost (fabric+shipping+misc) + PROFIT_PER_WINDOW + width/height surcharge`, then motor/solar/tax layered on top. Key constants (in `getPricingSnapshot()`, `utils/constants.js`):

- `PROFIT_PER_WINDOW: 60`
- `MOTOR_COST_CLIENT: 80` / `MOTOR_COST_SUPPLIER: 50` (client charge vs actual cost — profit is the spread)
- `SOLAR_COST_CLIENT: 40` / `SOLAR_COST_SUPPLIER: 22`
- `REMOTE_6CH: 7` / `REMOTE_16CH: 10` (remote cost split across windows in the same room's remote group; switches to 16CH remote when a room has >6 motorized windows)
- `SALES_TAX_RATE: 0.0825`
- `WIDTH_SURCHARGES`: tiered by inch range · `HEIGHT_SURCHARGE: 37` (flat, above a threshold)

**`baseProfitPerWindow` vs `profitPerWindow`:** the per-window *displayed* price (`baseMinQuote`/`baseMaxQuote`) deliberately **excludes** motor and solar margin — those show as their own separate line items ("Motor N cost total", "Solar N cost total") so editing one window's price doesn't silently swallow the motor/solar amount. The **Grand Total** (`minQuote`/`maxQuote`, using full `profitPerWindow`) still includes everything. If you touch this formula, verify both numbers with a real calculation — a past bug here (missing `WIDTH_SURCHARGES` in a fallback object, plus a `!== null` check that didn't catch `undefined`) crashed pricing for any quote without a saved pricing snapshot; both were root-caused only by actually running `calculateGroupQuote()` with realistic inputs, not by reading the code.

**Range pricing:** when no specific fabric is chosen (blind-type-only estimate), `calculateGroupCost` returns `isRange: true` with a real `minCost`≠`maxCost`. The per-window price editor supports both a **Fixed** mode (one price) and a **Range** mode (separate Min/Max boxes) for this case — stored as either a plain number or `{min, max}` in `editedPrices.perWindowPrices[priceKey]`. Every consumer of that field must handle both shapes (`isRangeOverride()` helper checks which).

---

## Supplier Measurements — export format

CSV/Excel headers and behavior were reverse-engineered against the supplier's actual reference spreadsheet (not guessed). Current confirmed format:

```
S No, Client name, LOCATION, Comment, Manual/Smart, Motor-type, Remote, CASSETTE, MOUNT, FABRIC MODEL, Width (Inches), Height (Inches), Blind Type
```

- **"Manual/Smart" column** (not "Motor/Smart") — value is `Smart`/`Manual`, with variants **appended to the same cell**: `Smart - Left side`, `Smart - Solar`, or both combined. Never a separate column for these.
- **Comment column** — free-text per-window note (e.g. "Side-by-side" for special mounting configs), sits between LOCATION and Manual/Smart.
- **Highlighting** (Excel export only — CSV cannot hold color at all) — yellow fill on: a filled Comment cell, a Manual/Smart cell with a Solar/Left-side variant, and a non-default Mount value (`DEFAULT_MOUNT = 'Inside'`). Verified against all 15 rows of the actual reference file with 100% match. **Not yet replicated:** the reference file also highlights Height on some rows for a reason that couldn't be confidently determined from the data alone — don't guess at this without asking first.
- `buildRowExportFields()` in `measurementUtils.js` is the **single source of truth** for both CSV and Excel row construction — this exists specifically so the two export formats can't drift out of sync the way the Solar bug happened (data existed, only one consumer read it). Any new export field goes here first, then both `sheetToCSV` and `xlsxExport.js` consume it.
- Cassette defaults to S3 PLUS instead of S1 automatically for windows over 90in tall (`CASSETTE_S3_HEIGHT_THRESHOLD`), based on the quote's rough height at sheet-creation time (not the precise measurement, which starts blank by design).
- Remote channel numbers (`Remote {group}#{channel}`) are **explicitly stored per-row** (`remoteChannel`), assigned in the order windows are *selected* in the bulk-assign tool — not derived from table position. (An earlier version derived it from position, which silently assigned channels in the wrong order whenever selection order differed from table order — a real, confusing bug for the business.) Max 16 channels per remote group, enforced on both the bulk tool and the single-row dropdown.
- Hard validation blocks Copy/Download until every window has width, height, fabric, and (if motorized) a remote group — no partial/incomplete exports.

---

## Firebase migration status

**Done:**
- Firestore + Auth wired in, real project config in place (`firebase.js`)
- Offline persistence enabled (`persistentLocalCache` + `ignoreUndefinedProperties` as a second safety net)
- Login/signup screen, auth gate (`AuthGate.js`) in front of the whole app
- Quotes and Measurement Sheets both fully migrated off localStorage to Firestore, real-time sync
- One-time migration screen for quotes that existed in localStorage before the Firestore migration (with an in-place backup/download option, since this exact flow caused a real incident when it first shipped)
- Distinct "sync failed" vs "still loading" vs "genuinely empty" states for both quotes and sheets — previously indistinguishable, which looked like data loss when it wasn't

**Not yet done / verify next:**
- **Real multi-device sync test** — create/edit on one device, confirm it appears on another, has not been verified against a live project (sandbox constraints prevented it during development)
- **Offline-write-then-reconnect test** — the specific scenario that matters most for this business (on-site at a client's house, weak/no signal). Firestore's design supports it; it has not been exercised live.
- Height-highlighting rule in the Excel export (see above)

---

## Business context

Solo operator, mobile-first (iPhone), sole proprietorship. Quotes typically 1–30 windows, mostly Zebra/Roller blinds, many with motorization (Zigbee) and some with solar panels. Client-facing quotes need to be defensible (correct math, no silent price changes between versions) since real money and real client relationships are on the line — treat pricing-logic and Firestore-write bugs as high severity by default, cosmetic UI issues as lower.
