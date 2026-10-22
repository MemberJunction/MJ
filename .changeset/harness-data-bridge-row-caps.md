---
'@memberjunction/react-test-harness': patch
---

fix(react-test-harness): cap data-bridge rows and report what each call returned

A generated component could ask the harness data bridges for an unbounded result set and get it — `RunQueryParams.MaxRows` is documented as "if not provided, all rows will be returned", and nothing supplied a default. In production a component's query returned 205,802 rows and exhausted the host process heap. A bridge result is JSON-serialized in Node, shipped over CDP and rehydrated in Chromium, so one oversized answer becomes several resident copies.

`__mjRunView`, `__mjRunViews` and `__mjRunQuery` now clamp `MaxRows` to the new `ComponentExecutionOptions.dataCaps` (default 1000 each), clamping downward only so a component asking for 50 rows still gets 50. The provider applies `MaxRows` at the SQL level, so the surplus is never produced rather than fetched and discarded.

`ComponentExecutionResult.dataAccess` records every call — `kind`, `target`, `identity`, `rowsReturned`, `totalRowCount`, `capped`, applied and requested ceilings, duration, and any error. `RunViewResult` and `RunQueryResult` already carry `TotalRowCount`, so a capped call reports "1000 of 205802" without a second query; providers that omit it yield `capped: false` rather than a guess. A capped call also raises a `data-row-cap` warning, so a deliberately sparser render is not mistaken for a defect. These counts were already computed and logged under `debug` but never reached the caller — which left consumers unable to distinguish "no data displayed" from "the query returned nothing", where only the first is a code defect.

Call targets are now resolved the way `RunView`/`RunQuery` resolve them. A query name is not unique (name and category path identify a query together), so query targets are category-qualified and `QueryID` takes precedence, matching `RunQuery` ignoring `QueryName` when both are supplied. `RunView` follows its own documented order — `ViewEntity` → `ViewID` → `ViewName` → `EntityName` — where a saved-view call previously reported `unknown`. `DataAccessIdentity` exposes the parts separately using the same field names as `ComponentSpec.dataRequirements`, so callers can correlate declared against actual data access without parsing a display string.

Also lowers the HTML truncation backstop from 100MB to 25MB (it is a backstop behind the row caps now, and the old threshold was calibrated against Node's string limit rather than the heap), and deletes the unused 444KB `component-linter.ts.working` left behind when the linter moved to `@memberjunction/react-linter`.

Additive: `dataCaps` and `dataAccess` are both optional. The behavioural change for existing consumers is that a previously unbounded request is now bounded at 1000.
