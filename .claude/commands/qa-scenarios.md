---
description: Lead QA pass - best and worst case scenarios for quotes, pricing, sync and supplier sheets, with a fix plan
argument-hint: "[optional area, e.g. price breakdown, supplier sheets, history]"
---
Act as a Lead QA Engineer. Stress-test this blinds quote app the way the owner uses it: on an iPhone, at a client's
home, often with weak or no signal, with real money on every quote. Focus area, if given: $ARGUMENTS

Read the code for the area (pricing in `src/utils/pricing.js`, `formatters.js`, `measurementUtils.js`; the quote
screens; `App.js` update/delete paths; `BulkMeasurements.js`) and run the real functions in Node and the real app in
the browser where you can. Say which findings were only READ in code and which were PROVEN by running something.

WORST CASE
- Odd input: widths/heights like `83"`, `5/16`, `34 5/16`, `8312/16`, blank, 0, negative, huge; quantities blank/0/999;
  fabric numbers in lowercase, with spaces, unknown, discontinued; names that end in digits or differ only by case.
- Range data: every consumer of a `{min,max}` price or an estimate range must handle BOTH ends (screen, copy text,
  invoice, price breakdown, Order Analysis, Statistics). A stale range left after a fabric is chosen.
- Flags that can both be true: trashed + archived; every writer AND every undo action.
- Async actions: double-tap, slow network, offline then back, two devices editing the same quote/sheet, the app killed
  mid-save. Anything destructive with no undo needs success/failure feedback.
- Scale: 40 windows in one quote, 100+ quotes, 1000 quotes - is any screen an endless scroll with its action button
  out of reach? Search, grouping, sticky actions?
- Combining records (several quotes/sheets in one export): does any comparison or numbering leak across clients?
- Money: no silent price changes to a quote already sent; totals on every screen/export must agree.

BEST CASE
- The common job (new quote, new sheet from a room list, send to supplier) should be the fewest taps with clear
  feedback (confirmation, undo, a visible "saving...").

Output: vulnerabilities as (file:line, scenario -> what happens -> what should happen), ranked by severity (pricing and
data-loss first, cosmetic last), plus the fix for each and the test or run that proves it. Then fix what you can.
