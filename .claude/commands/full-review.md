---
description: Full validation pass on the current main - run every review prompt and test scenario as if using the app daily, then report
argument-hint: "[optional area or recent change to focus on]"
---
Validate the current state of the app the way the owner would use it every day, at maximum effort, best AND worst
scenarios, step by step. Focus, if given: $ARGUMENTS

Owner's own words this is based on: "test various scenarios... if you were the user, what would you expect",
"review again step by step at your maximum efforts, both best and worst scenarios... as if using it daily",
"run every prompt and test scenario on the final main", "double validate and pick the most appropriate".

1. Run the build and every Node check the CLAUDE.md verification checklist lists (prop-wiring audit, pure-function
   tests with ADVERSARIAL inputs). Anything that can be proven by running must be run, not just read.
2. Run `/qa-scenarios` (worst/best case for pricing, quotes, sync, supplier sheets) and `/ux-review` (phone-first), then
   `/fix-proactively` for what they find.
3. Adversarial write-path walk for every save/delete/export the recent changes touch: crash right after each step; runs
   twice at once; retried; phone offline or only part of a batch lands; two devices at once. Each answer is either a test
   or an honest "not checked".
4. Sibling-path check for every fix: list every other way the same field/record is changed or created and check each.
5. Drive the real app in the browser at phone width through the owner's real jobs end to end (new quote -> edit ->
   new version -> invoice/breakdown; room list -> measurements -> combined supplier Excel). Look at what the owner sees,
   and double-check anything chosen by eye.
6. Fix what you can, push to main, then report briefly: verdict; findings ranked (money/data-loss first) with file:line,
   why it matters, the fix, and the test or run that proves it; what the existing checks still miss; ideas from the
   owner's side of the screen; and plainly what was PROVEN by running, what was only READ, and what could not be checked
   from here (and the one thing for the owner to try).
