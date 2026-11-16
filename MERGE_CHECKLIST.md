# Before you merge: required for every bug fix and feature

The owner asked for this on 2026-11-16, after the same bug came back twice. The first fix only handled the one case in
the screenshot. The owner uses this app at clients' homes and must not be the one who finds the other cases.
**Don't merge until every box below is done. Write the answers in the PR description.**
Also available as the `/before-merge` command.

## 1. List every way to reach the bug, not just the one reported
Write down every path into the same code and data. Examples:
- **Every way the record is created.** A measurement sheet can be pulled from one quote, pulled from several, or started
  blank. A quote can be created new, from Edit, Duplicate, a sheet, or "Update estimate".
- **Every state the data can be in.** Old vs newest version; trashed; archived; deleted; renamed client; the address
  typed differently ("Flower mound" / "Flowermound" / "Flower Mound, TX"); blank fields; older records saved before a
  field existed.
- **What earlier fixes changed.** For example, a quote made from a sheet has one room per window. Does the fix still
  work on records like that?
- **Doing it again.** The same action twice in a row, or on a record the fix itself produced.
- **Every reader of the field.** Screen, Copy text, invoice, Price Breakdown, CSV/Excel, History, Statistics.

## 2. Test each path by running it, not by reading the code
- Add a test for each path to a `src/utils/*.test.js` file, and say which ones fail on the old code.
  Run `CI=true npx react-scripts test --watchAll=false`. Every test must pass.
- Run the real app against the Firebase emulator with test data that matches the report. Click through the owner's
  exact steps, plus each path from step 1 that shows on screen. Then read the saved records back from the emulator,
  because what's on screen isn't proof that the right thing was saved.
- `npx react-scripts build` must compile with no warnings.

## 3. Check it twice, then write it down
- Go through the list from step 1 a second time and look for any path you haven't tested yet.
- In the PR description, write: the paths you found; for each one, how it was proven (test name, or the live emulator
  run); what you couldn't check, and why. Then merge.
- Add a numbered entry to the case study in CLAUDE.md that names the path the first fix missed.

## 4. When you tell the owner
Keep it short and plain: what was wrong, what now happens in each case, and the one thing to try on their phone.
