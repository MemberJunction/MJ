# Clean-set labels (2026-11-15, provisional)

These labels are **not author labels**. Four sub agents (Opus) read the test, the PR diff, the PR text, the real callers and the later history on `next` for each reported catch, and chose *Bug*, *Intended* or *TestFault* as the design defines them. The controller checked the cited fix commits and two cited code lines; the rest is not checked by a person. The labels are not recorded in the label store.

## Result

| Set | Code | Clean PRs | PRs with a report | PRs with a false alarm (*Intended* or *TestFault*) | False-alarm rate | Gate |
|---|---|---|---|---|---|---|
| Tuning slice | Before N25 (`8a14b23f05`) | 15 | 2 | 0 | 0% | ≤ 10% |
| Held-out slice | Final (`02bc3c6052`) | 15 | 9 | 9 | 60% | ≤ 10% |

Reports by label: tuning 4 *Bug*; held-out 4 *Bug*, 6 *Intended*, 8 *TestFault*. With reports limited to median High, the held-out set still has a false alarm on 6 of 15 PRs (40%).

## Labels

| PR | Catch | Median | Label | Confidence | Reason |
|---|---|---|---|---|---|
| #3624 | cc6874b2 | High | Bug | High | Unreachable tasks are set to Blocked with no Pending check, so a running task is overwritten. `4b8f1ec1ed` on `next` added the guard. |
| #3624 | a3af1d0b | High | Bug | High | Same write turns a Complete task into Blocked. |
| #3823 | e76c0663 | High | Bug | Medium | `Progress: 1` (documented as 0–100) shows 100%. The PR text does not mention progress. No caller in this repo; still on `next`. |
| #3823 | c2664bbe | Medium | Bug | Medium | Same root cause, checked on the parsed value. |
| #3525 | 95798090 | High | TestFault | High | The mock gives a string timestamp; a real entity always gives a Date. |
| #3525 | 48b7d6b7 | High | TestFault | High | The mock gives no timestamp; saved filter rows always have one. |
| #3907 | 17cbea6e | Medium | Intended | Medium | The PR skips settled rows on purpose. *Bug* is a close second (a provider added later). |
| #3892 | 3cde05af | High | Intended | Medium | The diagnostic text is built when read, as the PR says; no caller registers a class in between. |
| #3892 | 571ac44c | Medium | TestFault | Medium | No caller in the repo writes to `Reason`. |
| #3872 | b2ab675a | High | Bug | Medium | A `./migrations` directory cuts the first letter of each file name. `next` now fails loudly on this case. |
| #3872 | a9bb86f6 | Medium | TestFault | High | GitHub never returns `..` in a path. |
| #3895 | 67466bdd | High | TestFault | Medium | The test pushes into an internal array; real loads replace it. |
| #3968 | 185c403c | High | Intended | High | `93030fd758` in the PR removes the map rows on purpose; still on `next`. |
| #4123 | d929436a | High | TestFault | Medium | An Invalid Date input; no caller in the repo passes `ReceivedAfter`. |
| #4123 | d761cd08 | High | Bug | Medium | A caller filter with `or` is joined without parentheses; still on `next`. |
| #4123 | f7a3ac08 | High | TestFault | Medium | Same defect with uppercase `OR`, which Graph is believed to reject (not checked against the service). If Graph accepts it, this is a duplicate *Bug*. |
| #4276 | 9306b335 | High | Bug | High | Reply ignores the mailbox on the request. Fixed by `ee85060f24` (#4334). |
| #4276 | 3c5dbc59 | Medium | Intended | High | The PR text says GetMessages rejects when no mailbox resolves. |
| #4276 | 58b4f033 | Medium | Bug | Medium | The Forward error tells the caller to pass a mailbox that it cannot take. Fixed by `0f56a0b13f`. |
| #4470 | 116af856 | High | TestFault | High | Foreign keys with spaces around them; database UUID values never have them. |
| #4470 | 4aa8dae6 | Medium | Intended | Medium | `AdditionalLoading` runs on each cache event on purpose; the test uses a made-up subclass. |
| #4470 | 0ef76063 | Medium | Intended | Medium | Errors are logged and the event still fires, as documented. |

## What this means

- The catch-rate changes (N25) raised known-bug catches from 3 to 6 of 10, but the held-out clean set fails the false-alarm gate by a wide margin. The two clean sets hold different PRs, so part of the difference can be the PR mix.
- The 8 *TestFault* reports share one cause: the test gives a mock or an input that no real caller can produce (string timestamp, Invalid Date, `..` path, padded UUID). The prompt now asks for edge inputs after the exact trigger.
- The 6 *Intended* reports are behaviour that the PR text or a commit in the PR states. The judges rated them High or Medium.
- 8 of the 22 reports are real defects that no fix PR was linked to, and 3 of those were fixed later.
