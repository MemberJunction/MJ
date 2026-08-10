# Issue: MJServer REST handlers break external Express 5 consumers (`types → src`)

**Status:** Open
**Severity:** High — blocks building any external consumer of `@memberjunction/server` that resolves Express 5 types (e.g. Skip-Brain `apps/MJAPI`).
**Area:** `@memberjunction/server` (packaging + REST handlers), MJ package `types` convention
**Discovered:** During Skip-Brain migration to `@askskip/types` + MJ dependency bump.

---

## Summary

External projects that consume `@memberjunction/server` **type-check MJServer's TypeScript source** (not its compiled `.d.ts`) because every MJ package ships `"types": "./src/index.ts"`. When the consumer resolves **Express 5** type definitions (`@types/express-serve-static-core@5.x`), `req.params.<x>` is typed `string | string[]`, and any REST handler that passes `req.params.<x>` where a `string` is expected fails to compile. `MediaStreamHandler.ts` (added in the 5.44 line) has exactly this defect, reintroducing a bug that was already fixed elsewhere on 2026-06-09.

A secondary amplifier: `@bluecypress/bcsaas-*` packages **peer-depend on `@memberjunction/*` at `^5.40.1`**, so npm resolves those peers to the *latest* published MJ (currently 5.44.0) and hoists a 5.44 MJServer into the tree — even when the consuming project pins its own MJ deps to an older version.

---

## Symptom

Building `skip_brain_mj_api` (Skip-Brain `apps/MJAPI`):

```
../../node_modules/@memberjunction/server/src/rest/MediaStreamHandler.ts:55:42
  error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
    Type 'string[]' is not assignable to type 'string'.
55   const claims = verifyMediaToken(token, fileId);

../../node_modules/@memberjunction/server/src/rest/MediaStreamHandler.ts:66:49
  error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
66     const source = await resolveFileBytesSource(fileId);
```

Both errors trace to `const fileId = req.params.fileId;` (typed `string | string[]` under Express 5) being passed to functions that expect `string`.

---

## Root cause (four compounding layers)

1. **MJ packages expose source as their public types.** 249 of 250 installed `@memberjunction/*` packages set `"types": "./src/index.ts"` (a monorepo-wide convention for source-level go-to-definition). Consumers therefore type-check MJ's `.ts` **source**. `skipLibCheck: true` does **not** help — it skips `.d.ts`, not `.ts`. Note the compiled `dist/index.d.ts` exists and is shipped; only the `types` pointer is wrong for external use.

2. **Express 4 (MJ) vs Express 5 (consumer) `req.params` typing.** MJ builds against `@types/express-serve-static-core@4.x`, where `req.params.<x>` is `string`. Skip-Brain's `apps/API` runs `express@^5.1.0` with `@types/express@^5.0.3`, where `req.params.<x>` is `string | string[]`. MJServer's source compiles clean in the MJ repo but not in an Express 5 consumer.

3. **`MediaStreamHandler.ts` regressed an already-solved bug.** The exact `string | string[]` Express-param issue was fixed on **2026-06-09** in `SignatureWebhookHandler.ts` — commit `75da36f2ee` *"fix(MJServer): handle string | string[] type for Express route params."* Its message explicitly calls out the affected setup: *"downstream projects that use moduleResolution: 'node' with declarationMap: true (e.g. Skip-Brain MJAPI)."* `MediaStreamHandler.ts` was added **17 days later on 2026-06-26** (commit `a361daded5`, the media-player/range-streaming feature) and **did not apply that pattern**. It ships in the 5.44 line (not in 5.43.0 — the file postdates the v5.43.0 tag).

4. **`@bluecypress/bcsaas-*` caret peers pull the latest MJ.** `@bluecypress/bcsaas-api-keys@1.5.2` (via `@bluecypress/bcsaas-server-bootstrap@1.5.2`) declares `peer @memberjunction/server@"^5.40.1"`. npm satisfies this with the newest match (5.44.0) and hoists it to the root `node_modules`, so a 5.44 MJServer is present — and gets type-checked — even when the project pins its own `@memberjunction/*` to 5.43.0.

---

## Why this is not just a Skip-Brain problem

