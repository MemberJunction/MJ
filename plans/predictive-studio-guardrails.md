# Predictive Studio — Guardrail Gaps (field-tested)

**Recorded:** 2026-07-08 · **Source:** live UI testing session (Barnatt) — every gap below was hit for real while editing/training pipelines against the AssociationDemo data, not theorized.

The common theme: **the pipeline editor accepts anything at Save time, and Validate is opt-in.** A user who edits a spec and doesn't think to click Validate gets no feedback until train time — or worse, gets a silently degraded model.

---

## 1. Save-time validation gaps (pipeline editor)

All of these were accepted by Save without a warning during one real editing session:

| # | Gap | What actually happened | Impact |
|---|---|---|---|
| G1 | **Source entity ref not resolved** | Saved `{"Kind":"Entity","Ref":"EventRegistrations"}` — the real entity is `"Event Registrations"` (with space). No error until assembly fails. | Train fails late with an opaque error |
| G2 | **TargetVariable not checked against the source** | Source changed to Event Registrations while `TargetVariable` stayed `AllowUpdateAPI` (an Entity Fields column). Saved fine. | Guaranteed train-time failure |
| G3 | **Feature select columns not checked against the source** | Select step still listed `IsPrimaryKey, IsVirtual, AllowsNull, …` (Entity Fields columns) after the source became Event Registrations. Saved fine. | Guaranteed train-time failure |
| G4 | **LeakageGuard DenyFields not validated as column names** | Pasted a bracketed list; brackets embedded into entries: `"[CheckInTime"`, `"Status]"`. Saved fine — and the case-insensitive set now matches **nothing**, so the two most dangerous leak columns were silently *unguarded*. | **Worst one: silently disarms the leakage guard** — model trains "successfully" on leaked features |
| G5 | **Dominance threshold unbounded** | `SingleFeatureDominanceThreshold: 0.95` accepted — effectively disables the dominance flag (house default is 0.85; 0.6 is a sane strict setting). | Leakage detector neutered without warning |
| G6 | **No "this pipeline has trained models" edit warning** | The edited pipeline had a **Published** model hanging off it. Overwriting the spec silently orphans the lineage association. | Working demo pipeline trashed; recovery required reading the model's frozen `Lineage` JSON |

### Proposed fixes

- **`MJMLTrainingPipelineEntityServer.ValidateAsync`** (per [BASE_ENTITY_SERVER_PATTERNS](../guides/BASE_ENTITY_SERVER_PATTERNS.md)) — server-side, catches every write path (UI, agent, script):
  - G1: `EntityByName(ref)` must resolve for every `Kind: 'Entity'` binding
  - G2: `TargetVariable` must be a field on the target entity
  - G3: every select-step column must be a field on its source entity
  - G4: every `DenyFields` entry must match a real column on a bound source (a deny entry that matches nothing is almost certainly a typo — reject or warn)
  - G5: clamp/warn on `SingleFeatureDominanceThreshold` outside e.g. `[0.3, 0.9]`
- **UI (ps-pipelines editor)**: run the existing Validate automatically before Save (or block Train while the spec is dirty+unvalidated); confirmation dialog when saving a pipeline that has `MJ: ML Models` rows (G6), naming the models affected.
- Note: several of these checks already exist inside the **Validate** Remote Op — the fix is largely *relocating/reusing* them at save time, not writing new logic.

## 2. Feature assembly — silent dead features

| # | Gap | What actually happened | Impact |
|---|---|---|---|
| G7 | **Non-numeric column in a select step silently yields a constant-0 feature** | `CheckInTime` (datetime) added as a feature for a leakage test. `normalizeValue` emits `Date → toISOString()` ([feature-assembly-executor.ts:787](../packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts#L787)) but select-step schema declares every column `Kind: 'numeric'` ([:488](../packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts#L488)). The sidecar coerces ISO strings to nothing → whole column constant → importance exactly 0. No warning anywhere. | User sees a mysteriously dead feature; no signal that the column type was the problem |

**Proposed fix:** at Validate (and/or assembly) time, check each select column's `EntityFieldInfo.TSType`. Datetimes: either reject with "datetime columns need a derived numeric feature (e.g. days-since)" or auto-convert to epoch days. Strings that aren't value-list categoricals: same treatment. Post-train, a zero-variance column warning ("feature X was constant across all rows") would also have surfaced this immediately.

## 2b. Engine bug found (and FIXED) during scoring

| # | Gap | What actually happened | Impact |
|---|---|---|---|
| G8 | **As-of `column` exempt from the hydration guard** — ✅ **FIXED 2026-07-08** | First on-demand scoring run of a pipeline with `AsOfStrategy: {Mode:'column', Column:'RegistrationDate'}`: the scope's narrow projection dropped `RegistrationDate`; `requiredRowColumns` didn't include the as-of column, so hydration skipped it → every record failed at `resolveAsOfDate` → 0/6747, circuit breaker at 100% error rate. | Any as-of-`column` pipeline was unscorable via Record Set Processing scopes |

**Fix shipped:** `requiredRowColumns` now adds `params.asOf.Column` when `Mode==='column'`, so the as-of date is hydrated + hard-asserted exactly like a feature column ([feature-assembly-executor.ts](../packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts)). Two regression tests added to the anti-skew suite in `feature-assembly.test.ts` (hydrate-from-view + clean hard-fail). Positive note: the substrate behaved exactly as designed — circuit breaker, precise per-record error, visible run history. The *detection* guardrails worked; the *hydration* guard had a blind spot.

## 3. Demo-data lessons (context for anyone re-running the tests)

- **v1 AssociationDemo has no causal signal for no-shows** — `EventRegistration.Status` was sampled independently of everything (flat signal audit: lead time 30.3 vs 29.3 days). Confirmed instance of the known v1 flaw ("correlated facts sampled as independent draws", see `plans/association-db/HANDOFF.md` §4). 213/398 "no-shows" had a CheckInTime and 210 had CEUs awarded.
- **Fixed on 2026-07-08** by `scripts/prep-noshow-data.ts` (throwaway, untracked): injected a causal label (member flakiness + lead time − tenure − engagement + noise), preserved the aggregate rate exactly (398/6115), and rewrote `Status`/`CheckInTime`/`CEUAwarded` coherently. Post-fix signal: lead 51.2 vs 27.9 days, tenure 324 vs 905, prior-no-show-rate 0.120 vs 0.052.
- **Test bench:** the `Event No-Show Risk` pipeline (5 as-of `NS*` features on Event Registrations, target `NoShow`, deny-list incl. `CheckInTime`/`Status`, dominance 0.6, holdout 0.15). Leakage negative-test: allow + select **`CEUAwarded`** (numeric 0/1 proxy — *not* `CheckInTime`, see G7) → dominance flag must fire and block promotion.

## 4. Status

None of the fixes are implemented yet — this document is the backlog. Priority order by blast radius: **G4 (silent guard disarm) > G7 (silent dead feature) > G6 (overwrite published pipeline) > G1–G3 (late failures) > G5 (threshold clamp)**.
