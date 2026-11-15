# Gate 1 corpus audit: which known bugs can a base-only test find? (2026-11-15)

The generator writes tests on the base revision. A test finds a bug only when it passes on base and fails on the PR head.
So a known bug can be found only when behaviour that exists on base changes on head because of the bug.
This audit checks each of the 45 bug entries of `corpus/gate1.json` against that condition.

Method: four read-only analysis passes (Opus) read the bug PR diff, the fix diff and the code on base and head for each entry.
One verdict was checked by hand against the code (#6227) and one against git history (#5854); both hold. The other verdicts are not checked by a person.

## Verdicts

- **Catchable**: a plain unit test with normal stubs can pass on base and fail on head because of the bug.
- **CatchableHeavy**: possible, but the test needs many mocked collaborators.
- **PreExisting**: the wrong behaviour is the same on base. The PR moved the code, made the bug easier to reach, or left a protection incomplete.
- **NewCodeOnly**: the buggy code is all new (new file, function or package) and no base behaviour changes because of it.
- **WrongPR**: the lines that the fix corrects came from a different PR.

| Verdict | Count | Tuning | Held-out | Bug PRs |
|---|---|---|---|---|
| Catchable | 12 | 8 | 4 | #3831, #4450, #5906, #5513, #4253, #5040, #4572, #4451; held-out #4120, #4126, #5481, #5703 |
| CatchableHeavy | 3 | 3 | 0 | #5729, #4512, #6027 |
| PreExisting | 14 | 8 | 6 | #5897, #4290, #4245, #5063, #4065, #6227, #4828, #3354; held-out #3381, #4225, #4782, #5267, #4874, #3915 |
| NewCodeOnly | 14 | 10 | 4 | #3644, #4418, #3748, #6069, #3735, #3602, #5052, #4317, #4814, #3412; held-out #3824, #5047, #5514, #5878 |
| WrongPR | 2 | 1 | 1 | #3585; held-out #5854 |

Notes on single entries:

- #4253 and #4572 are Catchable but the backtest cannot run them (stale lockfiles, see GATE1.md).
- #4451: Catchable only through the new `EntityKeyField` index path; the reported case (a declared foreign key on a MAX column) is PreExisting.
- #5040: the verdict used the SQL parser version installed now, not the one at the base revision.
- #4782: the two tests that the match step counted are not the known bug. The match step fell back to the fix merge commit, and that commit also holds an unrelated change to `BuildEntityRecordNameSQL`.

## What this means

1. **The gate 1 target cannot be measured on this corpus as it is.** At most 15 of 45 entries (33%) can be found by this method, 12 of 45 (27%) without heavy mocking. The target is 25% of all entries. In the held-out slice the limit is 4 of 15.
2. **The miner rule is too weak.** "A later fix removed lines that the PR added" also selects PRs that moved buggy code, PRs that left an old bug in place, and PRs where the fix touched a nearby line.
3. **Results on the catchable entries (Hydrogen, all rounds):** 9 of the 12 Catchable entries were run. A test found the bug on 4 (#3831, #4450, #5906, #4120) and a reported catch was the bug on 3 (not #5906). The 5 misses: package not tested (#5481, #5703), ordinary input used and not the edge case (#5513), buggy branch mocked away (#4126); #5729 is CatchableHeavy.
4. **The 7 held-out PRs that were kept back are all PreExisting or NewCodeOnly.** They cannot add a catch. They can only show reports on PRs where the known bug is out of reach.
5. **Half of the real bugs are in new code.** A test on base cannot reach them. To find them the tool needs a second kind of test, written on head against the stated intent of the PR. That is a design change and is not in this plan.

Detail per entry: the four analysis reports are kept with the session files, not in the repository.