- The `types → src` convention affects **every** external consumer, not one project.
- The June-9 commit already recognized this class of bug and its remedy; the fix pattern is established. `MediaStreamHandler.ts` simply missed it.
- The bcsaas caret peers mean "just pin to an older MJ" does **not** reliably keep a 5.44 MJServer out of the tree.

## Evidence

- `@memberjunction/server@5.44.0` package.json: `"main": "./dist/index.js"`, `"types": "./src/index.ts"`, `"exports": { ".": "./dist/index.js" }`.
- `dist/index.d.ts` is present in the published package.
- Installed `@types/express-serve-static-core`: `5.1.1` (Skip-Brain) vs `4.19.8` (MJ repo).
- `MediaStreamHandler.ts` **absent** from `@memberjunction/server@5.43.0`; **present** in `5.44.0`.
- `npm why @memberjunction/server` shows the root 5.44.0 copy is a `peer` of `@bluecypress/bcsaas-api-keys@1.5.2` (`^5.40.1`).
- Precedent fix: `SignatureWebhookHandler.ts` uses `const driverKey: string = Array.isArray(rawDriverKey) ? rawDriverKey[0] : rawDriverKey;`.

---

## Fix

### MJ-side (correct, permanent)

**A. Fix the handler (applied on branch `CB-skip-client-open-app`).** Coerce `req.params.fileId` to `string`, matching the June-9 precedent:

```ts
const rawFileId = req.params.fileId;
const fileId: string = Array.isArray(rawFileId) ? rawFileId[0] : rawFileId;
```

Ships in the next MJ release (e.g. 5.44.1). Recommend a sweep of `packages/MJServer/src/rest/` for any other uncoerced `req.params.*` / `req.query.*` uses added since 2026-06-09 (audit at time of writing found only `MediaStreamHandler.ts`; `RESTEndpointHandler.ts` uses a `getStringParam()` helper, `token` is `typeof`-guarded).

**B. (Broader, separate effort) Ship compiled declarations as public types.** Point MJ packages' `"types"` at `./dist/index.d.ts` instead of `./src/index.ts`, so external consumers type-check the compiled `.d.ts` (skipped by `skipLibCheck`) rather than source. Eliminates this entire class of "consumer type-checks our source under stricter/newer types" problem. Large change (~250 packages / CodeGen template) + full republish; evaluate deliberately.

### Consumer-side (immediate, no MJ republish)

**C. tsconfig `paths` → dist (recommended immediate unblock).** In `apps/MJAPI/tsconfig.json`:

```jsonc
"baseUrl": ".",
"paths": {
  "@memberjunction/server": ["../../node_modules/@memberjunction/server/dist/index.d.ts"]
}
```

Forces resolution to the compiled `.d.ts` (skipped by `skipLibCheck`), so MJServer source is never type-checked — independent of which MJ version the bcsaas peers pull. Extend per-package if another MJ source surfaces.

**D. npm `overrides` pinning MJ to a fixed version.** Forces the whole tree (including the bcsaas `^5.40.1` peers, which accept older versions) to one MJ version. Truest single-version tree, but npm has no scope wildcard, so it requires listing packages (or scoping overrides under the bcsaas packages).

### Upstream hygiene (BlueCypress packages)

**E.** Consider narrowing the `@bluecypress/bcsaas-*` peer ranges on `@memberjunction/*` from `^5.40.1` to the intended supported range so npm stops silently pulling the newest MJ into consumers.

---

## Recommendation

- **Now:** apply **A** (handler fix — done on branch) and **C** (consumer tsconfig paths → dist) to unblock the Skip-Brain build.
- **Next:** release the handler fix (5.44.1) and evaluate **B** (types → dist) as the durable, consumer-agnostic remedy; raise **E** with the BlueCypress package owners.

---

## Related

- Precedent fix: `75da36f2ee` — fix(MJServer): handle string | string[] type for Express route params (`SignatureWebhookHandler.ts`)
- Regression introduced: `a361daded5` / `eab7f0e782` — feat(media): range streaming (`MediaStreamHandler.ts`)
- Files: `packages/MJServer/src/rest/MediaStreamHandler.ts`, `packages/MJServer/src/rest/SignatureWebhookHandler.ts`
- Reproduction: Skip-Brain `apps/MJAPI` (`moduleResolution: "node"`, `declarationMap: true`, Express 5)
