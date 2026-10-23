---
description: Add defensive guardrails and clear empty/loading/failure states to the code just written or reviewed
argument-hint: "[optional: which findings to fix]"
---
Implement the fixes from the latest /qa-scenarios and /ux-review passes (or: $ARGUMENTS). As you write the code, add
defensive programming and UX guardrails:

1. Validate at the edges with safe fallbacks so the app never crashes or silently mis-prices on bad data: parse free-typed
   sizes/quantities with the shared helpers, clamp or refuse with a plain message, never write NaN, negative or absurd
   amounts, never write `undefined` to Firestore (everything goes through the sanitizer).
2. Every async/destructive action: disable + relabel while running (no double-submit), check `.success`, and tell the
   owner when a write failed. Never navigate away before the write is confirmed.
3. Elegant empty, loading and failure states: no blank screens; a plain sentence and the next useful action; a way out
   when loading takes too long.
4. Keep it modular: pricing and parsing logic stays in `src/utils/` (pure, runnable in Node); screens only wire it up.
   When a fix exists for one way of changing a field, find EVERY other way and apply it there too.

Then run the CLAUDE.md verification checklist (build, prop-wiring audit, Node tests incl. adversarial inputs), verify in
the browser at phone width, commit, and push to main.
