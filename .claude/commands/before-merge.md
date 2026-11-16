---
description: Required gate before merging any fix - list every path to the bug, test each one, double-check, then merge
argument-hint: "[the bug or change being merged]"
---
Follow `MERGE_CHECKLIST.md` at the repo root for: $ARGUMENTS

Do every step. Don't merge until:
1. You've written down every path into the same code and data (every way the record is created, every state it can be
   in, records that earlier fixes produced, doing it twice, every reader of the field).
2. Each path is proven: by a test in `src/utils/*.test.js`, or by a live run on the Firebase emulator that reads the
   saved records back.
3. You've gone through the list a second time, and the PR description lists each path, how it was proven, and what
   couldn't be checked.
