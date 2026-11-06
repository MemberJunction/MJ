---
"@memberjunction/core": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/integration-test-suite": minor
---

Fix the prompt failover loop's bookkeeping (#3789, #5963) and remove its dead code (#4907).

- After a `VendorValidationError` or `Authentication` error drops a vendor's candidates, the loop now calls the candidate that slid into the failed slot instead of skipping it, and no longer stops early when one candidate is left.
- A returned failure that is not eligible for failover now counts as a failover attempt, like a thrown one. `FailoverAttempts` on a run that failed this way is 1, not 0.
- A failed result after an earlier failover is recorded as a failure: the run's `ModelID` / `VendorID` stay on the model it started with instead of moving to the model that failed.
- The error result built after every candidate fails now records the last attempt's `ToolCallingMode`, so those prompt runs no longer save NULL. A thrown model error carries the tool-calling decision for this.
- Removed `transitionToNextCandidate`, `shouldAttemptFailover`, `selectFailoverCandidates` and `calculateFailoverDelay`, which had no callers. A subclass that overrode them was never called.
- The `MJ: AI Prompts.FailoverStrategy` field description now says that the chat runner only tells `None` from the other values (metadata).
- IT129's native tool-calling checks report each prompt call's `Success` next to its mode.
