# PR 2 — Planted-truth suite, dev environment and containment

> **For agents:** read `AGENTS.md` (plans repo) or §2 "Agent bootstrap" below before anything else. Execute
> milestones in order (M1 → M6, then C1 → C6, then M-final), tasks as checkboxes (`- [ ]` → `- [x]`). Append to §11
> before you stop, for any reason.

## 1. Header

| Field | Value |
|---|---|
| PR | 2 of 6 — Planted-truth suite, dev environment and containment |
| Status | not-started |
| Tier | Ready |
| Anchored to | MJ `origin/next` @ `141d8d065c` (2026-10-20) |
| Last refresh | 2026-10-20, Claude Opus 4.7 (kickoff refresh + adversarial review audit against `coding_standards.md` & PR 1 lessons learned, §9 D2-43–D2-47), `141d8d065c` |
| Depends on | — (PR 1 `#5540` merged on `141d8d065c`; reconciles PR 1's four shipped gate tests, D-009, D2-45) |
| Unblocks | PR 3 (every Phase 1–2 gate runs on this suite), PR 6 J1–J2 (may start after this merges) |
| Branch | `ps/pr-2-truth-suite-containment` (companion: `MemberJunction/loom`, same branch name) |
| MJ destination | `plans/predictive-studio/PR-2-truth-suite-containment.md` |
| Gates owned | 10 (Phase 0: G0.1, G0.4–G0.12, listed in §4.1; G0.2 and G0.3 moved to PR 4 by program D-030); registers all 111 as named tests (§4.2), including G0.2/G0.3's bodies as PR 4's `expected-fail` gates |
| Findings closed | 39 owned (F-MC-7 is closed with F-L3-1, into which it is merged); F-ENV-5 → PR 1 and F-LOOM-5 → PR 6 transferred (program D-022, D-023); 19 contained for later owners (§3.2) |

**Goal:** make "done" a test result for the whole rebuild — a planted-truth suite in MJ that runs Predictive Studio on
worlds whose answers are known and judges it against those answers — and, with small local changes, stop PS's most
dangerous behaviours (the containment milestones C1–C6).

**Architecture:** a new private workspace package `packages/AI/PredictiveStudio/TruthSuite` holds the gate registry
(111 named tests, each tagged with its owning PR and a status), the seeded generators (Loom worlds W1–W9 and 14
planted scenarios, Loom pinned by commit), the loaders into a test-only `pstruth` schema registered as MJ entities by a
committed migration, the TypeScript harness that drives PS through MJAPI exactly as a browser does, and a Python
package (judges + reference pipeline) in its own pinned venv. A GitHub Actions workflow runs a PR subset, a nightly
run and a weekly run on a throwaway SQL Server. The containment milestones change product code so the ten Phase-0 gates
PR 2 owns pass; the automated publish path is left as `next` has it (program D-029, D-030; PR 4 gates it).

**Tech stack:** TypeScript (ESM, vitest, `mssql` bulk load, `@memberjunction/graphql-dataprovider`), Node ESM generators
on the Loom engine library, Python 3.11/3.12 (numpy, pandas, scipy, scikit-learn, xgboost, lightgbm, statsmodels,
pyarrow, pytest), T-SQL (test schema only), GitHub Actions, SQL Server 2022.

## 2. Agent bootstrap

### 2.1 Repositories you need

| Repo | Where | Access | Used for |
|---|---|---|---|
| MemberJunction | `https://github.com/MemberJunction/MJ`, your worktree (examples use `$MJ`) | read/write on the PR branch | everything |
| Loom | `https://github.com/MemberJunction/loom` (public, default branch `next`, HEAD `63aec01f61` on 2026-10-12) | read/write on the companion branch | M3 Loom fixes; the generators' engine |
| ps-review | `/Users/arieglazier/repos/ps-review` @ `d47dfb86f1` (local only, never modified) | **read only** | source of every ported file (M3, M5); each copy is verified by the sha256 prefix this plan lists |
| Plans repo | `/Users/arieglazier/repos/ps-rebuild-plans` | read; `reference/gates.json` is copied in M2 | gate registry source |

**Prerequisite check (run first; a failing line runs its remedy, then the line is re-run):**

```bash
test -d /Users/arieglazier/repos/ps-review/.git && git -C /Users/arieglazier/repos/ps-review rev-parse --short HEAD   # → d47dfb86f1
test -f /Users/arieglazier/repos/ps-rebuild-plans/reference/gates.json && echo gates-ok                             # → gates-ok
git ls-remote https://github.com/MemberJunction/loom HEAD                                                           # → <sha>	HEAD
for p in python3.11 python3.12; do command -v $p && $p --version; done                                             # → at least one 3.11.x / 3.12.x
command -v sqlcmd node pnpm                                                                                        # → three paths
```

| Failing line | Remedy (automatic; no step waits on a person) |
|---|---|
| ps-review | Apply §9 D2-36: ps-review exists only on the reference host (the machine every absolute path in this plan names). A session on another host runs only the tasks that do not read it (M1, M2, M4.1, M6 once M3/M5 are pushed, C1–C6, M-final), takes the port sources from the branch once the M3 and M5 checkpoints are pushed (`git fetch origin && git ls-tree -r --name-only origin/ps/pr-2-truth-suite-containment -- packages/AI/PredictiveStudio/TruthSuite/generators packages/AI/PredictiveStudio/TruthSuite/python/truthsuite` lists them), and writes its handoff entry with "next: M3.4 / M5.2 / M5.4 / M5.6 port steps on the reference host" when they are not pushed yet. It never uses a copy from anywhere else: every port step verifies sha256 prefixes, so another copy is detected. |
| gates.json | `git -C /Users/arieglazier/repos/ps-rebuild-plans status --short reference/gates.json` (restore it from the plans repo's last commit with `git -C … show HEAD:reference/gates.json > …` only if the file is absent; never edit it); after M2 the branch carries `TruthSuite/gates/gates.json`, the registry every later task reads. |
| Loom `ls-remote` | Network: retry 3 times 30 s apart (`for i in 1 2 3; do git ls-remote https://github.com/MemberJunction/loom HEAD && break; sleep 30; done`). Still failing: write the command output into the handoff entry as the next step and end the session (no task can run without the Loom engine). |
| Python 3.11/3.12 | macOS `brew install python@3.11`; Linux `sudo apt-get install -y python3.11 python3.11-venv`. |
| `sqlcmd` / `node` / `pnpm` | `brew install sqlcmd`; `brew install node@24`; `corepack enable && corepack prepare --activate` (the version `packageManager` in `$MJ/package.json` pins). Docker is not needed locally: only the CI runner (M6.1) starts SQL Server in Docker. |

### 2.2 Branches

```bash
cd $MJ
git fetch origin
git checkout -b ps/pr-2-truth-suite-containment origin/next
git branch --unset-upstream
# first push happens at the plan commit (program/conventions.md §1 step 4):
git push -u origin ps/pr-2-truth-suite-containment
git branch -vv | grep '^\*'          # → * ps/pr-2-truth-suite-containment <sha> [origin/ps/pr-2-truth-suite-containment] …

# Loom companion (M3), in a separate clone:
git clone https://github.com/MemberJunction/loom $LOOM && cd $LOOM
git checkout -b ps/pr-2-truth-suite-containment origin/next
git branch --unset-upstream
```

### 2.3 Database and environment file

One private database: `MJ_PS_PR2_<agent>` (e.g. `MJ_PS_PR2_claude`; add a suffix if one vendor runs two sessions).
Never point at a database another session might use.

```bash
cd $MJ
cp .env .env.MJ_PS_PR2_<agent>
# edit .env.MJ_PS_PR2_<agent>: DB_DATABASE=MJ_PS_PR2_<agent>, GRAPHQL_PORT=4021 (402<k> for agent k), MJ_API_KEY=<any long random string>
set -a; source .env.MJ_PS_PR2_<agent>; set +a
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -Q "CREATE DATABASE [MJ_PS_PR2_<agent>]"
```

Every `mj`, `pnpm`, `sqlcmd` and harness command below runs in a shell where that file is loaded
(`set -a; source .env.MJ_PS_PR2_<agent>; set +a`).

**Clean build of the database (once, then after any `next` merge that adds migrations):**

```bash
pnpm install                                            # at the repo root only
pnpm run build; echo "build exit=$?"                   # → build exit=0
pnpm mj migrate
pnpm mj codegen --skipfiles
pnpm mj sync push --dir=metadata --ci
pnpm mj sync push --dir=metadata-optional/integration-test --ci
pnpm mj codegen --skipdb
pnpm run build; echo "build exit=$?"                   # → build exit=0
git status --short                                      # → only your own files; restore `sync` blocks CodeGen wrote back into metadata/**/*.json
```

From M4 on, the test schema is added with `pnpm --filter @memberjunction/predictive-studio-truth-suite run
truth:provision` (M4.2), and MJAPI must be restarted afterwards so it loads the `pstruth` entities.

### 2.4 Python

Until M1 lands, the sidecar setup needs an explicit 3.11/3.12 interpreter (the pinned `numpy==1.26.4` does not install
on ≥ 3.13; this machine's `python3` is 3.14.4):

```bash
brew install libomp cmake                                # macOS once; Linux: apt-get install libgomp1
cd $MJ/packages/AI/PredictiveStudio/Sidecar
rm -rf .venv && python3.11 -m venv .venv && .venv/bin/python -m pip install -r src/python/requirements.txt scipy==1.17.1
export DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib    # macOS
```

After M1: `pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python` (it picks 3.11/3.12 itself and fails
with a clear message otherwise). After M5: `pnpm --filter @memberjunction/predictive-studio-truth-suite run setup:python`
builds the truth-suite venv.

### 2.5 Servers and ports

| Process | Port | Command | Ready check |
|---|---|---|---|
| MJAPI | `GRAPHQL_PORT` = 4021 (402k) | `cd $MJ/packages/MJAPI && pnpm start > /tmp/mjapi-pr2.log 2>&1 &` | `until curl -s -o /dev/null --max-time 3 http://localhost:4021/; do sleep 5; done; echo UP` |
| Explorer (only for the Playwright UI checks in C4.5 and C6.6, §9 D2-34) | 4221 | once per worktree, point the git-ignored dev environment at your MJAPI: `sed -i.bak "s#localhost:4001/#localhost:$GRAPHQL_PORT/#g" $MJ/packages/MJExplorer/src/environments/environment.development.ts` (a host artifact, never committed); then `cd $MJ/packages/MJExplorer && NODE_OPTIONS=--max-old-space-size=16384 npx ng serve --port 4221 > /tmp/explorer-pr2.log 2>&1 &` | `until curl -s -o /dev/null --max-time 3 http://localhost:4221/; do sleep 5; done; echo UP` |
| Truth-suite sidecar | ephemeral (written to `$TRUTH_RUN_DIR/sidecar.url`) | started by the runner (M5.7) | the runner waits on `/health` |

MJAPI must be started with `PREDICTIVE_STUDIO_SIDECAR_URL` set to the truth-suite sidecar when gates run (the runner
prints the exact command, M5.7).

### 2.6 MoreCheese

Not needed. No Phase-0 gate uses MoreCheese data; the reference pipeline's real cases (C1, T2-real, R2-real, T1-real)
read committed fixtures copied in M5.2 (§9 D2-20). Do not install MoreCheese for this PR.

### 2.7 MJ rules that bite in this PR

- **Deprecated aliases go when you touch their non-component TS module (program D-053 as scoped by §9 D2-46; no shims, standards §3).** A task that
  modifies a Predictive Studio non-component TypeScript module (`packages/AI/PredictiveStudio/**/src/**`,
  `packages/Angular/Explorer/dashboards/src/PredictiveStudio/*.ts`,
  `packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ml-model-view-models.ts`,
  `packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/model-prediction.logic.ts`) deletes that file's `@deprecated` aliases in
  the same commit and moves every in-repo caller to the current name: `git grep -n "@deprecated" -- <file>` → 0 hits,
  and `git grep -nw "<alias>" -- packages` → 0 hits for each removed alias. For Angular component files (`*.component.ts` in `dashboards` and `core-entity-forms`) that carry ~140 `@deprecated` camelCase getter/method aliases bound by templates and DOM tests, delete only the `@deprecated` aliases of members that the task itself modifies or deletes (e.g. C6.2's deleted experiment controls); bulk component getter-alias removal remains in PR 6's dedicated `X-M1` milestone so PR 2 stays reviewable and surgical (§9 D2-46). The PR description's release note names
  every removed alias (an out-of-repo caller breaks at compile time).
- Commit and push only on `ps/pr-2-truth-suite-containment` (and the Loom companion branch), at milestone checkpoints,
  after the milestone's exit tests pass. `git branch -vv` before every push must show the branch tracking its own name.
- Never `git checkout -- <file>`, `git restore`, `git reset --hard` on work you did not create in this session.
- **Never commit `mj.config.cjs`** — the test-schema CodeGen config is committed as
  `codegen/truth-codegen.config.cjs` and copied to a git-ignored run directory at use (M4.2).
- Product migrations are not touched by the infrastructure milestones: the test schema's migration lives in
  `packages/AI/PredictiveStudio/TruthSuite/migrations/` and is applied with `mj migrate --schema pstruth --dir …`; it is
  never placed under `migrations/`. Its CodeGen `EntityField` inserts still use the apply-time `MAX(Sequence)+1`
  expression (checked by a TruthSuite unit test, M4.2).
- `mj sync push` before `mj codegen` when JSONType definitions change (containment milestones that touch metadata).
- TypeScript is strictly typed: no `any`, no `as any`, no `unknown` as a shortcut; generated entity properties, never
  `.Get()`/`.Set()`. Python modules are `mypy --strict` clean (the ported refpipe already is).
- pnpm only, `pnpm install` at the repo root only; declare every import in the importing package's `package.json`.
- Changeset: hand-written, `minor` iff the branch has a `migrations/` or `metadata/` change (C6 may), else `patch`;
  `npm run check:changeset`.
- Report test results as counts; never "likely"/"probably"; nothing is "pre-existing".
- Coding standards are binding (D-035, `reference/coding-standards.md`, read in full first): §6's shared notes list the
  rules the code blocks follow; every guard gets a recorded mutation check; the PR description carries release notes,
  remediation paths and the "run by AI" disclosure.

### 2.8 Reading order

1. §1, §11 (newest entry), §12.
2. §3.1, §4, §5.1–§5.3 (the suite's shape), then the milestone you are on.
3. Before C1–C6: §5.8 (the containment probe seam the gate bodies read), then §6 "Containment milestones C1–C6
   (shared notes)" and its runtime block RV-0.

## 3. Context

### 3.1 The problem in plain words

Predictive Studio's model-fitting core is sound, but everything around it — which rows it learns from, how models are
graded and trusted, how they are published and served — was found wrong in September 2026, and nothing in MJ can tell
a correct PS from a broken one. The assessment proved this on planted-truth data: worlds and scenarios generated with
known true probabilities, so PS's output can be compared with the truth. That machinery exists only in the local
`ps-review` workspace, hard-wired to one database (`MJ_6_2_PSREVIEW_arie`), one Docker container (`sql-claude`), one
port (`localhost,1444`, MJAPI `:4031`) and absolute `/Users/arieglazier/...` paths; its world loader truncates the whole
test schema, so only one world can be loaded at a time; D2 and the 400-seed variants were never generated; the MJ
sidecar venv lacks scipy, statsmodels and pyarrow, which the judges and the reference pipeline import; and the
sidecar's own install fails on the default Python of a current Mac.

PR 2 brings that machinery into MJ as a permanent, CI-run suite (milestones M1–M6), with all 111 acceptance gates as
named tests so later PRs flip tests instead of writing them, and contains the dangerous behaviours (C1–C6) so the ten
Phase-0 gates it owns pass. Models keep reaching Published without a human, as on `next`: program D-029 makes reliable
automatic publishing the goal and D-030 leaves today's automated path unchanged until PR 4 gates it, so PR 2 does not
touch auto-train or the agent's publish step, and G0.2/G0.3 (agent runs reaching Published) are PR 4's.

### 3.2 Findings closed

Infrastructure findings are closed by M1–M6 and M-final; behavioural findings and the guide sentences they change by
C1–C6 (§6). The "Closed in" column names the task whose text carries the finding; §4.1's gate table and §10 use the
same mapping. Evidence numbers are from `reference/findings.json` and the assessment.

| ID | Sev | Defect (evidence) | Fix | Test | Closed in |
|---|---|---|---|---|---|
| F-ENV-1 | S2 | Per-package `tsc` build of the PS Engine fails on a fresh clone: 19 × `TS2307 Cannot find module @memberjunction/core…`, exit 2; only a dependency-inclusive turbo build succeeds (72/72 tasks, 35.6 s). | Documented build order: `npx turbo run build --filter=<pkg>...`; package READMEs and guide §2.2 state it. | M1.5 fresh-worktree build log | M1.5 |
| F-ENV-2 | S2 | `npm run setup:python` uses whatever `python3` is (3.14.4): `numpy==1.26.4` does not install, scikit-learn source build fails. | `setup-python.mjs` probes `python3.11`, `python3.12`, `python3`, `python`; accepts only 3.11/3.12; prints what it probed and how to fix; `--python` override. | M1.1 unit tests + M1.4 runtime | M1.1, M1.4 |
| F-ENV-3 | S2 | `PREDICTIVE_STUDIO_PYTHON` is documented but read nowhere (0 matches); the integration test hard-codes `Sidecar/.venv/bin/python`. | `MLSidecar`, `run-pytest.mjs` and the Engine integration test honour `PREDICTIVE_STUDIO_PYTHON`. | M1.2 unit test + runtime | M1.2 |
| F-ENV-9 | S3 | `Sidecar/.venv` is not git-ignored when it is a symlink (`.venv/` matches directories only). | `.gitignore`: `.venv` (file, symlink or directory). | M1.3 `git check-ignore` | M1.3 |
| F-ENV-12 | S3 | CodeGen's first run after `spCreateVirtualEntity` without `additionalSchemaInfo` inserts the view's fields twice: `UQ_EntityField_EntityID_Name` violation, exit 1; the second run passes (the metadata refresh at `manage-metadata.ts:4599` runs only when `additionalSchemaInfo` is set). | Landed upstream on `next` (`1580f34250`, `1333ab87e4`: `applyVirtualEntitySoftKeys` refreshes `md.Refresh()` at start); M1.6 verifies with read-only unit + runtime checks (`D2-43`). | M1.6 verification | M1.6 |
| F-ENV-7 | S2 | Host CodeGen after a BizApps install left `vwPeople` stale (`more column names specified than columns defined`) and dropped `spCreate/UpdatePerson`/`Organization` without recreating them; exit 1. | Landed upstream on `next` (`8b92a99d0e`, `c31d487cb5`, `d4e30c3800`: dependency-ordered layered view refresh in `sql.ts`); M1.8 verifies with read-only unit + runtime checks (`D2-43`). | M1.8 verification | M1.8 |
| F-L2-1 | S3 | `mj sync push` crashes in validation for an entity folder whose `.mj-sync.json` omits `filePattern` (`ValidationService.ts:188` → `pattern.replace` on `undefined` at `:1161`). | Landed upstream on `next` (`a0db1fbac7`: `DEFAULT_RECORD_FILE_PATTERN` / `pattern || '*.json'` in `ValidationService.ts` and `PushService.ts`); M1.7 verifies with read-only unit + runtime checks (`D2-43`), and Loom's emitter writes `filePattern` explicitly (M3.2). | M1.7 verification (+ M3.2 emitter) | M1.7 (+ M3.2 emitter) |
| F-L2-2 | S3 | Loom `Person` records carry no `WorldID`/`Seed`, which the review's `pstest.Person` DDL requires; an unmodified world could not be pushed. | The ported world generator writes `people.csv` with `WorldID` and `Seed`; the loader reads it (no metadata push, no review scaffolding). | M3.4, M4.4 | M3.4, M4.4 |
| F-LOOM-1 | S2 | Latent dials θ/φ are always 0 for non-heroes (`cli/src/commands/build.ts:652`; `RegisterDial` called only from tests; 34,993 latent states, 0 nonzero). | Loom companion: `loom build` registers the project's declared dials and initialises non-hero dials from the declared distribution. | M3.2 Loom test | M3.2 |
| F-LOOM-2 | S2 | `loom validate` checks pooled rates and direction only, never the planted β (`validator.ts:1135-1204`, `:1338+`); a motif override 0.35 → 0 passes 12/12 gates. | Loom companion: a coefficient-recovery gate (logistic refit with cycle fixed effects; each planted β inside its 95% CI). | M3.2 Loom test | M3.2 |
| F-LOOM-3 | S2 | Aggregation arrows are O(N²) (999 → 8.58 s, 1,998 → 33.07 s) and `getChildren` has no temporal scope (`RetrospectiveUnroller.ts:294-320`). | Loom companion: per-cycle FK index; only children with `birthCycle <= cycle`. | M3.1 Loom test | M3.1 |
| F-LOOM-4 | S2 | Motif `fixedFields` never reach the output (state copied at `RetrospectiveUnroller.ts:132` before `SamplePopulation` mutates candidates, `MotifSampler.ts:129-136`); 0 of ≈100 expected rows. | Loom companion: write assigned motifs' `fixedFields` into the unroller state after sampling. | M3.1 Loom test | M3.1 |
| F-LOOM-6 | S2 | Undeclared fields get index-derived defaults (`generation.ts:160,201,203`): `i*10`, always `true`, 333/333/333 round-robin. | Loom companion: build error naming every such field, unless the field declares `allowIndexDefault: true`. | M3.2 Loom test | M3.2 |
| F-DOC-25 | S3 | Guide's one-time setup builds PS packages one by one; on a fresh clone the Engine build fails. | Guide §2.2 states the turbo build and the Python requirement. | M1.5 | M1.5 |
| F-DOC-2 | S3 | Guide counts 6 Remote Operations and 4 Actions; the install has 7 (`CreateScoringProcess`) and 5 (`Schedule Model Scoring`). | Guide §§0, 10.1, 10.2 corrected from the metadata counts. | M-final.4 | M-final.4 |
| F-DOC-3, F-DOC-5 | S1 | Guide: the locked holdout is a leading slice never seen by the search, scored once; `HoldoutMetrics` is "the honest number" — it is the trailing PK slice and the agent selects on it. | B15: restate (trailing slice; the agent selects on it, so its number is optimistic until PR 3). | M-final.4 quote check | M-final.4 |
| F-DOC-11 | S1 | `llm-derived` docstrings say the feature is persisted and version-pinned; the model reads today's live column. | B15: restate (no pin until PR 5). | M-final.4 quote check | M-final.4 |
| F-DOC-17 | S1 | Guide lists a "cv-score" leaderboard column; it is the holdout score × 0.98. | B15: state what ships. | M-final.4 quote check | M-final.4 |
| F-DOC-18 | S1 | Guide: a build is forced only after approval with a no-loop guard; "don't build it yet" forces one and the guard re-forces a second. | B15: state the shipped forced-build behaviour (PR 5 fixes it). | M-final.4 quote check | M-final.4 |
| F-DOC-19 | S0 | Guide: a coin-flip model is never auto-published; the agent published two models whose holdout AUC interval contains 0.5. | §6.x and §12.4 state `next`'s behaviour (D-030): the builder's bar is the point-estimate trust grade, so a model whose interval contains 0.5 can be published; auto-train publishes without reading the trust verdict. M-final.4 sweeps any other occurrence. | C2.1 grep + M-final.4 quote check | C2.1 (+ M-final.4) |
| F-DOC-21 | S0 | Guide: nothing leaky is promoted silently; realistic and planted leaks pass the guard and are promoted or published. | B15: the leakage guard is a single-feature dominance check that misses restated and one-hot leaks; a model it does not flag can be published by the agent or auto-train with no sign-off (D-030; PR 3's leakage audit and PR 4's gated publish fix it). | M-final.4 quote check | M-final.4 |
| F-DOC-23 | S1 | Guide: dry runs (incl. `ScoreRecordSet` `dryRun`) compute without mutating; both wrote. | §6.3 "Who may score / Dry runs" (C3); the Feature Pipeline half is PR 1's. | C3.3 grep + M-final.4 quote check | C3.3 |
| F-DOC-4 | S1 | Guide: point-in-time assembly "never leaking the future"; the as-of setting changes nothing. | §4.3 states the refusal (C5.1). | C5.7 + M-final.4 quote check | C5.7 |
| F-DOC-35 | S1 | Guide: validation "with overfitting detection"; k-fold/holdout report in-sample metrics. | §5.1 first sentence states out-of-sample validation and no overfitting detection. | C5.7 + M-final.4 quote check | C5.7 |
| F-DOC-36 | S3 | Guide: the Experiment Designer queries the algorithm ranking matrix; no agent can read it. | Remove the Designer from that sentence. | M-final.4 quote check | M-final.4 |
| F-L3-1 (+ F-MC-7, merged into it) | S0 | Default training silently used at most 1,000 rows (800 + 200; W1 s42 read 1,000 of 16,776; MoreCheese dropped 6,714 and 3,276 rows). #5295 lifted the training-read cap on `next`. | An explicit cap smaller than the match now fails naming it (C1.1); the default path is re-verified by gate `W1 → S7.5` (training half). | C1.1 unit; G0.1 | C1.1, C1.4 |
| F-L3-2 | S1 | Filter-scope `ScoreRecordSet` silently scores 1,000 rows and reports success. | Filter/list/view scopes read every row; a truncating explicit `maxRows` is refused. | C1.2 unit; G0.1 | C1.2, C1.4 |
| F-SCO-1 | S1 | Draft and Archived models score and write back. | Refused in `Preflight` before the first record. | C3.1 unit; G0.7 | C3.1, C3.4 |
| F-SCO-2 | S1 | `ScoreRecordSet` ignores `dryRun`. | The operation forwards `dryRun`. | C3.2 unit; G0.7 | C3.2, C3.4 |
| F-UI-3 | S0 | Per-member driver badges inverted ("Increases Risk" on 488 of 488 AutoRenew rows). | Badge follows the displayed risk. | C4.2 unit + DOM; G0.4 | C4.2, C4.5 |
| F-UI-4 | S0 | At-Risk list built from the members most likely to renew (mean TrueP 0.9675). | The resource uses the grid's polarity; the list takes the highest-risk rows. | C4.2 unit; G0.5 | C4.2, C4.5 |
| F-UI-1 | S2 | Causal "what drives the outcome" copy. | Associative wording; one causal-phrase list; scan tests. | C4.4 unit + scan; G0.6 | C4.4, C4.5 |
| F-SC-1 | S1 | `kfold`/`holdout` report in-sample metrics (AUC 1.000 on noise; K ignored). | Out-of-fold / out-of-sample validation; < 4 rows refused. | C5.2 pytest; G0.9 | C5.2, C5.8 |
| F-TR-3 | S1 | In-sample `Metrics` accepted as full evidence when `HoldoutMetrics` is absent (ships with F-SC-1). | Validation metrics count only when the evaluation record says out-of-sample. | C5.5 unit | C5.4, C5.5 |
| F-EXP-1 | S2 | "Start Experiment Session" trains nothing, reports success. | Refused before any row; UI entry hidden; agent link revoked. | C6.1–C6.3 tests | C6.1–C6.3 |
| F-DOC-7 | S3 | Guide: experiment waves run through Record Set Processing, one Process Run per wave. | §7.1 states the in-process pool, no Process Run. | C6.5 quote check | C6.5 |
| F-DOC-8 | S3 | Guide: a paused session is "clean, resumable". | §7.1 diagram: a status label; resume relabels only. | C6.5 quote check | C6.5 |

**Transferred** (program decisions D-022, D-023; not owned here): F-ENV-5 (bizapps-common tag `DisplayName`) → PR 1's
bizapps-common companion; F-LOOM-5 (MoreCheese `checkpoint.json`) → PR 6's more-cheese companion.

**Contained in PR 2** (owned by a later PR; PR 2 must not make them worse and corrects interim guide text where a C
milestone says so; each appears in the findings table of the C milestone that contains it — C1: F-PIT-4; C2: F-DOC-6,
F-DOC-37 (guide text only); C4: F-SC-11, F-SC-9b, F-UI-2; C5: F-PIT-3, F-TR-1, F-TR-2, F-TR-4, F-SCN-1; C6: F-EXP-2,
F-EXP-3, F-EXP-4, F-MNT-1, F-DOC-1, F-DOC-9, F-DOC-12, F-DOC-22). 19 findings in all.

**No longer contained in PR 2** (program D-029, D-030): F-TR-9 (owner PR 4), F-L4-1 (+ F-SC-9), F-LK-1 and F-SEL-2
(owner PR 3). Their containment was the assessment's B6 (remove automatic publishing), which D-029 reverses; PR 2 leaves
the automated publish path unchanged and PR 3/PR 4 fix them (C2 "Not contained", §9 R-g).

### 3.3 Target-design excerpt (copied)

**R-TEST — the planted-truth suite** (`evidence/18-recommendations.md:1774-1830`). Location proposed by the assessment:
`Engine/src/__tests__/integration/truth-suite/` (this plan decides otherwise, §9 D2-01). Harness: the review's
`probe-truth-harness.ts`, moved in and strictly typed. Judges in Python. Fixtures: world specs, domain and generators
checked in; data generated at test time from Loom pinned at a commit with fixed seeds (≈ 0.3 s per 5,000-person
world), cached by spec hash; checked-in CSVs only as a fallback. Loading by bulk copy into a scratch database; scoring
only through `ScoreRecordSet`. Runtime estimate (not measured as a suite): nightly ≈ 37–40 min without W8; a PR-gate
subset ≈ 6 min (T0, T3 both orders, T5, T7 s42–s44, T10, T14, T16); W8 weekly; re-measure when repeated CV lands.

**The statistical rules** (verbatim from P11; implemented once in M2.4):
- *Noise-publish* (N1c, N1r, W2 → S6.5): 400 seeds, pass if the lower end of the two-sided 95% Wilson interval
  (z = 1.959963984540054) on the publish rate is ≤ 0.05 — accepts ≤ 28 of 400; P(pass) 0.969 at a true 5% rate,
  0.023 at 10%. A publication is a seed whose gate decision is outcome `model`.
- *False alarm* (T4 → S8.3): the same rule on 400 no-drift replays: ≤ 28 alarms.
- *Coverage* (T2p → S-T.5, C2 → S6.2 #2): pass if the Wilson interval on observed coverage contains 0.95 — accepts
  372–388 of 400; P(pass) 0.950 at 95%, 0.550 at 93%, 0.023 at 90%.
- *Detection* (D2 → S8.3): flagged within 1 period of the shift in ≥ 372 of 400 seeds (upper Wilson bound ≥ 0.95);
  P(pass) 0.969 at 95%, 0.023 at 90%; plus mean FDP ≤ 0.05.
- *Noise-publish at n = 60* (G0.2 as amended by program D-032, `statRule: noise-publish-60`): the same Wilson rule on
  the 60 agent runs' publications — accepts ≤ 6 of 60; P(pass) 0.970 at a true 5% publish rate, 0.031 at 20%.
- *T2 60-seed* (W2 s100–s159, agent): ≤ 4 of 60 published and ≥ 56 of 60 `no-signal`; a correct gate passes with
  P = 0.9834. *T13*: mean (winner's reported holdout AUC − fresh AUC) < +0.0104.

**R-TEST rows the Phase-0 gates restate** (T0 W1 s42 row counts; T10 driver polarity and At-Risk list; T14
Draft/Archived/dry-run scoring; T4 column-mode as-of; T12 k-fold/holdout on W2 s100), copied with their gates in §4.1.
T15(a) (agent runs reaching Published) is restated by G0.2/G0.3, which program D-029 amends ("… reach Published with
automated publishing on") and D-030 moves to PR 4.

### 3.4 What exists on `next` (`c92d4a47f9`)

- `packages/AI/PredictiveStudio/{Core,Engine,Sidecar}`: one live integration test,
  `Engine/src/__tests__/integration/live-train-score.integration.test.ts` (420 synthetic rows, no DB, gated by
  `PS_INTEGRATION=1`, run by `vitest.integration.config.ts`).
- The MJ integration tier: `@memberjunction/testing-integration` (framework: `BootstrapIntegrationServer`,
  `BootstrapIntegrationClient`, `TestRunner`, tiers), `@memberjunction/integration-test-suite` (private content, 83
  bundles incl. IT14 "Predictive Studio Stack Seams" = bundle `predictive-studio`, PS1–PS5, no sidecar) and ten
  standalone `rigs/ps-*.ts` flows gated by `PS_INTEGRATION=1`. CI: `.github/workflows/integration.yml` (GitHub-hosted
  `ubuntu-latest`, SQL Server 2022 in Docker, MJAPI booted, PR + nightly + weekly lanes); `PS_INTEGRATION` is never set.
- #5295 (merged 2026-10-09): the training read's 1,000-row cap is lifted (`data-access.ts:120-123`), `Preflight`,
  needs-training readiness, opt-in auto-train (`scoring/auto-train.ts`: trains and publishes Draft → Validated →
  Published with `signOff: false`; PR 2 leaves it as it is, program D-030), the promote gate's artifact check.
- `mj migrate --schema <s> --dir <d>` applies an Open-App-style migration folder to a non-core schema and runs the
  metadata heal for it (`MJCLI/src/commands/migrate/index.ts:31-32`, `:281-316`).
- Nothing of the truth suite: no generators, no worlds, no judges, no reference pipeline, no gate tests.

## 4. Acceptance

### 4.1 Gates owned (Phase 0)

PR 2 owns ten gates (`reference/gates.json` `ownerPR: 2`). Thresholds verbatim from `reference/gates.json`. "Lane" is
the CI run mode the gate runs in (§5.3). Every gate's body is written in M5.9 (UI halves in M5.10); the containment
milestone named makes it pass; M-final flips it to `required`.

| Gate | Threshold (verbatim) | Dataset | Test name | Body | Made green by | Lane |
|---|---|---|---|---|---|---|
| G0.1 | on W1-signal s42 with the UI default, training reads 16,776 of 16,776 labelled rows (TrainingRowCount + holdout = 16,776, T0) or ends Failed naming the cap; a filter-scope `ScoreRecordSet` scores 16,776 of 16,776 or ends Failed (800 + 200 and 1,000 today) | W1 s42 | `W1 → S7.5` | M5.9 | C1 | pr |
| G0.4 | 488 of 488 AutoRenew top-driver rows on W1-signal s42 render "Lowers Risk" (T10; 0 of 488 today) | W1 s42 | `W1 → S9.4` | M5.10 | C4 | pr |
| G0.5 | the At-Risk list built from W1-signal s42 scores has mean TrueP below the population mean (T10; 0.967 and overlap 0 with the true top-N today) | W1 s42 | `W1 → S9.5` | M5.10 | C4 | pr |
| G0.6 | a scan of the PS UI strings and the story prompt finds 0 "lever" or causal phrases, and 10 of 10 generated W1-signal s42 stories contain none | W1 s42 | `W1 → S9.3` | M5.9 | C4 | weekly (live-model) |
| G0.7 | `ScoreRecordSet` with write-back on a Draft and on an Archived W1-signal s42 model writes 0 rows and returns an error, 2 of 2; with `dryRun` it writes 0 rows (T14) | W1 s42 | `W1 → S7.3` | M5.9 | C3 | pr |
| G0.8 | a pipeline whose as-of setting has no effect (`Mode:'column'`, or the Train operation's `asOf` input) is refused before training, 2 of 2 variants (T4 column-mode variant; both train today) | W4 s42 | `W4 → S2.1` | M5.9 | C5 | pr |
| G0.9 | on W2-noise s100, `kfold` and `holdout` report a validation AUC whose 95% interval contains 0.5, or the strategy is refused, 2 of 2 (T12; AUC 1.000 on the sidecar's noise probe today) | W2 s100 | `W2 → S5.3` | M5.9 | C5 | pr |
| G0.10 | two single-threaded trainings of logistic regression, xgboost and lightgbm on W1-signal s42 give predictions equal within 1e-9, 3 of 3 (determinism half met today; the suite keeps it met; the logging half is gated in Phase 2) | W1 s42 | `W1 → S5.4` | M5.9 | (kept by C5) | pr |
| G0.11 | with `MonthIndex` declared as the time index, 0 of 12 origins' lightgbm runs on T4 show a grade above Poor or `canAct` true, and each stores the withheld verdict with its reason ("not evaluated as a forecast"), 12 of 12 — the containment form of S-T.2, filed under S6.5's "withheld outcome stored with its reason" (Excellent 5 and Good 7 of 12, `canAct` true, today; `P6-scenarios.md:138`) | T4 (series table) | `T4 → S6.5` | M5.9 | C5 | pr |
| G0.12 | on W7-small-imbalanced s42–s44, 0 of 3 models whose holdout accuracy is at or below the always-majority rate are graded above Poor or have `canAct` true (s42: "Right 9 of 10" at 0.905 against an always-lapse 0.921 today, `L4-truth.md:224`) | W7 s42–s44 | `W7 → S4.2` | M5.9 | C5 | pr |

**Gate → milestone map.** Every body exists before any containment work starts (M5.9 and M5.10: twelve `TruthGate.Define` bodies in
`gates/containment.gates.test.ts` — PR 2's ten including G0.4/G0.5, which import `AtRiskRules` from `@memberjunction/predictive-studio-core` per §9 D2-44, plus PR 4's G0.2/G0.3 — all with registry `Implementation.Kind: "body"`). The "made
to pass in" task is the one whose runtime step shows `xpass`; M-final.1 flips PR 2's ten to `required` in one registry
edit.

| Gate | Test name | Body | Made to pass in | Flipped in |
|---|---|---|---|---|
| G0.1 | `W1 → S7.5` | M5.9 | C1 (C1.1–C1.2; `xpass` at C1.4) | M-final.1 |
| G0.4 | `W1 → S9.4` | M5.10 (`containment.gates.test.ts`) | C4 (C4.2; `xpass` at C4.5) | M-final.1 |
| G0.5 | `W1 → S9.5` | M5.10 (`containment.gates.test.ts`) | C4 (C4.2; `xpass` at C4.5) | M-final.1 |
| G0.6 | `W1 → S9.3` | M5.9 (story generator M5.6) | C4 (C4.1, C4.3, C4.4; `xpass` at C4.5, weekly lane with live-model keys) | M-final.1 |
| G0.7 | `W1 → S7.3` | M5.9 | C3 (C3.1–C3.2; `xpass` at C3.4) | M-final.1 |
| G0.8 | `W4 → S2.1` | M5.9 | C5 (C5.1; `xpass` at C5.8) | M-final.1 |
| G0.9 | `W2 → S5.3` | M5.9 | C5 (C5.2; `xpass` at C5.8) | M-final.1 |
| G0.10 | `W1 → S5.4` | M5.9 | already met on `next` (`xpass` in the M6.3 baseline); kept by C5.3 and re-checked at C5.8 | M-final.1 |
| G0.11 | `T4 → S6.5` | M5.9 | C5 (C5.4–C5.6; `xpass` at C5.8) | M-final.1 |
| G0.12 | `W7 → S4.2` | M5.9 | C5 (C5.2, C5.5; `xpass` at C5.8) | M-final.1 |

**G0.2 and G0.3 — moved to PR 4 (program D-030).** Their registry entries carry `OwnerPR: 4` and the threshold as
amended by D-029 (G0.2 again by D-032, `StatRule: noise-publish-60`); the test names are unchanged (`W2 → C1.1`, `W3 → C1.1`) and `gates.json` keeps the P11 text in
`P11Threshold`:

| Gate | Threshold (verbatim, as amended: G0.2 D-029/D-030/D-032, G0.3 D-029/D-030) | Dataset | Test name | Body | Status in PR 2 | Lane |
|---|---|---|---|---|---|---|
| G0.2 | with automated publishing on, every agent run on W2-noise s100–s159 that reaches Published has a stored gate outcome `model` that ReverifyPublish re-derives, 60 of 60 runs consistent, and the runs reaching Published number ≤ 6 of 60 (lower end of the two-sided 95% Wilson interval ≤ 0.05 at n = 60; P(pass) 0.970 at a 5% true publish rate, 0.031 at 20%); the noise-publish rate itself is G2.3's 400-seed gate (T15(a) applied to T2's seeds) | W2 s100–s159 | `W2 → C1.1` | M5.9 | `expected-fail` (PR 4 flips) | nightly |
| G0.3 | 0 of 2 agent runs on W3-leak-row s42 (both plan orders) reach Published with automated publishing on (T15(a); 1 of 2 today, lr-first order) | W3 s42 | `W3 → C1.1` | M5.9 | `expected-fail` (PR 4 flips) | pr |

PR 2 writes their bodies in M5.9 because it builds the agent-run harness (M5.6) and the registry: each body runs the
Pipeline Builder with automated publishing on (`autoPublish` at its default `true`) and counts runs whose models reach
`Published`, whoever or whatever promoted them (`ReachedPublishedUnattended`, §5.8). G0.3 passes at 0 of 2. G0.2 has
two halves: the count of runs reaching Published is ≤ 6 of 60 (`SeedRule.Passes('noise-publish-60', …)`, M2.4), and every
such run's Published model has a stored gate outcome `model` that `ReverifyPublish` re-derives
(`ReadStoredGateDecision`, `ReverifiesStoredDecision`, §5.8). No gate decision is stored and no `ReverifyPublish` exists
until PR 3 (stored outcome, D-026) and PR 4 (`ReverifyPublish`), so in PR 2 those two probe functions answer
`null`/`false` and any run that reaches Published is inconsistent; PR 4 replaces their bodies. No PR 2 task makes the
gates pass: PR 2 leaves the automated publish path unchanged (D-030), so they report `xfail` (or `xpass` when no run
happens to publish) in every PR 2 run, never `fail`. PR 4 makes them pass with gated automatic publishing and flips them
to `required`.

**G0.12 runs on the default majority-baseline rule.** C5 makes the rule a per-pipeline setting
(`ValidationStrategy.MajorityBaselineRule`, `enforce` | `warn`, default `enforce`; §9 D2-C5d). G0.12's pipelines are
built by the Pipeline Builder, whose plan-to-pipeline mapping never sets the field, so they run on `enforce` — C5.8
Step 3 checks every G0.12 model's `Lineage.evaluation.MajorityBaselineRule` is `enforce`. No gate sets `warn`.

### 4.2 The registry covers all 111 gates

`packages/AI/PredictiveStudio/TruthSuite/gates/gates.json` holds all 111 gates of `reference/gates.json` (Phase 0: 12,
1: 12, 2: 41, 3: 11, 4: 9, 5: 6, 6: 12, 7: 8; owners PR 1: 5, PR 2: 10, PR 3: 53, PR 4: 31, PR 5: 12 — G0.2/G0.3 are
PR 4's, program D-030), each a named test `<dataset> → <criterion>` (U+2192, single spaces; repeats get ` #2`, ` #3` in
P11 order), `Status` `expected-fail` and tagged `OwnerPR`. The registry unit test (M2.3) fails if the count, any name, any
owner or the naming rule drifts. PR 2's 10 become `required` in M-final.1; PR 1's 4 shipped `mj test` rows (`G7.1`, `G7.2`, `G7.3`, `G7.5`) are reconciled in M-final.5 as `body` bridges and flipped to `required` (D-009, D-025, §9 D2-45; `G7.8` / `C1 → C3.3` was extracted out of PR 1 in PR 1 §13 into `extracted/04-record-process-strict-parameters.md` and stays `Kind: "stub"`, `Status: "expected-fail"` until that follow-up lands).

### 4.3 Keep-list (must stay green)

- Unit suites: `packages/AI/PredictiveStudio/{Core,Engine,Sidecar}` (`pnpm test`), Sidecar Python (`pnpm
  --filter @memberjunction/predictive-studio-sidecar run test:python`), `packages/CodeGenLib`, `packages/MetadataSync`,
  `packages/Angular/Explorer/dashboards` (node project), `packages/TestingFramework/integration-test-suite`.
- The live Engine integration test (`pnpm --filter @memberjunction/predictive-studio run test:integration`: 3 passed).
- The deterministic integration tier (`MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test suite "Integration
  Tests — Deterministic"`), including IT14.
- G0.10's determinism (met today; it must stay met through C5).
- `#5295`'s promote-gate artifact check and scoring `Preflight` (PR 4 builds its gated publish on them, program D-029).
- Today's automated publish path (program D-030): `Engine/src/scoring/auto-train.ts` and the Pipeline Builder's
  publish step (`agent/pipeline-builder.ts` `maybePublish`) are not changed by any PR 2 task; their existing tests
  (`scoring/__tests__/model-readiness.test.ts`, `agent/__tests__/pipeline-builder.test.ts`) pass unmodified.

### 4.4 Out of scope

- Implementing the bodies of the 99 gates owned by PRs 1, 3, 4, 5 (each owner PR replaces its stub, §5.2).
- Monitor procedure M, the gate-contract parity check (`check_gate_parity.sh`, PR 4 per program R3), W10-regression
  (T17 stays a unit test until a gate needs W10; no gate does), MoreCheese companions (PR 6), the bizapps-common tag
  fix (PR 1, proposed), the P6 per-scenario PS runner `probe-scenario-runner.ts` (PR 3 ports it when its scenario gates
  need it; M5 ports only the parts the Phase-0 T4 gate needs).
- The `mj test` catalog: the truth suite is a separate runner (§9 D2-01); IT14 stays as is.

## 5. Design

### 5.1 The package

New private workspace package (inside the existing `packages/AI/PredictiveStudio/*` workspace glob, so no workspace
edit is needed). Only `src/` is compiled; nothing is published (`"private": true`, so the new-package npm gate skips
it).

```
packages/AI/PredictiveStudio/TruthSuite/
  package.json                    @memberjunction/predictive-studio-truth-suite, private, type module, BUSL-1.1
  tsconfig.json                   extends ../../../../tsconfig.server.json; include src/**; excludes tests
  vitest.config.ts                unit tests (src/**/__tests__/**, generators/__tests__/**) — no DB, no sidecar
  vitest.gates.config.ts          gate runs (gates/**/*.gates.test.ts) — serial, single fork, long timeouts
  vitest.regeneration.config.ts   generators/__tests__/** — needs the pinned Loom built (M3)
  .gitignore                      .venv  .loom/  .data/  .run/  results/
  README.md
  gates/
    gates.json                    the 111-gate registry (§5.2)
    containment.gates.test.ts     the 12 containment (Phase 0) gate bodies (M5.9); files are named by subject — the
                                  registry finds a gate by its declared title, not by file (program D-043)
    registry-stubs.gates.test.ts  one named test per gate whose Implementation.Kind is "stub" (99 at merge)
  fixtures/
    worlds/W1-signal.json … W9-multiclass.json, worlds-domain/domain.json
    scenarios/specs/{C2,C4,D1c,D1r,D2,N1c,N1r,R1,R2p,R3,T1p,T2p,T3,T4}.json
    golden-hashes.json            sha256 of every review-generated rows.csv/truth.csv (§M3.6)
    real/person_years.parquet, real/person_years_leaky.parquet, real/R2-real.rows.csv, real/T1-real.rows.csv (+ manifests)
    reference/p5-golden.json      the reference pipeline's 20 committed results (M5.3)
    loom.json                     { "repo": "https://github.com/MemberJunction/loom", "sha": "<pinned>" }
  generators/
    loom.mjs                      resolves the pinned Loom engine (§5.4)
    make_world.mjs, make_world_multiclass.mjs, make_scenario.mjs, gen_lib.mjs, calibrate_intercept.mjs
    derive_t3_lag.mjs
    __tests__/regeneration.test.ts
  migrations/V202610130001__pstruth_tables.sql      test schema DDL + appended CodeGen output (M4)
  codegen/truth-codegen.config.cjs                  scoped CodeGen config (copied to .run/codegen/mj.config.cjs at use)
  scripts/
    import-gates.mjs  fetch-loom.mjs  gen-pstruth-ddl.mjs  provision.mjs  setup-python.mjs  run-pytest.mjs
    run-truth.mjs     report.mjs
  src/
    registry/{types.ts, load.ts, validate.ts}
    stats/{wilson.ts, binomial.ts, seed-rules.ts}
    gates/{define-gate.ts, results.ts}
    data/{catalog.ts, cache.ts, seeds.ts, cli.ts}
    db/{connection.ts, bulk-load.ts, world-loader.ts, scenario-loader.ts, stamp.ts}
    harness/{connect.ts, entities.ts, pipelines.ts, train.ts, agent.ts, agent-step.ts, score.ts, judge-bridge.ts,
             sidecar-runner.ts, containment-probe.ts, run-fixtures.ts, types.ts, w-world.ts}
    readme/steps.ts
    index.ts
  python/
    requirements.txt  pytest.ini  mypy.ini
    truthsuite/{__init__.py, paths.py}
    truthsuite/refpipe/{run.py, models.py, scoring.py, splits.py, audit.py, baselines.py, summary.py, verdict_diff.py}
    truthsuite/scenarios/manifest.py
    truthsuite/judges/{judge.py, judge_multiclass.py, verdicts.py, delong.py, holdout_rebuild.py, cli.py}
    truthsuite/stats/{noise_publish.py, coverage.py, monitor_m.py}
    tests/{test_run.py, test_scoring.py, test_splits.py, test_manifest.py, test_judges.py, test_reference_reproduction.py}
```

### 5.2 The gate registry and how a gate reports

**Registry entry** (`gates/gates.json`, one array; fields 1–13 copied from `reference/gates.json` and renamed to
PascalCase by the import, 14–17 added). Every member is PascalCase: the registry is a new shape that mirrors no shipped
camelCase shape (program D-039, ruling SR-2; `reference/gates.json` is a planning file, not shipped code):

```ts
// src/registry/types.ts
export type GateStatus = 'expected-fail' | 'required';
export type RunMode = 'pr' | 'nightly' | 'weekly';
export type GateRequirement = 'live-model' | 'sidecar-16gb' | 'bizapps-common'; // bizapps-common: the bridged Feature Pipeline gates
export type StatRule = 'noise-publish-400' | 'coverage-400' | 'detection-400' | 'false-alarm-400'
  | 'noise-publish-60'; // G0.2's publication count at n = 60

export type GateImplementation =
  | { Kind: 'stub' }                                      // registry-stubs.gates.test.ts defines it; outcome not-implemented
  | { Kind: 'body' }                                      // exactly one TruthGate.Define('<TestName>', …) in gates/*.gates.test.ts
                                                          //   (also the form of a bridge that runs an `mj test` row)
  | { Kind: 'external'; Package: string; File: string }; // a test titled exactly <TestName> in another package's file

export interface GateEntry {
  GateID: string;             // "G0.1"
  Phase: number;              // 0–7
  OwnerPR: 1 | 2 | 3 | 4 | 5;
  Dataset: string;            // "W1", "C2", "T4", …
  Criterion: string;          // "S7.5"
  Threshold: string;          // verbatim P11
  Plain: string;
  Today: string | null;
  RTest: string | null;
  TestName: string;           // "W1 → S7.5"
  StatRule: StatRule | null;
  AmendedBy: string | null;   // decisions that amended the threshold, e.g. "D-029, D-030, D-032" (G0.2)
  P11Threshold: string | null;// the P11 threshold text when AmendedBy is set; null otherwise
  Status: GateStatus;         // added: every gate starts expected-fail
  RunMode: RunMode;           // added
  Requires: GateRequirement[];// added
  Implementation: GateImplementation; // added
}
```

**Outcomes** (`src/gates/results.ts`), one JSON file per gate per run at `$TRUTH_RESULTS_DIR/gates/<GateID>.json`:

```ts
export type GateOutcome =
  | 'pass'             // required gate, threshold met
  | 'fail'             // required gate, threshold not met              → vitest test fails
  | 'xfail'            // expected-fail gate, threshold not met (normal before its owner PR lands)
  | 'xpass'            // expected-fail gate, threshold met            → reported; flip it to required
  | 'not-implemented'  // stub body (owner PR has not written it)
  | 'not-run'          // not selected in this run mode, or a requirement (live model keys) absent — reason given
  | 'error';           // the harness threw (data, DB, MJAPI, sidecar)    → vitest test fails, whatever the status

export interface GateMeasurement {
  /** True when the gate's threshold is met. */
  Passed: boolean;
  /** The measured numbers the threshold talks about, e.g. { trainingRows: 13421, holdoutRows: 3355, scored: 1000 }. */
  Measured: Record<string, number | string | boolean | null>;
  /** One sentence: what was measured against what. */
  Detail: string;
}

export interface GateResult {
  GateID: string; TestName: string; OwnerPR: GateEntry['OwnerPR']; Status: GateStatus; RunMode: RunMode;
  Outcome: GateOutcome; Measured: GateMeasurement['Measured']; Detail: string;
  Threshold: string; DurationMs: number; Error: string | null; RunID: string; MJCommit: string;
}
```

A gate body is `async (h: TruthHarness) => GateMeasurement`: it returns whether the threshold is met and never throws
for a product shortfall; it throws only when the harness itself cannot measure (that is `error`, which always fails
the run so the harness cannot rot silently). `TruthGate.Define(testName, body)` (M2.5) looks the gate up in the
registry, registers a vitest `it(testName, …)`, decides `not-run` from the run mode and requirements, runs the body,
maps `Passed` × `Status` to the outcome and writes the result file. Only `fail` and `error` fail the vitest test.

**Requirements** gate a test to the hosts that can run it; a missing one makes the outcome `not-run` with the reason:
`live-model` needs `TRUTH_LIVE_MODEL=1` (model keys configured), `sidecar-16gb` needs `TRUTH_ALLOW_HIGH_MEMORY=1`,
`bizapps-common` needs `TRUTH_BIZAPPS_COMMON=1` (bizapps-common installed into the database — PR 1's five gates
exercise its job-title Feature Pipeline; PR 1 plan Q-5). The `nightly` and `weekly` CI lanes install it at the
workflow's pinned `BIZAPPS_COMMON_REF` and set the variable (§5.9, §9 D2-32); locally, install it per PR 1 plan §2.4.
`validate.ts` rejects any other value.

**Flipping a gate** is a one-line registry edit (`"Status": "required"`) in the owner PR, plus replacing the stub with a
body (`"Implementation": {"Kind":"body"}` and one `TruthGate.Define('<TestName>', …)` in a gate file named by its
subject, e.g. `gates/evaluation-protocols.gates.test.ts`). The registry keys on the title declared in the file, never
on a file name (program D-043), so gate files can be renamed or split without a registry edit. `validate.ts` (M2.3)
refuses: a count other than 111, a renamed gate, a changed owner, a `body` gate whose title is not declared exactly once
across `gates/*.gates.test.ts`, an `external` gate with no test of exactly that title in its file (a title counts when
it is the first, literal argument of `TruthGate.Define(`, `recordGate(`, `it(` or `test(`), a stub gate that has a
body in a gate file, and — when run with `--against origin/next` in CI — any gate that is `required` on `origin/next`
but `expected-fail` on the branch (no PR may relax another PR's gate).

**Reports:** `scripts/report.mjs` merges the per-gate files into `results/results.json` (all 111), `results/summary.md`
(counts by outcome and owner PR, then every `fail`/`error`/`xpass` with its measured values) and
`results/outcomes.json` in the integration tier's `EMIT_OUTCOMES` shape (`{name, passed, durationMs, error?}[]`), so
`scripts/integration-golden-diff.mjs` can diff two runs. `outcomes.json` keeps that shipped camelCase shape
(`IntegrationTestDriver.ts`, `scripts/integration-golden-diff.mjs` on `next`; program D-039 (a)).

### 5.3 Run modes, lanes and budget

| Mode | Selected gates | When | Budget (estimate → re-measured in M6.4) |
|---|---|---|---|
| `pr` | `runMode: "pr"` (Phase 0: G0.1, G0.3 (PR 4's, `expected-fail`), G0.4, G0.5, G0.7–G0.12) + every stub | PRs touching `packages/AI/PredictiveStudio/**`, the Engine/Core/Sidecar deps, or the workflow | gates ≈ 10 min + provisioning ≈ 15 min |
| `nightly` | `pr` + `nightly` (G0.2's 60 agent runs, PR 4's gate, `expected-fail` in PR 2; PR 1's five bridged gates once bridged, M-final.5) | 06:30 UTC daily on `next` | gates ≈ 37–40 min (R-TEST) + provisioning + bizapps-common install (assessment: 38 s migrations + 41 s metadata push) |
| `weekly` | everything, incl. 400-seed gates (`statRule` set), W8 and `requires: ["live-model"]` (G0.6) | Sunday 07:00 UTC + `workflow_dispatch` (`gh workflow run`) | 400-seed gates are stubs in PR 2 (cost ≈ 0); G0.6 ≈ 3 min; bizapps-common install as `nightly`; re-measured by each owner PR that implements a 400-seed body |

Run-mode defaults for the 99 stubs (owners may change them when they write bodies): `statRule` set → `weekly`; dataset
W8 → `weekly` with `requires: ["sidecar-16gb"]` (W8 training used ≈ 33 GB of sidecar memory, more than a 16 GB
GitHub runner; PR 3's F-L4-5 fix removes the requirement); every other gate → `nightly`.

### 5.4 Data: generators, Loom, seeds and caching

- **Loom pin.** `fixtures/loom.json` names the public repo and one commit. `scripts/fetch-loom.mjs` clones that commit
  into `TruthSuite/.loom/<sha>/` (git-ignored), runs `pnpm install --frozen-lockfile` and builds `@memberjunction/
  loom-contracts` and `@memberjunction/loom-engine` there, and writes `.loom/<sha>/.built`. `generators/loom.mjs`
  imports `packages/engine/dist/index.js` from `$TRUTH_LOOM_DIR` (default `.loom/<pinned sha>`), and throws a message
  naming `fetch-loom.mjs` when it is absent. Loom is never a pnpm dependency of MJ (its workspace has its own
  lockfile; an MJ dependency would pull it into `pnpm-lock.yaml`). Licence: Loom and MJ are both BUSL-1.1 with the
  same licensor (Blue Cypress), and the PS packages are BUSL-1.1 already, so a test-time checkout raises no licence
  question (§9 D2-03).
- **Generators** are the review's, ported with four changes: the Loom import goes through `generators/loom.mjs`;
  `make_scenario.mjs` gains `--seed <n>` (it previously read `spec.seed` only); `make_world*.mjs` gain `--seeds <list>`
  and write `people.csv` (Person rows with `WorldID`, `Seed`; F-L2-2) and stop emitting the 450 MB `metadata/` tree
  unless `--emit-metadata` is passed; output goes to the cache layout below. With the default seeds the bytes of
  `rows.csv` and `truth.csv` are identical to the review's (verified in M3.6 against `fixtures/golden-hashes.json`).
- **Seed sets** (`src/data/seeds.ts`): `base` = the spec's `seeds` + `freshSeed` (scenarios: `[spec.seed]`);
  `W2.t2` = 100–159; `W2.n400` = 100–499; for a scenario, `n400` = `[spec.seed, spec.seed*1000+1, …, spec.seed*1000+399]`
  (C2: 2201, 2201001 … 2201399). Fixed by this plan so every lane and every PR uses the same seeds.
- **Cache** (`src/data/cache.ts`): `$TRUTH_DATA_DIR` (default `TruthSuite/.data`), layout
  `<kind>/<id>/<specHash12>/seed-<k>/{rows.csv, truth.csv, people.csv?, truth_origins.csv?, manifest.json, .complete}`.
  `specHash = sha256(Canonicalize(spec) + sha256(generator file) + loomSha)` (MJGlobal `Canonicalize`, program D-041); a directory without `.complete` is
  regenerated. Base seeds and W2 s100–s159 are cached (≈ 120 MB); 400-seed sets are generated, used and deleted seed
  by seed, with each seed's sha256 appended to `<kind>/<id>/<specHash12>/n400.sha256` so a re-run can prove
  determinism. CI caches `.loom/` by the Loom sha and `.data/` by the hash of `fixtures/**` + `generators/**`.
- **T3-lag** has no generator: `derive_t3_lag.mjs` copies T3's `rows.csv` without `SamePeriodTarget` (and its truth and
  origins unchanged) into `scenarios/T3-lag/`; the manifest records `derivedFrom: "T3"` and the dropped column.
- **D2** is generated like any scenario (it was never written to `data/scenarios`); its spec's `sizingNote` is corrected
  from the withdrawn q(3) = 0.01737 to the current q(3) = 0.0171 (rows and truth bytes are unaffected; the golden
  hashes cover them).
- **Real cases** are committed fixtures (§9 D2-20), not regenerated: `person_years*.parquet` (sha256 `3729e51a…`,
  `36958e67…`), `R2-real.rows.csv` (`e265ea02…`), `T1-real.rows.csv` (`7adfd649…`).

### 5.5 Test schema, entities and isolation

- **Schema `pstruth`**, created by `migrations/V202610130001__pstruth_tables.sql` and applied with
  `pnpm mj migrate --schema pstruth --dir packages/AI/PredictiveStudio/TruthSuite/migrations`. The hand-written part is
  generated by `scripts/gen-pstruth-ddl.mjs` from the world specs, the scenario specs and the review's column-typing
  rules (`load_scenarios.py:10-20`); a unit test fails if the committed DDL differs from the script's output. After ≥ 50
  blank lines the file carries the CodeGen output of one scoped `mj codegen --skipfiles` run (entities named
  `PS Truth: <table>`, `TrackRecordChanges` off, `UserViewMaxRows` 1000 — the product default the cap gates exercise),
  so a fresh database needs only `mj migrate` plus `mj sync push` of `TruthSuite/metadata` (no live CodeGen per run,
  mirroring how CI provisions core; D2-40). The push sets each `PS Truth:` entity's `AllowDirectSQLInsert`/`Update`/
  `Delete` (with `TrackRecordChanges`, `TrustServerCacheCompletely` off and `DeleteType` `Hard`, which the opt-in
  requires), so the loaders' and the harness's direct SQL is the sanctioned path (`.claude/rules/data-access.md`;
  program D-040).
- **One table set per dataset**, so no load touches another dataset: `W<n>_Person` + `W<n>_MembershipYear` (W1–W8),
  `W9_Person` + `W9_EventRegistration`, `Scn_<ID>` for the 14 planted scenarios plus T3-lag, R2-real and T1-real,
  `SeriesFrame_<ID>` and `SeriesTrain_<ID>` for T1p, T3, T4 (the frame carries `MonthIndex`, `MonthOfYear`, one-hot
  `Month`; the train table is refilled per rolling origin), and `PersonYear` (C1 / T2-real). World row tables add
  `TruthScore FLOAT NULL` (the write-back target the scoring gates count).
- **Which seed is loaded** is stamped on each table as the extended property `pstruth_dataset`
  (`<datasetId>/seed-<k>#<rows sha256>`). `EnsureLoaded` reads the stamp and reloads only that dataset's tables when it
  differs (DELETE child, DELETE parent, bulk insert, re-check FKs, stamp). Nothing ever truncates the schema.
- **Isolation between runs is database-per-run**: CI creates a fresh database per job; an agent uses its own
  `MJ_PS_PR2_<agent>`. Within a run, gates execute serially (one vitest fork) and a dataset's seeds are loaded one at a
  time by the gate that needs them. Schema-per-run was rejected (§9 D2-06).
- **Loader**: Node `mssql` bulk insert (`Table` + `request.bulk`, 50,000-row batches) using the `DB_*` env vars — no bcp,
  no Docker, no hard-coded database, container, port or path. It refuses any CSV whose path contains `truth`, and it
  refuses a table whose entity lacks the direct-SQL opt-in (the error names `truth:provision`).

### 5.6 The Python boundary

- **Product sidecar** (`Sidecar/src/python/requirements.txt`): unchanged pins plus `scipy==1.17.1` (already installed
  transitively by scikit-learn; pinning it makes the judge and the sidecar compute with the same scipy). Supported
  interpreters: CPython 3.11 and 3.12.
- **Truth-suite venv** (`TruthSuite/.venv`, git-ignored): `python/requirements.txt` =
  `-r ../../Sidecar/src/python/requirements.txt` plus `statsmodels==0.15.0`, `patsy==1.0.3`, `pyarrow==25.0.1`,
  `mypy==1.17.1`, `pandas-stubs==2.2.2.240807` (the review venv's versions, Python 3.11.15). Built by
  `scripts/setup-python.mjs`, which calls the sidecar's `setup-python.mjs --venv <dir> --requirements <file>` so there
  is one interpreter-probing implementation.
- The sidecar under test always runs from its own venv (product pins only); the judges and the reference pipeline run
  in the truth-suite venv. The TypeScript side calls Python only through `judge-bridge.ts` (child process, JSON on
  stdout) — no in-process Python.

### 5.7 Harness interfaces

```ts
// src/harness/types.ts
import type { UserInfo, EntityInfo } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity, MJProcessRunEntity,
  MJProcessRunDetailEntity, PredictiveStudioScoreRecordSetInput,
  PredictiveStudioTrainAsOf, PredictiveStudioModelTargetStatus } from '@memberjunction/core-entities';
import type { ModelingPlanSpec, TrustVerdict, ValidationStrategy, AsOfStrategy, ProblemType } from '@memberjunction/predictive-studio-core';

export type WorldID = 'W1-signal' | 'W2-noise' | 'W3-leak-row' | 'W4-pit' | 'W5-censor' | 'W6-drift'
  | 'W7-small-imbalanced' | 'W8-highcard' | 'W9-multiclass';
export type ScenarioID = 'C2' | 'C4' | 'D1c' | 'D1r' | 'D2' | 'N1c' | 'N1r' | 'R1' | 'R2p' | 'R3' | 'T1p' | 'T2p'
  | 'T3' | 'T3-lag' | 'T4';
export type DatasetRef = { Kind: 'world'; ID: WorldID; Seed: number } | { Kind: 'scenario'; ID: ScenarioID; Seed: number }
  | { Kind: 'series-origin'; ID: 'T1p' | 'T3' | 'T4'; Seed: number; Origin: number };
export type AlgorithmKey = 'logistic_regression' | 'xgboost' | 'lightgbm' | 'random_forest' | 'ridge' | 'mlp';

// The result shapes are new and mirror no shipped camelCase shape, so their members are PascalCase.
export interface LoadedDataset { Ref: DatasetRef; Dir: string; Entity: EntityInfo; RowCount: number; RowsSha256: string }

export interface PipelineSpec {
  Name: string;                       // always prefixed "PSTruth:" (cleanup key)
  Dataset: LoadedDataset;
  Target: string;
  ProblemType: ProblemType;
  Features: string[];
  Algorithm: AlgorithmKey;
  AsOf: AsOfStrategy;
  Validation: ValidationStrategy;
  DenyFields: string[];
  TimeIndexColumn?: string;           // declared through containment-probe ApplyTimeIndexDeclaration (G0.11)
}

export interface TrainAttempt {
  Ok: boolean;                        // the operation returned Success with an Output
  ErrorMessage: string | null;
  ModelID: string | null;
  TrainingRunID: string | null;
  HoldoutMetricsJSON: string | null;
  DurationMs: number;
}

export interface CandidateModel {
  // Status unions are derived from the generated entities (never widened to string), so a value CodeGen adds reaches
  // every comparison as a compile-time change. `Trust` is Core's shipped TrustVerdict, whose members stay camelCase.
  ModelID: string; PipelineID: string; Algorithm: AlgorithmKey; Status: MJMLModelEntity['Status']; TrainingRowCount: number | null;
  HoldoutRowCount: number | null; Metrics: Record<string, number>; HoldoutMetrics: Record<string, number>;
  Trust: TrustVerdict; TrainingRunStatus: MJMLTrainingRunEntity['Status'] | null; TrainingRunNotes: string | null; LineageJSON: string | null;
  ValidationResultsJSON: string | null;
}

// The operation's shipped input minus the model, so the request keeps the operation's own wire names.
export type ScoreRequest = Omit<PredictiveStudioScoreRecordSetInput, 'modelId'>;
export interface ScoreAttempt { Ok: boolean; ErrorMessage: string | null; Scored: number; Failed: number; Skipped: number;
  WroteBack: boolean; Predictions: Array<{ RecordID: string; Score: number; Class: string | null }>; DurationMs: number }

export interface RecordProcessScoring {
  ProcessRunID: string; Status: MJProcessRunEntity['Status'];
  Details: Array<{ RecordID: string; Status: MJProcessRunDetailEntity['Status']; ResultPayload: string | null }>;
}

export interface AgentStepResult {
  AgentRunID: string | null; AgentSuccess: boolean; AgentErrorMessage: string | null;
  BuildModelID: string | null; BuildSuccess: boolean; BuildErrorMessage: string | null; WallMs: number;
}

/** What `Promote` reports: whether the operation applied the transition and the model's status after it. */
export interface PromoteAttempt { Promoted: boolean; Status: MJMLModelEntity['Status'] }

export interface TruthHarness {
  readonly Provider: GraphQLDataProvider;
  readonly User: UserInfo;
  readonly RunID: string;
  EnsureLoaded(ref: DatasetRef): Promise<LoadedDataset>;
  CreatePipeline(spec: PipelineSpec): Promise<MJMLTrainingPipelineEntity>;
  /** What ApplyTimeIndexDeclaration answered for the last CreatePipeline whose spec set timeIndexColumn (false otherwise). */
  LastTimeIndexDeclared(): boolean;
  /** Never throws for a failed operation: Ok false, ModelID null, ErrorMessage set. */
  Train(pipeline: MJMLTrainingPipelineEntity, opts?: { MaxRows?: number; AsOf?: PredictiveStudioTrainAsOf }): Promise<TrainAttempt>;
  RunBuilderAgent(plan: ModelingPlanSpec): Promise<AgentStepResult>;
  /** Trust = TrustVerdicts.DeriveTrustVerdict(<the loaded MJ: ML Models entity>) — the whole entity, so Lineage reaches the verdict. */
  ReadModel(modelId: string): Promise<CandidateModel>;
  ModelsForPipelineNamePrefix(prefix: string): Promise<CandidateModel[]>;
  Promote(modelId: string, target: PredictiveStudioModelTargetStatus, reason: string): Promise<PromoteAttempt>;
  Score(modelId: string, req: ScoreRequest): Promise<ScoreAttempt>;
  ScoreViaRecordProcess(modelId: string, dataset: LoadedDataset, extraFilter: string): Promise<RecordProcessScoring>;
  CountNonNull(dataset: LoadedDataset, column: 'TruthScore'): Promise<number>;
  ResetColumn(dataset: LoadedDataset, column: 'TruthScore'): Promise<void>;
  /** The Model Development Agent's user-facing report for one model (live AI model; G0.6's stories); null if none. */
  GenerateStory(modelId: string): Promise<string | null>;
  Judge<TOut>(module: string, args: string[]): Promise<TOut>;       // python -m truthsuite.judges.<module> … → JSON
  WriteArtifact(name: string, data: object): Promise<string>;      // $TRUTH_RESULTS_DIR/artifacts/<name>.json
}
```

### 5.8 Interfaces the containment milestones and the gate bodies share

The Phase-0 gate bodies (M5.9) read product behaviour only through `src/harness/containment-probe.ts`, so the
containment milestones C1–C6 can choose how the product stores a refusal or a withheld verdict and change **only this
file** (in the same commit as the product change) to read it. Every probe function is a public static of one
`ContainmentProbe` class (program D-037, ruling SR-1) and its result shapes have PascalCase members (D-039, ruling SR-2).
Ownership: C5.6 replaces the bodies of `ContainmentProbe.ReadStoredWithheldVerdict` and
`ContainmentProbe.ApplyTimeIndexDeclaration`; PR 4 (not PR 2) replaces the bodies of
`ContainmentProbe.ReadStoredGateDecision` and `ContainmentProbe.ReverifiesStoredDecision` (G0.2, program D-032); the
other members keep the bodies below through the whole PR (C1–C4 change product behaviour, not how it is read). The two
story helpers M5.9 adds at the end of this class (`StoryPromptFiles`, `GenerateModelStory`) are final in M5.9. No C
milestone edits `gates/containment.gates.test.ts`.

```ts
// src/harness/containment-probe.ts — the single seam between gate bodies and containment behaviour.
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { TrustVerdict } from '@memberjunction/predictive-studio-core';
import type { TrainAttempt, CandidateModel, ScoreAttempt } from './types';

/** The three gate outcomes (reference contracts.ts `GateOutcome`; named apart from the suite's own result outcomes). */
export type StoredGateDecision = 'model' | 'keep-simple-baseline' | 'no-signal';

/** A withheld verdict as a model stores it. `Grade` is derived from the verdict type, never widened to `string`. */
export interface StoredWithheldVerdict { CanAct: boolean; Grade: TrustVerdict['grade']; Reason: string }

/** How the gate bodies read containment behaviour. Static members only: the class is the one seam. */
export class ContainmentProbe {
  /** A training request counts as "refused before training" when the operation failed and produced no model. */
  public static WasRefusedBeforeTraining(a: TrainAttempt): boolean {
    return !a.Ok && a.ModelID === null;
  }

  /** A scoring request counts as refused when the operation failed (ErrorMessage set) and nothing was scored. */
  public static WasScoringRefused(a: ScoreAttempt): boolean {
    return !a.Ok && a.ErrorMessage !== null && a.Scored === 0;
  }

  /**
   * Whether a model of an agent run reached Published (G0.2, G0.3). The runs have automated publishing on and no person
   * in them; the amended threshold counts Published whoever or whatever promoted the model.
   */
  public static ReachedPublishedUnattended(m: CandidateModel): boolean {
    return m.Status === 'Published';
  }

  /**
   * The gate outcome stored for the model's training run, or null when nothing is stored (G0.2). Nothing stores one
   * yet: the training-side gate stores the outcome and the publish-side reverification replaces this body to read it.
   */
  public static ReadStoredGateDecision(m: CandidateModel): StoredGateDecision | null {
    return null;
  }

  /**
   * Whether publish reverification re-derives the model's stored outcome (G0.2). It does not exist yet; the change that
   * adds it replaces this body with a call to it. Until then false, so a run that reaches Published is never consistent.
   */
  public static ReverifiesStoredDecision(m: CandidateModel): boolean {
    return false;
  }

  /** The withheld verdict a model stores, or null when nothing is stored (the change that stores it reads it here). */
  public static ReadStoredWithheldVerdict(m: CandidateModel): StoredWithheldVerdict | null {
    return null; // Nothing stores one yet, so G0.11's "stores the withheld verdict" half measures 0 of 12.
  }

  /**
   * Declare the pipeline's time index. PS has no such declaration yet (no TimeIndex field anywhere in Core/Engine); the
   * change that adds one replaces this body. Until then it returns false and G0.11 records `timeIndexDeclared: false`.
   */
  public static ApplyTimeIndexDeclaration(pipeline: MJMLTrainingPipelineEntity, column: string): boolean {
    return false;
  }

  /** "Graded above Poor or cleared to act". */
  public static GradedAbovePoorOrActionable(m: CandidateModel): boolean {
    return m.Trust.grade !== 'Poor' || m.Trust.canAct;
  }
}
```

`ContainmentProbe`'s members are public for the gate bodies; the C milestones own any change to their bodies and
must keep the signatures. The two UI gates (G0.4 `W1 → S9.4`, G0.5 `W1 → S9.5`) live in `gates/containment.gates.test.ts` as standard `Kind: "body"` gates (§9 D2-44): in M5.10, the pure At-Risk domain/view-model logic (`ParseRowDrivers`, `ParseAtRiskRows`, `ResolveRenewalPolarity`, `TopGlobalDrivers`, `HumanizeFeatureName`) is moved to `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts`), imported by both `@memberjunction/ng-dashboards` and `@memberjunction/predictive-studio-truth-suite`, so `@memberjunction/ng-dashboards` carries zero TruthSuite test-harness probes or test files. C4.2 adds `AtRiskRules.DriverRaisesRisk`, `AtRiskRules.DriverBadgeText`, `AtRiskRules.BuildAtRiskOptions`, and `AtRiskRules.SelectAtRiskListMembers` to `Core/src/at-risk-rules.ts`, updates the dashboard components/resource to call them, and updates `ContainmentProbe.TopDriverBadges` / `ContainmentProbe.AtRiskListRecordIDs` in `containment-probe.ts` to call them too.

### 5.9 CI

`.github/workflows/ps-truth-suite.yml` (M6.1): GitHub-hosted `ubuntu-latest` (4 vCPU, 16 GB), the same SQL Server
2022 container and provisioning steps as `integration.yml` (fresh `test` database per job, `mj migrate`, both `mj sync
push` roots), plus `actions/setup-python@v5` 3.11, the Loom and data caches, `truth:provision` (pstruth migration),
MJAPI booted with `PREDICTIVE_STUDIO_SIDECAR_URL` pointing at the runner's single-threaded sidecar, the gate run, the
report, and `actions/upload-artifact` of `results/`. Three jobs gated by event: `pr` (pull_request, path-filtered),
`nightly` (cron `30 6 * * *`), `weekly` (cron `0 7 * * 0`, plus `workflow_dispatch` input `mode`). The job fails on any
`fail` or `error` outcome and on a registry validation error; `xpass` is listed in the job summary as "flip me".
The `nightly` and `weekly` jobs also install bizapps-common (PR 1 plan §2.4's database-only install: `mj migrate
--schema __mj_BizAppsCommon --dir <clone>/migrations`, `mj sync push --dir <clone>/metadata --ci`) from a shallow
fetch of the pinned `BIZAPPS_COMMON_REF` after core provisioning and before MJAPI boots, check its rows, and export
`TRUTH_BIZAPPS_COMMON=1`, so PR 1's bridged gates are measured in CI (§9 D2-32). The repository is public: no secret.

### 5.10 Backward compatibility

- `MLSidecar`: `pythonPath` option precedence unchanged; `PREDICTIVE_STUDIO_PYTHON` sits between it and the bundled
  venv. `setup-python.mjs` keeps its default venv location and command; new flags are optional.
- CodeGen: emitted SQL is unchanged by M1.6 and M1.8 (the F-ENV-7 guard acts at execution time only), so no committed
  migration and no drift gate changes.
- MetadataSync: folders that set `filePattern` behave exactly as before.
- No product schema, entity or metadata change in M1–M6.
- C1–C6 add no migration and no new column (the C5 settings live in the existing `MLTrainingPipeline.ValidationStrategy`
  JSON column and the existing `MLModel.Lineage` JSON column). Behaviour changes callers see: an explicit `maxRows` smaller than the
  match fails (training) or is refused (scoring) instead of truncating (D2-C1); the automated publish path (the
  Pipeline Builder's publish step, opt-in auto-train) is unchanged (D2-C2, program D-030); Draft and Archived models are refused for scoring
  (D2-C3); `ParseRowDrivers` gains a required `invertedRisk` (no default, D-042; every in-repo caller passes it, and
  `LoadScoreHistoryParams` gains the required `InvertedRisk` the grid fills); global driver lists are hidden for
  split/impurity importance (D2-C4); as-of `column`/`offset` and a non-`none` Train `asOf` input are refused; `kfold`
  and `holdout` metrics become out-of-sample and `/train` with < 4 rows returns 400; `TrustModelInput.Lineage` and
  `TrustVerdict.withheldReason` are optional additions, and models trained before C5 keep their AUC verdicts while an
  accuracy-only verdict without `baseline_accuracy` becomes "unknown" (D2-C5a–c); `ValidationStrategy.MajorityBaselineRule`
  and `TrustVerdict.majorityBaseline` are optional additions in existing JSON (absent = `enforce`; a stored
  `Lineage.evaluation` without the rule reads as `enforce`), and a pipeline whose JSON carries any other value is
  refused at training (D2-C5d); `ExperimentDepsBuilder.BuildProductionExperimentDeps`
  rejects (D2-C6). Metadata: the agent's `Run Experiment Session` link becomes `Revoked` (row kept; its `Promote ML
  Model` link stays `Active`, D-030), prompt templates and the maintenance job's name/description change.

### 5.11 Seams touched (anchors)

```anchors
[
  { "id": "sidecar-setup-probe", "file": "packages/AI/PredictiveStudio/Sidecar/scripts/setup-python.mjs", "symbol": "function resolveBasePython()", "pattern": "for (const candidate of ['python3', 'python'])", "lineHint": 38, "atCommit": "141d8d065c" },
  { "id": "sidecar-setup-script", "file": "packages/AI/PredictiveStudio/Sidecar/package.json", "pattern": "\"setup:python\": \"node scripts/setup-python.mjs\"", "lineHint": 16, "atCommit": "141d8d065c" },
  { "id": "sidecar-python-path", "file": "packages/AI/PredictiveStudio/Sidecar/src/ml-sidecar.ts", "symbol": "function resolveBundledPython(): string | null {", "pattern": "this.pythonPath = options?.pythonPath ?? resolveBundledPython() ?? 'python3';", "lineHint": 162, "atCommit": "141d8d065c" },
  { "id": "sidecar-run-pytest", "file": "packages/AI/PredictiveStudio/Sidecar/scripts/run-pytest.mjs", "pattern": "const venvPython = path.join(packageRoot, '.venv', 'bin', 'python');", "lineHint": 17, "atCommit": "141d8d065c" },
  { "id": "sidecar-gitignore-venv", "file": "packages/AI/PredictiveStudio/Sidecar/.gitignore", "pattern": ".venv/", "lineHint": 1, "atCommit": "141d8d065c" },
  { "id": "sidecar-requirements", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/requirements.txt", "symbol": "pinned for Python 3.9+", "pattern": "numpy==1.26.4", "lineHint": 12, "atCommit": "141d8d065c" },
  { "id": "engine-it-venv", "file": "packages/AI/PredictiveStudio/Engine/src/__tests__/integration/live-train-score.integration.test.ts", "symbol": "const INTEGRATION_ENABLED = process.env.PS_INTEGRATION === '1';", "pattern": "const venv = path.resolve(here, '..', '..', '..', '..', 'Sidecar', '.venv', 'bin', 'python');", "lineHint": 92, "atCommit": "141d8d065c" },
  { "id": "engine-it-config", "file": "packages/AI/PredictiveStudio/Engine/vitest.integration.config.ts", "pattern": "merged.test.include = ['src/**/integration/**/*.integration.test.ts'];", "lineHint": 40, "atCommit": "141d8d065c" },
  { "id": "codegen-layered-refresh", "file": "packages/CodeGenLib/src/Database/sql.ts", "pattern": "const layeredEntities = customViewEntities.filter(e => e.HasLayeredBaseView);", "lineHint": 239, "atCommit": "141d8d065c" },
  { "id": "mjcli-migrate-dir", "file": "packages/MJCLI/src/commands/migrate/index.ts", "pattern": "dir: Flags.string({ description: 'Migration source directory", "lineHint": 32, "atCommit": "141d8d065c" },
  { "id": "ro-train-input", "file": "packages/MJCoreEntities/src/generated/remote_operations.ts", "pattern": "export interface PredictiveStudioTrainModelInput {", "lineHint": 379, "atCommit": "141d8d065c" },
  { "id": "ro-score-input", "file": "packages/MJCoreEntities/src/generated/remote_operations.ts", "pattern": "export interface PredictiveStudioScoreRecordSetInput {", "lineHint": 253, "atCommit": "141d8d065c" },
  { "id": "core-trust-verdict", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "pattern": "export function DeriveTrustVerdict(model: TrustModelInput): TrustVerdict {", "lineHint": 177, "atCommit": "141d8d065c" },
  { "id": "ui-row-drivers", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "pattern": "export function ParseRowDrivers(", "lineHint": 58, "atCommit": "141d8d065c" },
  { "id": "ui-at-risk-rows", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "pattern": "export function ParseAtRiskRows(details: RunDetailLike[], options?: ParseAtRiskOptions): AtRiskRow[] {", "lineHint": 224, "atCommit": "141d8d065c" },
  { "id": "ui-badge-label", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.html", "pattern": "{{ d.up ? 'Increases Risk' : 'Lowers Risk' }}", "lineHint": 368, "atCommit": "141d8d065c" },
  { "id": "ui-resource-at-risk", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "pattern": "this.AtRiskRows = ParseAtRiskRows((res.Results ?? []).map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload })));", "lineHint": 678, "atCommit": "141d8d065c" },
  { "id": "ui-send-to-list", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "pattern": "const members = this.AtRiskRows.filter((r) => r.band !== 'low').slice(0, 200);", "lineHint": 843, "atCommit": "141d8d065c" },
  { "id": "builder-autopublish", "file": "packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder.ts", "pattern": "trust.canAct", "lineHint": 476, "atCommit": "141d8d065c" },
  { "id": "ti-bootstrap-server", "file": "packages/TestingFramework/integration-test-suite/rigs/lib/ai-bootstrap.ts", "pattern": "export async function BootstrapAI(dbConfig?: DbConfig): Promise<AICtx> {", "lineHint": 40, "atCommit": "141d8d065c" },
  { "id": "ci-integration", "file": ".github/workflows/integration.yml", "pattern": "name: Integration Tier", "lineHint": 1, "atCommit": "141d8d065c" },
  { "id": "ws-ps-glob", "file": "pnpm-workspace.yaml", "pattern": "- 'packages/AI/PredictiveStudio/*'", "lineHint": 64, "atCommit": "141d8d065c" },
  { "id": "guide-setup", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "pattern": "### 2.2 `npm run setup:python` — the one-time bootstrap", "lineHint": 173, "atCommit": "141d8d065c" },
  { "id": "guide-count-header", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "pattern": "**6 typed Remote Operations**", "lineHint": 19, "atCommit": "141d8d065c" },
  { "id": "guide-ro-section", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "pattern": "### 10.1 The 6 Remote Operations", "lineHint": 572, "atCommit": "141d8d065c" },
  { "id": "guide-actions-section", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "pattern": "### 10.2 The 4 Actions", "lineHint": 587, "atCommit": "141d8d065c" },
  { "id": "it-guide-ps-gates", "file": "guides/INTEGRATION_TESTING_QUICKSTART.md", "pattern": "Adjacent gates outside the tier enum", "lineHint": 221, "atCommit": "141d8d065c" },
  { "id": "loom-dials-zero", "repo": "loom", "file": "packages/cli/src/commands/build.ts", "pattern": "latentDials: hero ? { ...hero.latentDials } : { theta: 0.0, phi: 0.0 },", "lineHint": 652, "atCommit": "63aec01f61" },
  { "id": "loom-register-dial", "repo": "loom", "file": "packages/engine/src/factors/engine.ts", "pattern": "public RegisterDial(config: LatentDialConfig): void {", "lineHint": 16, "atCommit": "63aec01f61" },
  { "id": "loom-get-children", "repo": "loom", "file": "packages/engine/src/simulation/RetrospectiveUnroller.ts", "pattern": "getChildren: (parentEntity: string, parentId: string, childEntity: string, foreignKeyField: string) => {", "lineHint": 295, "atCommit": "63aec01f61" },
  { "id": "loom-motif-sample", "repo": "loom", "file": "packages/engine/src/simulation/RetrospectiveUnroller.ts", "pattern": "this.motifAssignments = motifSampler.SamplePopulation(entities, rng);", "lineHint": 140, "atCommit": "63aec01f61" },
  { "id": "loom-index-defaults", "repo": "loom", "file": "packages/cli/src/generation.ts", "pattern": "row[fieldName] = fieldCfg.values[(i - 1) % fieldCfg.values.length];", "lineHint": 160, "atCommit": "63aec01f61" },
  { "id": "loom-validator-factor-gate", "repo": "loom", "file": "packages/engine/src/validation/validator.ts", "pattern": "private checkFactorContracts(", "lineHint": 1135, "atCommit": "63aec01f61" },
  { "id": "review-load-truncate", "repo": "ps-review", "file": "probes/loom-worlds/load_world.sh", "pattern": "TRUNCATE TABLE pstest.EventRegistration; TRUNCATE TABLE pstest.MembershipYear; DELETE FROM pstest.Person;", "lineHint": 98, "atCommit": "d47dfb86f1" },
  { "id": "review-scenario-seed", "repo": "ps-review", "file": "probes/scenarios/make_scenario.mjs", "pattern": "const rng = createRng(spec.seed, spec.id);", "lineHint": 25, "atCommit": "d47dfb86f1" },
  { "id": "review-harness-paths", "repo": "ps-review", "file": "probes/ts/probe-truth-harness.ts", "pattern": "const PS_REVIEW = '/Users/arieglazier/repos/ps-review';", "lineHint": 74, "atCommit": "d47dfb86f1" }
]
```

Seams the containment milestones C1–C6 touch (verified with `tools/check-anchors.mjs` at the commits recorded):

```anchors
[
  {"id": "ctn-c1-fetchrows-result", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/data-access.ts", "symbol": "FetchRowsResult", "pattern": "export interface FetchRowsResult {", "lineHint": 49, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-ignoremaxrows", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/data-access.ts", "symbol": "public async fetchRows(", "pattern": "IgnoreMaxRows: params.MaxRows == null,", "lineHint": 123, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-fetchrows-return", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/data-access.ts", "symbol": "RunViewDataAccess", "pattern": "return { Success: true, Rows: result.Results ?? [] };", "lineHint": 132, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-resolve-records", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts", "symbol": "FeatureAssemblyExecutor", "pattern": "private async resolveRecords(params: FeatureAssemblyParams, dataAccess: IFeatureDataAccess): Promise<SourceRow[]> {", "lineHint": 237, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-recordset-maxrows", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts", "symbol": "private async resolveRecords(", "pattern": "MaxRows: params.recordSet.MaxRows,", "lineHint": 248, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-dated-source-read", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts", "symbol": "private async indexDatedSources(", "pattern": "const res = await dataAccess.fetchRows({ EntityName: ds.EntityName });", "lineHint": 648, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-train-recordset", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "private async assemble(", "pattern": "recordSet: { EntityName: resolved.targetEntityName, MaxRows: input.maxRows },", "lineHint": 236, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-runner-filter-maxrows", "file": "packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts", "symbol": "protected async resolveFilter(", "pattern": "MaxRows: maxRows,", "lineHint": 231, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-runner-view", "file": "packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts", "symbol": "protected async resolveView(", "pattern": "{ ViewID: params.ViewID, ResultType: 'entity_object' },", "lineHint": 251, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-runner-list", "file": "packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts", "symbol": "protected async resolveList(", "pattern": "return this.resolveFilter(entityName, this.primaryKeyInFilter(entityInfo, recordIds), undefined, contextUser, provider);", "lineHint": 200, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-runner-scope-first", "file": "packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts", "symbol": "public async run(request: ScoreRecordSetRequest)", "pattern": "const records = await this.resolveScope(request.scope, request.contextUser, request.provider);", "lineHint": 90, "atCommit": "141d8d065c"},
  {"id": "ctn-c1-rescore-filter", "file": "packages/AI/PredictiveStudio/Engine/src/maintenance/seams.ts", "symbol": "ProductionRescoreRunner", "pattern": "maxRows: request.maxRows,", "lineHint": 166, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-agent-publish", "file": "packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder.ts", "symbol": "private async maybePublish(", "pattern": "model.Status = 'Published';", "lineHint": 479, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-autotrain-publish", "file": "packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts", "symbol": "protected async trainAndPublish(", "pattern": "for (const targetStatus of ['Validated', 'Published'] as const) {", "lineHint": 125, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-gate-transitions", "file": "packages/AI/PredictiveStudio/Engine/src/actions/promote-model.gate.ts", "symbol": "ALLOWED_TRANSITIONS", "pattern": "Draft: ['Validated'],", "lineHint": 184, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-gate-artifact", "file": "packages/AI/PredictiveStudio/Engine/src/actions/promote-model.gate.ts", "symbol": "protected async transition(", "pattern": "if (targetStatus === 'Published' && !ModelHasTrainedArtifact(model)) {", "lineHint": 211, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-agent-status-filter", "file": "packages/AI/Agents/src/base-agent.ts", "symbol": "AIAgentAction", "pattern": ".filter(ap => UUIDsEqual(ap.AgentID, agent.ID) && ap.Status === 'Active')", "lineHint": 4414, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-guide-autotrain", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 6.x", "pattern": "or **trains** the pipeline through the real `TrainingEngine` and publishes it through the promotion gate", "lineHint": 447, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-guide-builder", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 12.4", "pattern": "then **publishes the model ONLY if `deriveTrustVerdict` clears the bar**", "lineHint": 778, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-guide-gate", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "## 13. The security model", "pattern": "**4 · The promotion state machine (Draft → Validated → Published → Archived).**", "lineHint": 809, "atCommit": "141d8d065c"},
  {"id": "ctn-c2-guide-model-action", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 15.3 PS2-2", "pattern": "so every published model becomes a first-class, discoverable Action", "lineHint": 940, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-load-model", "file": "packages/AI/PredictiveStudio/Engine/src/scoring/ml-model-inference-processor.ts", "symbol": "MLModelInferenceProcessor", "pattern": "private async loadModel(context: RecordProcessorContext): Promise<LoadedModel> {", "lineHint": 247, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-load-model-return", "file": "packages/AI/PredictiveStudio/Engine/src/scoring/ml-model-inference-processor.ts", "symbol": "private async loadModel(", "pattern": "return this.buildLoadedModel(model, bytes, context);", "lineHint": 262, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-preflight", "file": "packages/AI/PredictiveStudio/Engine/src/scoring/ml-model-inference-processor.ts", "symbol": "public async Preflight(", "pattern": "if (!(err instanceof ModelNeedsTrainingError) || !this.autoTrain || !this.autoTrainer) {", "lineHint": 139, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-readiness-error", "file": "packages/AI/PredictiveStudio/Engine/src/scoring/model-readiness.ts", "symbol": "ModelNeedsTrainingError", "pattern": "export class ModelNeedsTrainingError extends Error {", "lineHint": 67, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-runner-preflight", "file": "packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts", "symbol": "public async run(", "pattern": "await processor.Preflight(context);", "lineHint": 99, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-runner-dryrun", "file": "packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts", "symbol": "protected async applyWriteBack(", "pattern": "if (!mapping || request.dryRun) {", "lineHint": 395, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-op-drops-dryrun", "file": "packages/AI/PredictiveStudio/Engine/src/operations/score-record-set.operation.ts", "symbol": "InternalExecute", "pattern": "writeBack: input.writeBack as WriteBackDirective | undefined,", "lineHint": 70, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-contract-dryrun", "file": "packages/MJCoreEntities/src/generated/remote_operations.ts", "symbol": "PredictiveStudioScoreRecordSetInput", "pattern": "Compute the predictions WITHOUT writing them back (preview) when true/omitted with no write-back.", "lineHint": 258, "atCommit": "141d8d065c"},
  {"id": "ctn-c3-guide-writeback", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 6.3 Ephemeral vs write-back", "pattern": "**Ephemeral by default; write-back when an `OutputMapping` is present.**", "lineHint": 413, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-driver-up", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "symbol": "export function ParseRowDrivers(", "pattern": "out.push({ label: HumanizeFeatureName(feature), value, up: value > 0 });", "lineHint": 69, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-polarity", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "symbol": "ResolveRenewalPolarity", "pattern": "export function ResolveRenewalPolarity(", "lineHint": 144, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-risk-invert", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "symbol": "export function ParseAtRiskRows(", "pattern": "const effectiveRisk = isInverted ? Math.max(0, Math.min(1, 1 - score)) : score;", "lineHint": 258, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-rows-drivers", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "symbol": "export function ParseAtRiskRows(", "pattern": "drivers: ParseRowDrivers(p.drivers),", "lineHint": 292, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-risk-sort", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts", "symbol": "export function ParseAtRiskRows(", "pattern": "return rows.sort((a, b) => b.riskPct - a.riskPct);", "lineHint": 295, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-resource-atrisk", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "private async loadAtRisk(", "pattern": "this.AtRiskRows = ParseAtRiskRows((res.Results ?? []).map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload })));", "lineHint": 678, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-resource-drivers", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "private async loadAtRisk(", "pattern": "this.Drivers = TopGlobalDrivers(model?.FeatureImportance ?? null, 3);", "lineHint": 662, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-sendtolist", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "public async SendToList(", "pattern": "const members = this.AtRiskRows.filter((r) => r.band !== 'low').slice(0, 200);", "lineHint": 843, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-export-header", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "public ExportList(", "pattern": "'Record,Likelihood %,Predicted',", "lineHint": 893, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-resource-copy", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "ps-drivers", "pattern": "<i class=\"fa-solid fa-lightbulb\"></i> <strong>What's driving this:</strong>", "lineHint": 126, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-agent-context-copy", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/predictive-studio-agent-context.ts", "symbol": "Drivers", "pattern": "/** Plain-language \"what's driving this\" drivers for the selection (bounded). */", "lineHint": 122, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-grid-polarity", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.ts", "symbol": "ResolveRenewalPolarity", "pattern": "const shouldInvertRisk = polarity.IsRenewalModel ? !polarity.ScoreIsLapseRisk : false;", "lineHint": 787, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-drawer-badge", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.html", "symbol": "pg-detail-drivers-wrap", "pattern": "{{ d.up ? 'Increases Risk' : 'Lowers Risk' }}", "lineHint": 368, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-drawer-title", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.html", "symbol": "pg-detail-drivers-wrap", "pattern": "Key Decision Drivers (Explainability)", "lineHint": 355, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-drawer-css", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.css", "symbol": "pg-detail-driver-item", "pattern": ".pg-detail-drivers-list {", "lineHint": 656, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-trust-copy", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "symbol": "function buildOneLiner(", "pattern": ": `Explains about ${Math.round(clamp01(metrics.R2) * 100)}% of what drives the outcome.`;", "lineHint": 152, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-report-canned", "file": "packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts", "symbol": "export function GenerateMarkdownReport(", "pattern": "- Trained with honest holdout evaluation to safeguard against out-of-sample error.", "lineHint": 190, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-report-heading", "file": "packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts", "symbol": "export function GenerateMarkdownReport(", "pattern": "## Top Influential Features", "lineHint": 186, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-report-bars", "file": "packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts", "symbol": "executeAgentInternal", "pattern": "let featureBars = ParseFeatureImportance(result.model?.FeatureImportance);", "lineHint": 253, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-report-invented", "file": "packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts", "symbol": "executeAgentInternal", "pattern": "featureBars = payload.CandidateFeatures.slice(0, 10).map((f, idx) => ({", "lineHint": 255, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-model-detail-importance", "file": "packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ps-model-detail.component.ts", "symbol": "public get Importance(): PSFeatureBar[] {", "pattern": "return ParseFeatureImportance(this.Model.FeatureImportance, 6).map((b) => ({", "lineHint": 308, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-model-detail-html", "file": "packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ps-model-detail.component.html", "symbol": "4. Feature Importance", "pattern": "@for (f of importance; track f.name) {", "lineHint": 96, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-panel-drivers", "file": "packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/model-prediction.panel.ts", "symbol": "ModelPredictionPanel", "pattern": "Drivers: ParseDrivers(model.FeatureImportance),", "lineHint": 453, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-prompt-features", "file": "metadata/prompts/templates/model-development-agent/model-development-agent.template.md", "symbol": "### 4. Report", "pattern": "which features mattered most", "lineHint": 58, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-core-index", "file": "packages/AI/PredictiveStudio/Core/src/index.ts", "symbol": "predictive-studio-core", "pattern": "export * from './outcome-config';", "lineHint": 20, "atCommit": "141d8d065c"},
  {"id": "ctn-c4-sidecar-importance", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py", "symbol": "def _extract_importance(", "pattern": "if hasattr(estimator, \"feature_importances_\"):", "lineHint": 453, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-resolve-then-run", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "public async trainModel(", "pattern": "const run = await this.createRunRow(resolved, input, deps);", "lineHint": 101, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-asof-parse", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "private async resolvePipeline(", "pattern": "asOf: parseJson<AsOfStrategy>(pipeline.AsOfStrategy, { Mode: 'none' }),", "lineHint": 155, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-validation-parse", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "private async resolvePipeline(", "pattern": "validation: parseJson<ValidationStrategy>(pipeline.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 }),", "lineHint": 157, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-build-lineage", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "TrainingEngine", "pattern": "private buildLineage(resolved: ResolvedPipeline", "lineHint": 363, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-run-notes", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "private async finalizeRunSuccess(", "pattern": "run.Notes = this.buildRunNotes(dominance);", "lineHint": 200, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-select-today", "file": "packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts", "symbol": "private async emitValue(", "pattern": "return normalizeValue(record[emitter.sourceColumn]);", "lineHint": 738, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-train-op-input", "file": "packages/AI/PredictiveStudio/Engine/src/operations/train-model.operation.ts", "symbol": "protected toEngineInput(", "pattern": "const engineInput: TrainModelInput = { pipelineId: input.pipelineId };", "lineHint": 86, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-train-op-asof-type", "file": "metadata/remote-operations/types/predictive-studio-train-model.input.ts", "symbol": "PredictiveStudioTrainModelInput", "pattern": "asOf?: PredictiveStudioTrainAsOf;", "lineHint": 24, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-goal-analyst-asof", "file": "metadata/prompts/templates/model-development-agent/goal-analyst.template.md", "symbol": "AsOfStrategy", "pattern": "- **`AsOfStrategy`** (optional but important for time-based predictions)", "lineHint": 20, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-goal-analyst-example", "file": "metadata/prompts/output/model-development-agent/goal-analyst.example.json", "symbol": "TargetDefinition", "pattern": "\"AsOfStrategy\": { \"Mode\": \"offset\", \"OffsetDays\": 90 }", "lineHint": 13, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-insample", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py", "symbol": "def _fit_and_score(", "pattern": "# kfold / holdout-only / tiny data: fit on all dev data and score in-sample.", "lineHint": 366, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-tts-branch", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py", "symbol": "def _fit_and_score(", "pattern": "if strategy == \"train_test_split\" and X.shape[0] >= 4:", "lineHint": 349, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-antiskew", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py", "symbol": "_anti_skew_val_metrics", "pattern": "def _anti_skew_val_metrics(", "lineHint": 372, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-typing-import", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py", "symbol": "from fastapi import FastAPI, HTTPException", "pattern": "from typing import Any, Dict, List, Optional, Sequence, Tuple", "lineHint": 16, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-metrics-accuracy", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/metrics.py", "symbol": "def classification_metrics(", "pattern": "metrics[\"accuracy\"] = float(accuracy_score(y_true, y_pred))", "lineHint": 51, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-metrics-auc", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/metrics.py", "symbol": "def classification_metrics(", "pattern": "auc = _safe_auc(y_true, y_score)", "lineHint": 56, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-xgb-threads", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/algorithms.py", "symbol": "def _xgboost(", "pattern": "common = {\"n_jobs\": -1, \"tree_method\": \"hist\", **hp}", "lineHint": 71, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-lgbm-threads", "file": "packages/AI/PredictiveStudio/Sidecar/src/python/app/algorithms.py", "symbol": "def _lightgbm(", "pattern": "common = {\"n_jobs\": -1, \"verbose\": -1, \"min_child_samples\": 5, **hp}", "lineHint": 82, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-validation-strategy", "file": "packages/AI/PredictiveStudio/Core/src/pipeline-spec.ts", "symbol": "ValidationStrategy", "pattern": "export interface ValidationStrategy {", "lineHint": 77, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-locked-fraction", "file": "packages/AI/PredictiveStudio/Core/src/pipeline-spec.ts", "symbol": "export interface ValidationStrategy", "pattern": "LockedHoldoutFraction: number;", "lineHint": 88, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-pipeline-validation-column", "file": "packages/MJCoreEntities/src/generated/entities/__mj.ts", "symbol": "export class MJMLTrainingPipelineEntity", "pattern": "get ValidationStrategy(): string | null {", "lineHint": 110951, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-builder-validation", "file": "packages/AI/PredictiveStudio/Engine/src/agent/modeling-plan-to-pipeline.ts", "symbol": "LockedHoldoutFraction: v?.LockedHoldoutFraction ?? 0.2,", "pattern": "function buildValidation(spec: ModelingPlanSpec): ValidationStrategy {", "lineHint": 147, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-editor-validation-load", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-pipelines.component.ts", "symbol": "public EditValidation: ValidationStrategy", "pattern": "this.EditValidation = this.parse<ValidationStrategy>(p.ValidationStrategy,", "lineHint": 1685, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-editor-validation-save", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-pipelines.component.ts", "symbol": "public SetValStrategy(v: string): void { this.EditValidation = { ...this.EditValidation,", "pattern": "p.ValidationStrategy = JSON.stringify(this.EditValidation);", "lineHint": 2310, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-wizard-validation", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-pipeline-wizard.component.ts", "symbol": "p.ValidationStrategy = JSON.stringify(valStrategy);", "pattern": "const valStrategy: ValidationStrategy = {", "lineHint": 1136, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-trust-input", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "symbol": "TrustModelInput", "pattern": "export interface TrustModelInput {", "lineHint": 25, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-trust-aliases", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "symbol": "parseTrustMetrics", "pattern": "const TRUST_METRIC_ALIASES: Record<string, keyof TrustMetrics> = {", "lineHint": 65, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-trust-best", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "symbol": "function bestMetrics(model: TrustModelInput): TrustMetrics {", "pattern": "return Object.keys(holdout).length > 0 ? holdout : parseTrustMetrics(model.Metrics);", "lineHint": 128, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-trust-accuracy", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "symbol": "bandGrade", "pattern": "grade = bandGrade(metrics.Accuracy, AUC_BANDS); // reuse the bands as a rough fallback", "lineHint": 197, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-trust-canact", "file": "packages/AI/PredictiveStudio/Core/src/trust.ts", "symbol": "export function DeriveTrustVerdict(", "pattern": "const canAct = grade !== 'Poor';", "lineHint": 215, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-cards-input", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "public get Cards(): BusinessPredictionCard[] {", "pattern": "ProblemType: m.ProblemType,", "lineHint": 524, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-guide-asof", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 4.3 Point-in-time", "pattern": "Time-relative feature logic (`daysSinceLastActivityAsOf`", "lineHint": 292, "atCommit": "141d8d065c"},
  {"id": "ctn-c5-guide-validation", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 5.1 Validation discipline", "pattern": "Default to a train/test split with overfitting detection; optional k-fold and holdout.", "lineHint": 352, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-unresolved-resolver", "file": "packages/AI/PredictiveStudio/Engine/src/actions/run-experiment.deps.ts", "symbol": "export class UnresolvedPipelineResolver implements IPipelineResolver {", "pattern": "new UnresolvedPipelineResolver(),", "lineHint": 82, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-build-deps", "file": "packages/AI/PredictiveStudio/Engine/src/actions/run-experiment.deps.ts", "symbol": "BuildProductionExperimentDeps", "pattern": "export async function BuildProductionExperimentDeps(", "lineHint": 65, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-action-catch", "file": "packages/AI/PredictiveStudio/Engine/src/actions/run-experiment.action.ts", "symbol": "protected async InternalRunAction(", "pattern": "return this.fail('EXPERIMENT_FAILED', `Experiment session failed:", "lineHint": 80, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-op-delegation", "file": "packages/AI/PredictiveStudio/Engine/src/operations/delegation.ts", "symbol": "RunExperimentSessionViaOrchestrator", "pattern": "return orchestrator.runSession(plan, await BuildProductionExperimentDeps(user, provider), options);", "lineHint": 211, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-new-btn", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-experiments.component.ts", "symbol": "PSExperimentsComponent", "pattern": "data-testid=\"ps-experiments-new-btn\"", "lineHint": 93, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-new-btn-empty", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-experiments.component.ts", "symbol": "PSExperimentsComponent", "pattern": "data-testid=\"ps-experiments-new-btn-empty\"", "lineHint": 65, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-empty-copy", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-experiments.component.ts", "symbol": "ps-experiments-empty", "pattern": "<p>Launch an experiment to watch the Model Dev Agent search algorithms and feature sets in waves, or configure a manual multi-algorithm tournament.</p>", "lineHint": 63, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-controls", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-experiments.component.ts", "symbol": "canPause", "pattern": "@if (canPause) {", "lineHint": 96, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-modal-op", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-run-experiment-modal.component.ts", "symbol": "PSRunExperimentModalComponent", "pattern": "const op = new PredictiveStudioStartExperimentSessionOperation();", "lineHint": 595, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-agent-run-experiment", "file": "metadata/agents/.model-development-agent.json", "symbol": "Model Development Agent", "pattern": "\"ActionID\": \"@lookup:MJ: Actions.Name=Run Experiment Session\",", "lineHint": 45, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-agent-description", "file": "metadata/agents/.model-development-agent.json", "symbol": "Model Development Agent", "pattern": "drives the deterministic experiment session through the Run Experiment Session action", "lineHint": 6, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-prompt-tool", "file": "metadata/prompts/templates/model-development-agent/model-development-agent.template.md", "symbol": "You also have **tools (actions)**", "pattern": "- **Run Experiment Session** — the deterministic engine.", "lineHint": 26, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-prompt-approve", "file": "metadata/prompts/templates/model-development-agent/model-development-agent.template.md", "symbol": "### 2. Approve", "pattern": "- **Do not call Run Experiment Session until the user clearly approves.**", "lineHint": 50, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-prompt-execute", "file": "metadata/prompts/templates/model-development-agent/model-development-agent.template.md", "symbol": "### 3. Execute (deterministic)", "pattern": "- Call **Run Experiment Session** with the approved plan.", "lineHint": 54, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-prompt-workbench", "file": "metadata/prompts/templates/model-development-agent/model-development-agent.template.md", "symbol": "### 4. Report", "pattern": "or launch manual experiment sessions anytime in the **Experiments** tab", "lineHint": 60, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-prompt-json-description", "file": "metadata/prompts/.model-development-agent-prompts.json", "symbol": "Model Development Agent - Main Prompt", "pattern": "gates on approval, drives the deterministic experiment session,", "lineHint": 5, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-maint-job-status", "file": "metadata/scheduled-jobs/.predictive-studio-maintenance-job.json", "symbol": "2CCE4280-9B29-4DCC-86A4-E5AF765909D1", "pattern": "\"Status\": \"Disabled\",", "lineHint": 9, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-maint-job-name", "file": "metadata/scheduled-jobs/.predictive-studio-maintenance-job.json", "symbol": "2CCE4280-9B29-4DCC-86A4-E5AF765909D1", "pattern": "\"Name\": \"Predictive Studio Maintenance\",", "lineHint": 4, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-scheduler-active-only", "file": "packages/Scheduling/engine/src/ScheduledJobEngine.ts", "symbol": "ScheduledJobEngine", "pattern": "if (job.Status !== 'Active') {", "lineHint": 860, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-section7", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "## 7. The experiment engine", "pattern": "## 7. The experiment engine — a generic agentic-search primitive", "lineHint": 453, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-waves", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 7.1 The wave orchestrator", "pattern": "and runs iterations in **waves through Record Set Processing**:", "lineHint": 476, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-paused", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 7.1 The wave orchestrator", "pattern": "PAUSE([\"Status='Paused'<br/>(clean, resumable)\"])", "lineHint": 487, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-budget", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 7.1 The wave orchestrator", "pattern": "> **The budget gate is enforced *inside* the bounded runner, not just between waves.**", "lineHint": 500, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-process-run", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "### 7.1 The wave orchestrator", "pattern": "A session may spawn **one Process Run per wave**", "lineHint": 502, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-agent-intro", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "## 12. The Model Development Agent", "pattern": "get approval, then execute mostly with deterministic code (the `ExperimentOrchestrator`)", "lineHint": 711, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-agent-diagram", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "## 12. The Model Development Agent", "pattern": "ORCH[ExperimentOrchestrator] --> RUNS[\"waves through Record Set Processing<br/>train/score · prune · budget-gate · leaderboard\"]", "lineHint": 727, "atCommit": "141d8d065c"},
  {"id": "ctn-c6-guide-maintenance", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "## 14. The maintenance loop", "pattern": "Maintenance is a **co-equal pillar**, not an afterthought.", "lineHint": 834, "atCommit": "141d8d065c"},
  {"id": "bridge-mjtest-by-name", "file": "packages/TestingFramework/CLI/src/commands/run.ts", "symbol": "else if (flags.name)", "pattern": "test = engine.GetTestByName(flags.name);", "lineHint": 112, "atCommit": "141d8d065c"},
  {"id": "bridge-mjtest-output-file", "file": "packages/TestingFramework/CLI/src/commands/run.ts", "symbol": "formatTestResult", "pattern": "OutputFormatter.writeToFile(output, flags.output);", "lineHint": 227, "atCommit": "141d8d065c"},
  {"id": "bridge-mjtest-exit", "file": "packages/TestingFramework/CLI/src/commands/run.ts", "pattern": "process.exit(result.status === 'Passed' || result.status === 'Skipped' ? 0 : 1);", "lineHint": 233, "atCommit": "141d8d065c"},
  {"id": "bridge-check-modules", "file": "mj.config.cjs", "symbol": "checkModules", "pattern": "packages/TestingFramework/integration-test-suite/dist/index.js", "lineHint": 67, "atCommit": "141d8d065c"},
  {"id": "ro-generic-mutation", "file": "packages/MJServer/src/resolvers/ExecuteRemoteOperationResolver.ts", "symbol": "export class ExecuteRemoteOperationInput", "pattern": "async ExecuteRemoteOperation(", "lineHint": 73, "atCommit": "141d8d065c"},
  {"id": "story-agent-run-message", "file": "packages/MJCoreEntities/src/generated/entities/__mj.ts", "symbol": "export class MJAIAgentRunEntity", "pattern": "get Message(): string | null {", "lineHint": 46871, "atCommit": "141d8d065c"},
  {"id": "story-max-iterations", "file": "packages/AI/CorePlus/src/agent-types.ts", "symbol": "export type ExecuteAgentResult", "pattern": "absoluteMaxIterations?: number;", "lineHint": 1723, "atCommit": "141d8d065c"},
  {"id": "auto-g06-agent-model", "file": "metadata/prompts/.model-development-agent-prompts.json", "symbol": "Model Development Agent - Main Prompt", "pattern": "\"ModelID\": \"@lookup:MJ: AI Models.Name=Gemini 3.8 Flash\",", "lineHint": 21, "atCommit": "141d8d065c"},
  {"id": "auto-g06-gemini-driver", "file": "metadata/ai-models/.ai-models.json", "symbol": "\"Name\": \"Gemini 3.8 Flash\",", "pattern": "\"APIName\": \"gemini-3.8-flash\",", "lineHint": 25234, "atCommit": "141d8d065c"},
  {"id": "auto-g06-live-keys-secret", "file": ".github/workflows/integration.yml", "symbol": "INTEGRATION_LIVE_MODEL_KEYS", "pattern": "LIVE_KEYS: ${{ secrets.INTEGRATION_LIVE_MODEL_KEYS }}", "lineHint": 409, "atCommit": "141d8d065c"},
  {"id": "auto-ui-prime-auth-creds", "file": "e2e/overlay/prime-auth.mjs", "symbol": "HEADLESS_AUTH0_TEST_PWD", "pattern": "const USER = process.env.MJ_TEST_USER ?? pick('HEADLESS_AUTH0_TEST_UID');", "lineHint": 24, "atCommit": "141d8d065c"},
  {"id": "auto-ui-prime-auth-ok", "file": "e2e/overlay/prime-auth.mjs", "symbol": "MISSING_CREDS", "pattern": "LOGIN_OK — profile primed", "lineHint": 64, "atCommit": "141d8d065c"},
  {"id": "auto-ui-e2e-script", "file": "package.json", "symbol": "\"@playwright/test\"", "pattern": "\"test:e2e\": \"playwright test --config e2e/playwright.config.ts\",", "lineHint": 135, "atCommit": "141d8d065c"},
  {"id": "auto-ui-e2e-testmatch", "file": "e2e/playwright.config.ts", "symbol": "PW_USER_DATA_DIR", "pattern": "testMatch: '**/*.spec.ts',", "lineHint": 63, "atCommit": "141d8d065c"},
  {"id": "auto-ui-card-title", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/engine/predictive-studio.engine.ts", "symbol": "public ModelDisplayName(model: MJMLModelEntity): string {", "pattern": "return pipeline?.Name ?? model.Pipeline ?? `Model v${model.Version}`;", "lineHint": 216, "atCommit": "141d8d065c"},
  {"id": "auto-ui-open-card", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "ps-prediction-card", "pattern": "data-testid=\"ps-open-prediction\"", "lineHint": 92, "atCommit": "141d8d065c"},
  {"id": "auto-ui-list-result", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts", "symbol": "data-testid=\"ps-act-list\"", "pattern": "data-testid=\"ps-list-result\"", "lineHint": 151, "atCommit": "141d8d065c"},
  {"id": "auto-ui-grid-search", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.html", "symbol": "pg-search-box", "pattern": "class=\"pg-search-input\"", "lineHint": 9, "atCommit": "141d8d065c"},
  {"id": "auto-ui-grid-search-drivers", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.ts", "symbol": "private applyFilter(): void {", "pattern": "r.drivers.some((d) => d.label.toLowerCase().includes(q)),", "lineHint": 1287, "atCommit": "141d8d065c"},
  {"id": "auto-ui-grid-top-chip", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-predictions-grid.component.ts", "symbol": "headerName: 'Key Factors',", "pattern": "return `<span class=\"ps-why-chip ${cls}\" title=\"${label}\">", "lineHint": 611, "atCommit": "141d8d065c"},
  {"id": "auto-ui-drawer-escape", "file": "packages/Angular/Generic/ui-components/src/lib/slide-panel/slide-panel.component.ts", "symbol": "selector: 'mj-slide-panel'", "pattern": "@HostListener('document:keydown.escape')", "lineHint": 119, "atCommit": "141d8d065c"},
  {"id": "auto-ui-studio-section", "file": "packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-studio-resource.component.ts", "symbol": "@case ('experiments')", "pattern": "Round-trips through the `section` query param.", "lineHint": 214, "atCommit": "141d8d065c"},
  {"id": "auto-signoff-rule", "file": "packages/AI/PredictiveStudio/Engine/src/actions/promote-model.gate.ts", "symbol": "if (leakage.flagged) {", "pattern": "return { kind: 'signoff-reason-required', topFeature: leakage.topFeature, topShare: leakage.topShare };", "lineHint": 62, "atCommit": "141d8d065c"},
  {"id": "auto-guide-human-signoff", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "accidentally peeking at the answer", "pattern": "until a human signs off with an auditable reason", "lineHint": 301, "atCommit": "141d8d065c"},
  {"id": "auto-guide-draft-for-human", "file": "guides/PREDICTIVE_STUDIO_GUIDE.md", "symbol": "PipelineAutoTrainer", "pattern": "a leakage-flagged model is refused and stays Draft for a human)", "lineHint": 447, "atCommit": "141d8d065c"},
  {"id": "auto-run-note-human", "file": "packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts", "symbol": "private buildRunNotes(dominance: DominanceResult): string {", "pattern": "This often means we are accidentally peeking at the answer. A human should confirm this is legitimate ", "lineHint": 223, "atCommit": "141d8d065c"}
]
```

## 6. Milestones (Ready)

Order: M1 → M2 → M3 → M4 → M5 → M6 → C1–C6 (containment, below M6) → M-final. M2 and M3's Loom companion tasks
(M3.1–M3.3) are `parallel-safe` with each other (sub-branches `…--m2`, `…--m3`, conventions §3); C1 and C3 are
`parallel-safe` with each other (`…--c1`, `…--c3`); everything else is sequential. At every milestone start: `git fetch origin && git merge origin/next`, rebuild touched packages, run
the previous milestone's exit tests, and run refresh trigger (c) if the merge touched an anchored file.

**Coding standards (D-035, `reference/coding-standards.md`).** Every code block below is written to the standards and
is transcribed as given; a change an implementer must make to it is a standards finding recorded in §9. The rules
these blocks follow and an implementer must keep: exported functions and public/protected members PascalCase, private
and module-internal camelCase (ruling S4: a new `protected` member is PascalCase, an override keeps its parent's
casing); conversion and factory logic as static members of the owning class; `||` for fallbacks, `??` only where `0`,
`''` or `false` is a legitimate value (each such `??` carries a comment); strict equality only (`=== undefined` /
`=== null`, never `== null`); status unions derived from the generated entity (`MJMLModelEntity['Status']`), never
`string`; typed error classes with structured fields, never control flow on message text; the passed provider
(`ctx.Provider`, `this.ProviderToUse`), never a bare `new Metadata()`/`new RunView()` in new server code; top-level
`await` in scripts, never `.then()`/`.catch()` chains; every net-new `unknown` carries a comment naming the boundary.

**Mutation checks (conventions §5a; ruling S1).** Every task that adds a guard ends with a mutation table: flip the
guard, run the named test, confirm it goes red, restore it. Record each row's result (red test name, or "not exposed"
with the reason) in the task's §11 handoff entry; M-final.6 copies the table into the PR description's "Verification
(run by AI)" section. A guard no mutation can expose is either given a test in the same task or listed in the PR
description as unverified by mutation, with the reason.

### M1 — Dev environment and install path  ·  parallel-safe: no  ·  depends on: —

**Outcome:** PS builds from a fresh clone with one documented command; the sidecar venv sets itself up on a machine
whose default Python is 3.14 (or fails saying exactly what to install); `PREDICTIVE_STUDIO_PYTHON` works everywhere a
Python interpreter is chosen; `.venv` symlinks are ignored; scipy is pinned; CodeGen's first run after
`spCreateVirtualEntity` succeeds; `mj sync push` tolerates a missing `filePattern`; CodeGen never drops a layered
entity's CRUD procs when their replacement cannot compile. Closes F-ENV-1, -2, -3, -7, -9, -12, F-L2-1, F-DOC-25.

#### Task M1.1: Interpreter probing for `setup:python` (F-ENV-2)

**Files:** Create `packages/AI/PredictiveStudio/Sidecar/scripts/python-probe.mjs`,
`packages/AI/PredictiveStudio/Sidecar/scripts/python-probe.d.mts`,
`packages/AI/PredictiveStudio/Sidecar/src/__tests__/python-probe.test.ts` · Modify
`packages/AI/PredictiveStudio/Sidecar/scripts/setup-python.mjs` (full rewrite below)

**Interfaces:** Produces `PythonProbe.Select(candidates, probe)`, `PythonProbe.FormatReport(probed)` (static members of
one `PythonProbe` class — the probing logic has one owner, coding standards §2); `setup-python.mjs` flags
`--python <cmd>`, `--venv <dir>`, `--requirements <file>` (consumed by M5.1).

- [ ] Step 1: Write the failing test `src/__tests__/python-probe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PythonProbe } from '../../scripts/python-probe.mjs';
import type { ProbeResult } from '../../scripts/python-probe.mjs';

/** A probe that answers from a table instead of spawning interpreters. */
function fakeProbe(table: Record<string, string>): (command: string) => ProbeResult {
  return (command: string): ProbeResult => {
    const out = table[command];
    return out === undefined
      ? { Command: command, Found: false, Version: null }
      : { Command: command, Found: true, Version: PythonProbe.ParseVersion(out) };
  };
}

const CANDIDATES = ['python3.11', 'python3.12', 'python3', 'python'];

describe('PythonProbe', () => {
  it('parses `python --version` output', () => {
    expect(PythonProbe.ParseVersion('Python 3.11.15')).toEqual({ Major: 3, Minor: 11, Patch: 15 });
    expect(PythonProbe.ParseVersion('Python 3.14.4\n')).toEqual({ Major: 3, Minor: 14, Patch: 4 });
    expect(PythonProbe.ParseVersion('not python')).toBeNull();
  });

  it('accepts only CPython 3.11 and 3.12', () => {
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 11, Patch: 0 })).toBe(true);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 12, Patch: 11 })).toBe(true);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 10, Patch: 9 })).toBe(false);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 13, Patch: 0 })).toBe(false);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 14, Patch: 4 })).toBe(false);
    expect(PythonProbe.IsSupported({ Major: 2, Minor: 11, Patch: 0 })).toBe(false);
    expect(PythonProbe.IsSupported(null)).toBe(false);
  });

  it('skips a default python3 of 3.14 and picks python3.12', () => {
    const r = PythonProbe.Select(CANDIDATES, fakeProbe({ 'python3.12': 'Python 3.12.11', python3: 'Python 3.14.4' }));
    expect(r.Ok).toBe(true);
    if (r.Ok) {
      expect(r.Command).toBe('python3.12');
      expect(r.Version.Minor).toBe(12);
    }
  });

  it('prefers python3.11 when both are present', () => {
    const r = PythonProbe.Select(CANDIDATES, fakeProbe({ 'python3.11': 'Python 3.11.15', 'python3.12': 'Python 3.12.11' }));
    expect(r.Ok && r.Command).toBe('python3.11');
  });

  it('fails with a report naming every probed interpreter when none is supported', () => {
    const r = PythonProbe.Select(CANDIDATES, fakeProbe({ python3: 'Python 3.14.4' }));
    expect(r.Ok).toBe(false);
    const report = PythonProbe.FormatReport(r.Probed);
    expect(report).toContain('python3.11: not found');
    expect(report).toContain('python3: 3.14.4');
    expect(report).toContain('--python');
  });
});
```

- [ ] Step 2: Run it; expected failure:

```bash
cd $MJ/packages/AI/PredictiveStudio/Sidecar && pnpm test -- python-probe
# → FAIL src/__tests__/python-probe.test.ts — Failed to resolve import "../../scripts/python-probe.mjs"
```

- [ ] Step 3: Implement `scripts/python-probe.mjs`:

```js
/**
 * python-probe.mjs — choose a Python interpreter the sidecar's pinned requirements install on.
 *
 * The pins set the window: numpy==1.26.4 has no wheels for CPython >= 3.13, and scipy==1.17.1 needs >= 3.11.
 * So only 3.11 and 3.12 are accepted. Pure functions plus one spawn-based probe, so the logic is unit-tested.
 */
import { spawnSync } from 'node:child_process';

/** Interpreter probing for the sidecar's pinned requirements. Static members only: the class is the logic's owner. */
export class PythonProbe {
  static SupportedMinors = Object.freeze([11, 12]);
  static DefaultCandidates = Object.freeze(['python3.11', 'python3.12', 'python3', 'python']);

  /** `{ Major, Minor, Patch }` from `python --version` output; null when the text is not a CPython version line. */
  static ParseVersion(text) {
    const match = /Python (\d+)\.(\d+)\.(\d+)/.exec(text || '');
    return match ? { Major: Number(match[1]), Minor: Number(match[2]), Patch: Number(match[3]) } : null;
  }

  /** True only for CPython 3.11 / 3.12 (the window the pins install on). */
  static IsSupported(version) {
    return version !== null && version.Major === 3 && PythonProbe.SupportedMinors.includes(version.Minor);
  }

  /** Runs `<command> --version`; a spawn error or a non-zero exit means "not found". */
  static ProbeCommand(command) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      return { Command: command, Found: false, Version: null };
    }
    return { Command: command, Found: true, Version: PythonProbe.ParseVersion(`${result.stdout || ''}${result.stderr || ''}`) };
  }

  /** The first candidate that is found and supported, with everything probed (for the failure report). */
  static Select(candidates, probe = PythonProbe.ProbeCommand) {
    const probed = candidates.map((candidate) => probe(candidate));
    const chosen = probed.find((p) => p.Found && PythonProbe.IsSupported(p.Version));
    return chosen
      ? { Ok: true, Command: chosen.Command, Version: chosen.Version, Probed: probed }
      : { Ok: false, Probed: probed };
  }

  /** The multi-line failure message: every probed interpreter and how to fix it. */
  static FormatReport(probed) {
    return [
      `No supported Python found. The Predictive Studio sidecar pins need CPython 3.${PythonProbe.SupportedMinors.join(' or 3.')}.`,
      'Probed:',
      ...probed.map((p) => `  ${p.Command}: ${PythonProbe.#describeProbe(p)}`),
      'Install one (macOS: brew install python@3.11; Debian/Ubuntu: apt-get install python3.11 python3.11-venv),',
      'or name an interpreter explicitly: node scripts/setup-python.mjs --python /path/to/python3.11',
    ].join('\n');
  }

  static #describeProbe(p) {
    if (!p.Found) return 'not found';
    if (!p.Version) return 'unrecognised --version output';
    return `${p.Version.Major}.${p.Version.Minor}.${p.Version.Patch}`;
  }
}
```

`scripts/python-probe.d.mts`:

```ts
export interface PythonVersion { Major: number; Minor: number; Patch: number }
export interface ProbeResult { Command: string; Found: boolean; Version: PythonVersion | null }
export type SelectResult =
  | { Ok: true; Command: string; Version: PythonVersion; Probed: ProbeResult[] }
  | { Ok: false; Probed: ProbeResult[] };
export declare class PythonProbe {
  static readonly SupportedMinors: readonly number[];
  static readonly DefaultCandidates: readonly string[];
  static ParseVersion(text: string | null | undefined): PythonVersion | null;
  static IsSupported(version: PythonVersion | null): boolean;
  static ProbeCommand(command: string): ProbeResult;
  static Select(candidates: readonly string[], probe?: (command: string) => ProbeResult): SelectResult;
  static FormatReport(probed: readonly ProbeResult[]): string;
}
```

Rewrite `scripts/setup-python.mjs`:

```js
#!/usr/bin/env node
/**
 * setup-python.mjs — create a venv on a supported interpreter (CPython 3.11 / 3.12) and install pinned requirements.
 *
 *   node scripts/setup-python.mjs                                   # .venv at the package root + src/python/requirements.txt
 *   node scripts/setup-python.mjs --python /opt/homebrew/bin/python3.11
 *   node scripts/setup-python.mjs --venv <dir> --requirements <file>  # any venv built on these pins (the truth suite)
 *
 * macOS: xgboost / lightgbm need an OpenMP runtime (`brew install libomp`); MLSidecar and run-pytest.mjs add
 * /opt/homebrew/opt/libomp/lib to DYLD_LIBRARY_PATH. Linux: libgomp1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PythonProbe } from './python-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const { values } = parseArgs({
  options: { python: { type: 'string' }, venv: { type: 'string' }, requirements: { type: 'string' } },
});
const venvDir = path.resolve(values.venv || path.join(packageRoot, '.venv'));
const requirements = path.resolve(values.requirements || path.join(packageRoot, 'src', 'python', 'requirements.txt'));
const venvPython = path.join(venvDir, 'bin', 'python');

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
    process.exit(result.status || 1); // status is non-zero or null here; null (killed by a signal) exits 1
  }
}

if (!existsSync(requirements)) {
  console.error(`requirements file not found at ${requirements}`);
  process.exit(1);
}

if (existsSync(venvPython)) {
  const existing = PythonProbe.ProbeCommand(venvPython);
  if (!PythonProbe.IsSupported(existing.Version)) {
    const v = existing.Version ? `${existing.Version.Major}.${existing.Version.Minor}.${existing.Version.Patch}` : 'an unknown Python';
    console.error(`The venv at ${venvDir} runs ${v}; the pins need 3.11 or 3.12. Delete it (rm -rf "${venvDir}") and re-run.`);
    process.exit(1);
  }
  console.log(`Reusing venv at ${venvDir} (Python ${existing.Version.Major}.${existing.Version.Minor}.${existing.Version.Patch})`);
} else {
  const selection = PythonProbe.Select(values.python ? [values.python] : PythonProbe.DefaultCandidates);
  if (!selection.Ok) {
    console.error(PythonProbe.FormatReport(selection.Probed));
    process.exit(1);
  }
  console.log(`Creating venv at ${venvDir} with ${selection.Command} (Python ${selection.Version.Major}.${selection.Version.Minor}.${selection.Version.Patch})`);
  run(selection.Command, ['-m', 'venv', venvDir]);
}

run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPython, ['-m', 'pip', 'install', '-r', requirements]);
console.log('\nPython environment ready:', venvPython);
if (process.platform === 'darwin') {
  console.log('macOS: ensure libomp is installed (`brew install libomp`) so xgboost/lightgbm load.');
}
```

- [ ] Step 4: Run it; expected pass:

```bash
cd $MJ/packages/AI/PredictiveStudio/Sidecar && pnpm test
# → Test Files 3 passed (3) · Tests 20 passed (20)   (15 existing + 5 new)
```

- [ ] Step 5: Runtime verification on this machine (`python3` is 3.14.4):

```bash
cd $MJ/packages/AI/PredictiveStudio/Sidecar && rm -rf .venv && pnpm run setup:python 2>&1 | head -3
# → Creating venv at …/Sidecar/.venv with python3.11 (Python 3.11.15)
PATH=/usr/bin:/bin node scripts/setup-python.mjs --venv /tmp/ps-probe-venv 2>&1 | head -8; echo "exit=$?"
# → No supported Python found … Probed: python3.11: not found … python3: 3.9.6 (macOS system python) … exit=1
python3 -m venv /tmp/ps-probe-314 && node scripts/setup-python.mjs --venv /tmp/ps-probe-314 2>&1 | tail -1; echo "exit=$?"
# → The venv at /tmp/ps-probe-314 runs 3.14.4; the pins need 3.11 or 3.12. Delete it … exit=1   (the existing-venv guard)
rm -rf /tmp/ps-probe-314
```

- [ ] Step 6: Mutation checks (program/conventions.md §5a; recorded in §11 and the PR description, see "Mutation checks"
  under §6). Flip each guard, run the named test, confirm it goes red, restore:

| Guard | Mutation | Must go red |
|---|---|---|
| `IsSupported` major check | drop `version.Major === 3 &&` | `accepts only CPython 3.11 and 3.12` (the 2.11 case) |
| `IsSupported` null check | drop `version !== null &&` | `accepts only CPython 3.11 and 3.12` (`IsSupported(null)` throws) |
| `SupportedMinors` window | `[11, 12, 13]` | `accepts only CPython 3.11 and 3.12` |
| `Select` order | `probed.findLast(…)` | `prefers python3.11 when both are present` |
| existing-venv version guard (`setup-python.mjs`) | `if (false)` | Step 5's third command exits 0 and installs into the 3.14 venv |

#### Task M1.2: `PREDICTIVE_STUDIO_PYTHON` (F-ENV-3)

**Files:** Modify `packages/AI/PredictiveStudio/Sidecar/src/ml-sidecar.ts`, `…/Sidecar/src/index.ts`,
`…/Sidecar/scripts/run-pytest.mjs`, `…/Engine/src/__tests__/integration/live-train-score.integration.test.ts` ·
Test `…/Sidecar/src/__tests__/python-path.test.ts`

**Interfaces:** Produces `MLSidecar.ResolvePython(explicit, env, bundled): string` and `MLSidecar.PythonEnvVar`
(public statics of the class that owns the choice; consumed by M5.7's sidecar runner through `new MLSidecar()`).

- [ ] Step 1: Failing test `src/__tests__/python-path.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MLSidecar } from '../ml-sidecar.js';

describe('MLSidecar.ResolvePython', () => {
  it('prefers the explicit pythonPath option', () => {
    expect(MLSidecar.ResolvePython('/opt/py/bin/python', { [MLSidecar.PythonEnvVar]: '/env/python' }, '/venv/bin/python'))
      .toBe('/opt/py/bin/python');
  });
  it('then PREDICTIVE_STUDIO_PYTHON (trimmed)', () => {
    expect(MLSidecar.ResolvePython(undefined, { PREDICTIVE_STUDIO_PYTHON: '  /env/python ' }, '/venv/bin/python')).toBe('/env/python');
  });
  it('then the bundled venv', () => {
    expect(MLSidecar.ResolvePython(undefined, {}, '/venv/bin/python')).toBe('/venv/bin/python');
  });
  it('then python3, ignoring a blank env value and a blank explicit option', () => {
    expect(MLSidecar.ResolvePython('  ', { PREDICTIVE_STUDIO_PYTHON: '   ' }, null)).toBe('python3');
  });
});
```

- [ ] Step 2: `pnpm test -- python-path` → `TypeError: MLSidecar.ResolvePython is not a function`.
- [ ] Step 3: Implement. In `ml-sidecar.ts`, add to `class MLSidecar` next to `DefaultStartupTimeoutMs`:

```ts
  /** Env var naming an explicit interpreter for the managed sidecar (and its test runners). */
  public static readonly PythonEnvVar = 'PREDICTIVE_STUDIO_PYTHON';

  /**
   * Pick the managed sidecar's interpreter: the explicit `pythonPath` option, then `PREDICTIVE_STUDIO_PYTHON`,
   * then the package's bundled `.venv`, then `python3`. Blank strings count as absent at every step.
   */
  public static ResolvePython(explicit: string | undefined, env: NodeJS.ProcessEnv, bundled: string | null): string {
    return explicit?.trim() || env[MLSidecar.PythonEnvVar]?.trim() || bundled || 'python3';
  }
```

and in the constructor replace `this.pythonPath = options?.pythonPath ?? resolveBundledPython() ?? 'python3';` with
`this.pythonPath = MLSidecar.ResolvePython(options?.pythonPath, process.env, resolveBundledPython());`. Update the
`pythonPath` doc comment (`ml-sidecar.ts:40-43`) to name the env var. `src/index.ts` is unchanged (it already exports
`MLSidecar`).

In `scripts/run-pytest.mjs` replace the `venvPython` constant and its existence check with:

```js
const fromEnv = process.env.PREDICTIVE_STUDIO_PYTHON?.trim();
const venvPython = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(packageRoot, '.venv', 'bin', 'python');
if (!existsSync(venvPython)) {
  console.error(`Python not found at ${venvPython}. Run \`pnpm run setup:python\` or set PREDICTIVE_STUDIO_PYTHON.`);
  process.exit(1);
}
```

In `live-train-score.integration.test.ts` replace `resolveVenvPython()` with:

```ts
/** The sidecar interpreter: PREDICTIVE_STUDIO_PYTHON when set, else the bundled Sidecar venv; null when neither exists. */
function resolveVenvPython(): string | null {
  const fromEnv = process.env.PREDICTIVE_STUDIO_PYTHON?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return existsSync(fromEnv) ? fromEnv : null;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const venv = path.resolve(here, '..', '..', '..', '..', 'Sidecar', '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : null;
}
```

and update its skip message to mention `PREDICTIVE_STUDIO_PYTHON`.
- [ ] Step 4: `cd …/Sidecar && pnpm test` → `Tests 24 passed (24)`; `pnpm run build` → exit 0.
- [ ] Step 5: Runtime: point the env var at a venv that is **not** the bundled one and run both consumers:

```bash
python3.12 -m venv /tmp/ps-py312 && /tmp/ps-py312/bin/pip install -q -r $MJ/packages/AI/PredictiveStudio/Sidecar/src/python/requirements.txt
mv $MJ/packages/AI/PredictiveStudio/Sidecar/.venv /tmp/ps-bundled-aside
PREDICTIVE_STUDIO_PYTHON=/tmp/ps-py312/bin/python pnpm --filter @memberjunction/predictive-studio-sidecar run test:python 2>&1 | tail -1
# → 56 passed
PREDICTIVE_STUDIO_PYTHON=/tmp/ps-py312/bin/python pnpm --filter @memberjunction/predictive-studio run test:integration 2>&1 | grep -E "Tests"
# → Tests  3 passed (3)
mv /tmp/ps-bundled-aside $MJ/packages/AI/PredictiveStudio/Sidecar/.venv
```

- [ ] Step 6: Mutation checks (§6 shared notes):

| Guard | Mutation | Must go red |
|---|---|---|
| explicit option first | drop `explicit?.trim() \|\|` | `prefers the explicit pythonPath option` |
| env value trimmed | `env[…]` without `?.trim()` | `then PREDICTIVE_STUDIO_PYTHON (trimmed)` |
| blank values are absent | `??` instead of `\|\|` in the chain | `then python3, ignoring a blank env value and a blank explicit option` |
| `run-pytest.mjs` / integration test honour the env var | read `.venv` unconditionally | Step 5's two commands fail with `Python not found` / skip (the bundled venv is moved aside) |

#### Task M1.3: Ignore `.venv` symlinks (F-ENV-9)

**Files:** Modify `packages/AI/PredictiveStudio/Sidecar/.gitignore` (line 1 `.venv/` → `.venv`)

- [ ] Step 1 (failing check): `cd …/Sidecar && mv .venv /tmp/v && ln -s /tmp/v .venv && git check-ignore -v .venv; echo exit=$?` → `exit=1` (not ignored).
- [ ] Step 2: change line 1 to `.venv` (no trailing slash: a pattern with a slash matches only directories; a symlink is a file to git).
- [ ] Step 3: `git check-ignore -v .venv` → `packages/AI/PredictiveStudio/Sidecar/.gitignore:1:.venv	.venv`; then `rm .venv && mv /tmp/v .venv`.

#### Task M1.4: Pin scipy; prove the pins install on 3.11 and 3.12 (F-ENV-2)

**Files:** Modify `packages/AI/PredictiveStudio/Sidecar/src/python/requirements.txt`

- [ ] Step 1: Replace the header line 1 with `# Predictive Studio ML sidecar — pinned for CPython 3.11–3.12 (3.11 in Docker). numpy 1.26.4 has no wheels for >= 3.13.`
  and add after `numpy==1.26.4`: `scipy==1.17.1` with the comment `# transitive via scikit-learn; pinned so the sidecar and the truth-suite judges compute with the same scipy`.
- [ ] Step 2: Fresh installs on both interpreters:

```bash
for v in 3.11 3.12; do rm -rf /tmp/ps-$v && python$v -m venv /tmp/ps-$v && /tmp/ps-$v/bin/pip install -q -r $MJ/packages/AI/PredictiveStudio/Sidecar/src/python/requirements.txt && /tmp/ps-$v/bin/python -c "import numpy,scipy,sklearn,xgboost,lightgbm;print('$v',numpy.__version__,scipy.__version__,sklearn.__version__)"; done
# → 3.11 1.26.4 1.17.1 1.4.2
# → 3.12 1.26.4 1.17.1 1.4.2
```

- [ ] Step 3: `pnpm --filter @memberjunction/predictive-studio-sidecar run test:python 2>&1 | tail -1` → `56 passed`
  (54 means LightGBM did not import — fix libomp before continuing; `_families()` silently drops cases otherwise).
- [ ] Step 4: Dockerfile check: `grep -rn "python:3" $MJ/packages/AI/PredictiveStudio $MJ/docker 2>/dev/null` — every
  sidecar image base must be 3.11 or 3.12; record the lines found in the handoff entry.

#### Task M1.5: Documented build order (F-ENV-1, F-DOC-25)

**Files:** Modify `packages/AI/PredictiveStudio/Sidecar/README.md`, `packages/AI/PredictiveStudio/Engine/README.md`,
`packages/AI/PredictiveStudio/README.md`, `guides/PREDICTIVE_STUDIO_GUIDE.md` §2.2

- [ ] Step 1 (reproduce the defect on a fresh clone):

```bash
git -C $MJ worktree add /tmp/ps-fresh origin/next && cd /tmp/ps-fresh && pnpm install --frozen-lockfile >/dev/null
(cd packages/AI/PredictiveStudio/Engine && pnpm run build 2>&1 | grep -c "TS2307")   # → a count > 0
```

- [ ] Step 2 (the documented command works):

```bash
cd /tmp/ps-fresh && npx turbo run build --filter=@memberjunction/predictive-studio... 2>&1 | tail -3   # → Tasks: N successful, N total
cd packages/AI/PredictiveStudio/Sidecar && node scripts/setup-python.mjs | tail -1                    # → Python environment ready: …
cd ../Engine && pnpm run test:integration 2>&1 | grep Tests                                          # → Tests  3 passed (3)
git -C $MJ worktree remove --force /tmp/ps-fresh
```

- [ ] Step 3: Write the "One-time setup" block into all four documents (guide §2.2 replaces its code block and adds the
  paragraph; READMEs replace their `npm run setup:python` lines):

```markdown
**One-time setup (fresh clone).** Predictive Studio's packages depend on other workspace packages, so build them
together, never one by one (a per-package `tsc` on a fresh clone fails with `TS2307 Cannot find module
'@memberjunction/core'`):

    pnpm install                                                      # repo root
    npx turbo run build --filter=@memberjunction/predictive-studio...  # PS + everything it depends on
    pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python

`setup:python` needs CPython 3.11 or 3.12 (numpy 1.26.4 has no wheels for 3.13+); it tries `python3.11`, `python3.12`,
`python3`, `python` and stops with the list it probed if none fits. Pass `--python <path>` to choose one. On macOS
also `brew install libomp` (XGBoost/LightGBM). To run the sidecar or its tests on another interpreter, set
`PREDICTIVE_STUDIO_PYTHON=<path to python>`.
```

#### Task M1.6: Verify upstream CodeGen virtual-entity metadata refresh (F-ENV-12) — read-only (§9 D2-43)

**Files:** None modified in `packages/CodeGenLib/**` (upstream `next` already refreshes metadata before `manageVirtualEntities` at `packages/CodeGenLib/src/Database/manage-metadata.ts:276-283` and tests it in `packages/CodeGenLib/src/__tests__/manage-metadata.test.ts`).

- [ ] Step 1: Verify the upstream fix and unit tests on `next`:

```bash
pnpm --dir $MJ/packages/CodeGenLib test -- manage-metadata
pnpm --dir $MJ/packages/CodeGenLib build
```

- [ ] Step 2: Runtime verification on your database (done once M4.2's `truth-codegen.config.cjs` exists, or with a `/tmp/fenv12/mj.config.cjs` copy):

```bash
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -d "$DB_DATABASE" -Q "
IF SCHEMA_ID('pstruth_fenv12') IS NULL EXEC('CREATE SCHEMA pstruth_fenv12');
EXEC('CREATE VIEW pstruth_fenv12.vwProbe AS SELECT ID, Name, Description, Status, __mj_CreatedAt FROM __mj.vwApplications');
EXEC __mj.spCreateVirtualEntity @Name='PS Truth FENV12 Probe', @BaseView='vwProbe', @SchemaName='pstruth_fenv12', @PrimaryKeyFieldName='ID';"
mkdir -p /tmp/fenv12 && sed "s/includeSchemas: \['pstruth'\]/includeSchemas: ['pstruth_fenv12']/" \
  $MJ/packages/AI/PredictiveStudio/TruthSuite/codegen/truth-codegen.config.cjs > /tmp/fenv12/mj.config.cjs
(cd /tmp/fenv12 && node $MJ/packages/MJCLI/bin/run.js codegen --skipfiles); echo "codegen exit=$?"
# → codegen exit=0
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -d "$DB_DATABASE" -Q "SELECT COUNT(*) FROM __mj.EntityField ef JOIN __mj.Entity e ON e.ID=ef.EntityID WHERE e.Name='PS Truth FENV12 Probe'"   # → 5
# cleanup: DELETE the probe's __mj.EntityField rows, then its __mj.Entity row (FK order), DROP VIEW pstruth_fenv12.vwProbe, DROP SCHEMA pstruth_fenv12
```

#### Task M1.7: Verify upstream `mj sync validate` / `push` default `filePattern` (F-L2-1) — read-only (§9 D2-43)

**Files:** None modified in `packages/MetadataSync/**` (upstream `next` already defaults missing `filePattern` to `'*.json'` via `config.filePattern || '*.json'` in `ValidationService.ts:188,1161` and `PushService.ts:1066,2427,2486`, tested in `packages/MetadataSync/src/__tests__/ValidationService.test.ts:522`). Loom's half of F-L2-1 (`emitters/metadata.ts` emitting `filePattern: '*.json'`) still ships in M3.2.

- [ ] Step 1: Verify the upstream MetadataSync unit tests and build on `next`:

```bash
pnpm --dir $MJ/packages/MetadataSync test -- ValidationService
pnpm --dir $MJ/packages/MetadataSync build
```

- [ ] Step 2: Runtime verification — an entity folder with no `filePattern` validates cleanly:

```bash
mkdir -p /tmp/fl21/apps && echo '{ "entity": "MJ: Applications" }' > /tmp/fl21/apps/.mj-sync.json \
  && echo '{ "directoryOrder": ["apps"] }' > /tmp/fl21/.mj-sync.json && echo '[]' > /tmp/fl21/apps/.none.json
pnpm --dir $MJ mj sync validate --dir=/tmp/fl21; echo "exit=$?"     # → exit=0
rm -rf /tmp/fl21
```

#### Task M1.8: Verify upstream layered-entity view/CRUD ordering in CodeGen (F-ENV-7) — read-only (§9 D2-43)

**Files:** None modified in `packages/CodeGenLib/**` (upstream `next` refreshes a layered entity's inner then outer view in `packages/CodeGenLib/src/Config/sql.ts:239-297`, covered by `packages/CodeGenLib/src/__tests__/view-regen.test.ts`; per §9 `D2-43`, PR 2 does not modify `CodeGenLib` so foundational packages stay untouched in this PR).

- [ ] Step 1: Verify the upstream `view-regen` unit tests in `CodeGenLib`:

```bash
pnpm --dir $MJ/packages/CodeGenLib test -- view-regen
```

**Exit tests (M1):**

```bash
cd $MJ/packages/AI/PredictiveStudio/Sidecar && pnpm test && pnpm run build          # → 24 passed; build exit 0
pnpm --filter @memberjunction/predictive-studio-sidecar run test:python | tail -1   # → 56 passed
pnpm --filter @memberjunction/predictive-studio test && pnpm --filter @memberjunction/predictive-studio run test:integration   # → unit N passed; integration 3 passed
cd $MJ/packages/CodeGenLib && pnpm test && pnpm run build                          # → all passed; exit 0 (read-only check)
cd $MJ/packages/MetadataSync && pnpm test && pnpm run build                        # → all passed; exit 0 (read-only check)
```

**Checkpoint commit:** `fix(ps): PR 2 M1 — sidecar Python setup, PREDICTIVE_STUDIO_PYTHON, build order`

### M2 — Gate registry and statistical helpers  ·  parallel-safe: yes (with M3.1–M3.3)  ·  depends on: M1

**Outcome:** the TruthSuite package exists and builds; `gates/gates.json` holds all 111 gates; `pnpm run truth:gates`
lists 111 named tests (12 Phase-0 + 99 others, all stubs at this point) that report `not-implemented`; the registry
validator and the shared 400-seed / Wilson / Hanley–McNeil helpers are unit-tested and reproduce P(pass) 0.969 / 0.023
at n = 400.

#### Task M2.1: Package scaffold

**Files:** Create `packages/AI/PredictiveStudio/TruthSuite/{package.json, tsconfig.json, vitest.config.ts,
vitest.gates.config.ts, .gitignore, README.md, src/index.ts}`

- [ ] Step 1: `package.json` (use the exact version string of `packages/AI/PredictiveStudio/Engine/package.json` for
  every `@memberjunction/*` dependency and for `version`; `6.2.0-edge.3` at `c92d4a47f9`):

```json
{
  "name": "@memberjunction/predictive-studio-truth-suite",
  "version": "6.2.0-edge.3",
  "private": true,
  "type": "module",
  "license": "BUSL-1.1",
  "description": "Predictive Studio planted-truth suite: the 111-gate registry, seeded generators, test-schema loaders, harness, judges and reference pipeline. Repo-local test content; never published.",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc && tsc-alias -f",
    "test": "vitest run",
    "truth:gates": "vitest run --config vitest.gates.config.ts",
    "truth:registry": "tsx src/registry/cli.ts",
    "truth:loom": "node scripts/fetch-loom.mjs",
    "truth:data": "tsx src/data/cli.ts",
    "test:regeneration": "vitest run --config vitest.regeneration.config.ts",
    "truth:provision": "node scripts/provision.mjs",
    "truth:run": "node scripts/run-truth.mjs",
    "truth:report": "node scripts/report.mjs",
    "setup:python": "node scripts/setup-python.mjs",
    "test:python": "node scripts/run-pytest.mjs"
  },
  "dependencies": {
    "@memberjunction/ai-agents": "6.2.0-edge.3",
    "@memberjunction/aiengine": "6.2.0-edge.3",
    "@memberjunction/core": "6.2.0-edge.3",
    "@memberjunction/core-entities": "6.2.0-edge.3",
    "@memberjunction/global": "6.2.0-edge.3",
    "@memberjunction/graphql-dataprovider": "6.2.0-edge.3",
    "@memberjunction/predictive-studio": "6.2.0-edge.3",
    "@memberjunction/predictive-studio-core": "6.2.0-edge.3",
    "@memberjunction/predictive-studio-sidecar": "6.2.0-edge.3",
    "@memberjunction/server-bootstrap-lite": "6.2.0-edge.3",
    "@memberjunction/testing-integration": "6.2.0-edge.3",
    "mssql": "<the version range packages/TestingFramework/testing-integration/package.json uses>"
  },
  "devDependencies": {
    "@types/mssql": "<same range as testing-integration>",
    "@types/node": "24.10.11",
    "tsc-alias": "^1.8.10",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

  (Copy the two `mssql` ranges from `packages/TestingFramework/testing-integration/package.json` verbatim — the plan
  does not invent versions.)
- [ ] Step 2: `tsconfig.json`: `{ "extends": "../../../../tsconfig.server.json", "compilerOptions": { "outDir": "dist",
  "rootDir": "src", "strict": true }, "include": ["src/**/*"], "exclude": ["node_modules", "src/**/__tests__/**",
  "src/**/*.test.ts"] }`.
- [ ] Step 3: `vitest.config.ts` (unit) and `vitest.gates.config.ts` (gates):

```ts
// vitest.config.ts
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';
export default mergeConfig(sharedConfig, defineProject({
  test: { environment: 'node', include: ['src/**/__tests__/**/*.test.ts'] },
}));
```

```ts
// vitest.gates.config.ts — gate runs: serial, one process (gates share loaded datasets and trained models).
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../../vitest.shared';
const merged = mergeConfig(sharedConfig, defineProject({
  test: {
    environment: 'node',
    testTimeout: 60 * 60_000,
    hookTimeout: 10 * 60_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
  },
}));
merged.test = merged.test || {};
merged.test.include = ['gates/**/*.gates.test.ts'];
export default merged;
```

- [ ] Step 4: `.gitignore`: `.venv`, `.loom/`, `.data/`, `.run/`, `results/`, `dist/`. `src/index.ts`: export the
  registry, stats and gate APIs (`export * from './registry/types.js'` etc.; no cross-package re-exports).
- [ ] Step 5: `cd $MJ && pnpm install && cd packages/AI/PredictiveStudio/TruthSuite && pnpm run build; echo exit=$?` →
  `exit=0`. `git status --short pnpm-lock.yaml` → modified (commit it).

#### Task M2.2: Import the registry

**Files:** Create `scripts/import-gates.mjs`, `gates/gates.json`

- [ ] Step 1: `scripts/import-gates.mjs` (run once; kept for re-imports if the reference registry is ever corrected):

```js
#!/usr/bin/env node
// import-gates.mjs <path to ps-rebuild-plans/reference/gates.json> — writes gates/gates.json with the registry fields.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PHASE0_MODE = { 'G0.2': 'nightly', 'G0.6': 'weekly' };

const registry = source.map((g) => {
  const runMode = g.phase === 0
    ? (PHASE0_MODE[g.gateId] || 'pr')
    : (g.statRule !== null || g.dataset === 'W8' ? 'weekly' : 'nightly');
  const requires = g.gateId === 'G0.6' ? ['live-model'] : g.dataset === 'W8' ? ['sidecar-16gb'] : g.ownerPR === 1 ? ['bizapps-common'] : [];
  // The reference file is camelCase; the registry is a new shape with PascalCase members, mapped once here.
  return {
    GateID: g.gateId, Phase: g.phase, OwnerPR: g.ownerPR, Dataset: g.dataset, Criterion: g.criterion,
    Threshold: g.threshold, Plain: g.plain, Today: g.today, RTest: g.rTest, TestName: g.testName,
    StatRule: g.statRule, AmendedBy: g.amendedBy, P11Threshold: g.p11Threshold,
    Status: 'expected-fail', RunMode: runMode, Requires: requires, Implementation: { Kind: 'stub' },
  };
});
writeFileSync(path.join(root, 'gates', 'gates.json'), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`wrote ${registry.length} gates`);
```

- [ ] Step 2: `node scripts/import-gates.mjs /Users/arieglazier/repos/ps-rebuild-plans/reference/gates.json` → `wrote 111 gates`.
  The copy carries `reference/gates.json` as amended by program D-029/D-030/D-032/D-058/D-060: G0.2 and G0.3 have `OwnerPR: 4`;
  G0.3's `threshold` reads "… reach Published with automated publishing on …" (`amendedBy: "D-029, D-030"`); G0.2's
  reads "with automated publishing on, every agent run … that reaches Published has a stored gate outcome `model` …
  ≤ 6 of 60 …" with `StatRule: "noise-publish-60"` (`AmendedBy: "D-029, D-030, D-032"`); both keep the P11 text in
  `P11Threshold` and their `TestName`s are unchanged. Check:
  `node -e 'const g=require("./gates/gates.json");console.log(g.filter(x=>x.GateID==="G0.2"||x.GateID==="G0.3").map(x=>x.GateID+":"+x.OwnerPR+":"+x.TestName).join(" "))'`
  → `G0.2:4:W2 → C1.1 G0.3:4:W3 → C1.1`.
  G5.6 (`OwnerPR: 4`, dataset C1, criterion S7.4, `amendedBy: "D-058, D-060"`, `p11Threshold: null`) imports through the same
  mapping with no format change. Check: `node -e 'const g=require("./gates/gates.json");const x=g.find(y=>y.GateID==="G5.6");console.log(x.OwnerPR,x.TestName,x.AmendedBy,x.P11Threshold)'` → `4 C1 → S7.4 #2 D-058, D-060 null`.

#### Task M2.3: Registry types, loader and validator

**Files:** Create `src/registry/{types.ts, load.ts, validate.ts, cli.ts}` (types as §5.2) · Test `src/registry/__tests__/registry.test.ts`

**Interfaces:** Produces `TruthSuite.Root()` (`load.ts`; PR 3 consumes it), `GateRegistry.Load(file?)`,
`GateRegistry.Find(registry, testName)` (`load.ts`), `GateRegistryValidator.Validate(registry, repoRoot)` and
`GateRegistryValidator.ValidateAgainstBase(branch, base)` (`validate.ts`). Every exported function is a static member
of the class that owns it (coding standards §2; program D-037, ruling SR-1).

- [ ] Step 1: Failing test:

```ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GateRegistry, TruthSuite } from '../load';
import { GateRegistryValidator } from '../validate';
import type { GateEntry } from '../types';

const registry = GateRegistry.Load();
const MJ_ROOT = path.resolve(TruthSuite.Root(), '../../../..');

function countBy<K extends string | number>(key: (g: GateEntry) => K): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of registry) out[String(key(g))] = (out[String(key(g))] || 0) + 1;
  return out;
}

/** A copy of the registry with one gate replaced, for the validator's negative cases. */
function withGate(gateID: string, change: Partial<GateEntry>): GateEntry[] {
  return registry.map((g) => (g.GateID === gateID ? { ...g, ...change } : g));
}

/** A throwaway repository root whose TruthSuite gate folder holds one file with the given source. */
function repoWithGateFile(source: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'registry-'));
  const gates = path.join(root, 'packages/AI/PredictiveStudio/TruthSuite/gates');
  mkdirSync(gates, { recursive: true });
  writeFileSync(path.join(gates, 'any-subject.gates.test.ts'), source);
  return root;
}

describe('gate registry', () => {
  it('holds all 111 gates with unique ids and names', () => {
    expect(registry).toHaveLength(111);
    expect(new Set(registry.map((g) => g.GateID)).size).toBe(111);
    expect(new Set(registry.map((g) => g.TestName)).size).toBe(111);
  });

  it('keeps the per-phase and per-owner counts of the program', () => {
    expect(countBy((g) => g.Phase)).toEqual({ '0': 12, '1': 12, '2': 41, '3': 11, '4': 9, '5': 6, '6': 12, '7': 8 });
    expect(countBy((g) => g.OwnerPR)).toEqual({ '1': 5, '2': 10, '3': 53, '4': 31, '5': 12 });
    // G0.2/G0.3 have OwnerPR 4 and amended thresholds (AmendedBy); the P11 text is kept in P11Threshold.
    expect(['G0.2', 'G0.3'].map((id) => registry.find((g) => g.GateID === id)?.OwnerPR)).toEqual([4, 4]);
    expect(registry.find((g) => g.GateID === 'G0.3')?.Threshold).toContain('reach Published with automated publishing on');
    expect(registry.find((g) => g.GateID === 'G0.2')?.StatRule).toBe('noise-publish-60');
  });

  it('names every gate "<dataset> → <criterion>[ #n]" with U+2192', () => {
    for (const g of registry) {
      expect(g.TestName).toMatch(new RegExp(`^${g.Dataset} → ${g.Criterion.replace('.', '\\.')}( #[23])?$`));
    }
    expect(GateRegistry.Find(registry, 'W1 → S7.5 #3').GateID).toBe('G5.5');
    expect(() => GateRegistry.Find(registry, 'W1 → S99.9')).toThrow(/No gate named/);
  });

  it('passes the structural validator', () => {
    expect(GateRegistryValidator.Validate(registry, MJ_ROOT)).toEqual([]);
  });

  it('reports every structural error it guards against', () => {
    const errorsFor = (r: readonly GateEntry[], root: string = MJ_ROOT): string => GateRegistryValidator.Validate(r, root).join('\n');
    expect(GateRegistryValidator.Validate(registry.slice(1), MJ_ROOT)).toContain('expected 111 gates, found 110');
    expect(errorsFor(withGate('G0.1', { Status: 'flipped' as GateEntry['Status'] }))).toMatch(/G0\.1 .*invalid status flipped/);
    expect(errorsFor(withGate('G0.1', { RunMode: 'hourly' as GateEntry['RunMode'] }))).toMatch(/invalid runMode hourly/);
    expect(errorsFor(withGate('G0.1', { Requires: ['gpu' as GateEntry['Requires'][number]] }))).toMatch(/unknown requirement gpu/);
    expect(errorsFor(withGate('G1.1', { Status: 'required' }))).toMatch(/a stub cannot be required/);
    // A body is found by its declared title in any gate file, never by a file name in the registry.
    expect(errorsFor(withGate('G1.1', { Implementation: { Kind: 'body' } }))).toMatch(/expected exactly one TruthGate\.Define titled .* found 0/);
    const twice = repoWithGateFile("TruthGate.Define('W1 → S7.5', b);\nTruthGate.Define('W1 → S7.5', b);\n");
    expect(errorsFor(withGate('G0.1', { Implementation: { Kind: 'body' } }), twice)).toMatch(/G0\.1 .*found 2 \(gates\/any-subject\.gates\.test\.ts\)/);
    const once = repoWithGateFile("TruthGate.Define('W1 → S7.5', b);\n");
    expect(errorsFor(withGate('G0.1', { Implementation: { Kind: 'stub' } }), once)).toMatch(/G0\.1 .*a stub has a body in gates\/any-subject\.gates\.test\.ts/);
    expect(errorsFor(withGate('G1.1', { Implementation: { Kind: 'external', Package: 'x', File: 'missing.test.ts' } }))).toMatch(/is missing/);
    const tmp = mkdtempSync(path.join(tmpdir(), 'registry-'));
    writeFileSync(path.join(tmp, 'dup.test.ts'), "it('W1 → S7.5', () => {});\nit('W1 → S7.5', () => {});\n");
    const dup = withGate('G0.1', { Implementation: { Kind: 'external', Package: 'x', File: 'dup.test.ts' } }).filter((g) => g.GateID === 'G0.1');
    expect(GateRegistryValidator.Validate(dup, tmp).join('\n')).toMatch(/expected exactly one test titled .* found 2/);
  });

  it('refuses relaxing, removing, renaming or re-owning a gate of the base branch', () => {
    const base = withGate('G0.1', { Status: 'required' });
    expect(GateRegistryValidator.ValidateAgainstBase(registry, base)).toEqual(['G0.1 (W1 → S7.5) is required on the base branch but expected-fail here']);
    expect(GateRegistryValidator.ValidateAgainstBase(base, base)).toEqual([]);
    expect(GateRegistryValidator.ValidateAgainstBase(registry.slice(1), registry)).toEqual([`${registry[0]!.GateID} (${registry[0]!.TestName}) was removed`]);
    expect(GateRegistryValidator.ValidateAgainstBase(withGate('G0.1', { TestName: 'W1 → S7.6' }), registry).join('\n')).toMatch(/G0\.1 renamed/);
    expect(GateRegistryValidator.ValidateAgainstBase(withGate('G0.1', { OwnerPR: 3 }), registry).join('\n')).toMatch(/G0\.1 owner changed from PR 2 to PR 3/);
  });
});
```

  (The `as GateEntry['Status']`-style casts build deliberately invalid registry JSON for the negative cases; they are
  confined to this test, which is what the validator exists to catch in a hand-edited `gates.json`. The gate files
  written by `repoWithGateFile` are only read as text, so `b` needs no definition.)

- [ ] Step 2: `pnpm test -- registry` → fails resolving `../load`.
- [ ] Step 3: Implement. `load.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeJSONParse } from '@memberjunction/global';
import type { GateEntry } from './types';

/** Where the TruthSuite package lives on disk. */
export class TruthSuite {
  /** Absolute path of the TruthSuite package root (works from src/ under vitest and from dist/). */
  public static Root(): string {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  }
}

/** The 111-gate registry (`gates/gates.json`): loading and lookup by test name. */
export class GateRegistry {
  /** Parse the registry file; `GateRegistryValidator.Validate` checks the shape the parse returns. */
  public static Load(file: string = path.join(TruthSuite.Root(), 'gates', 'gates.json')): GateEntry[] {
    return SafeJSONParse<GateEntry[]>(readFileSync(file, 'utf8')) || [];
  }

  /** The gate whose `TestName` is exactly `testName`; throws when there is none (a body for an unregistered gate). */
  public static Find(registry: readonly GateEntry[], testName: string): GateEntry {
    const gate = registry.find((g) => g.TestName === testName);
    if (!gate) throw new Error(`No gate named "${testName}" in gates/gates.json`);
    return gate;
  }
}
```

`validate.ts` — returns a list of error strings (empty = valid):

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GateEntry, GateImplementation, GateRequirement, GateStatus, RunMode } from './types';

/** Structural checks of `gates/gates.json`, alone and against the base branch's copy. */
export class GateRegistryValidator {
  private static readonly statuses: ReadonlySet<GateStatus> = new Set<GateStatus>(['expected-fail', 'required']);
  private static readonly modes: ReadonlySet<RunMode> = new Set<RunMode>(['pr', 'nightly', 'weekly']);
  private static readonly requirements: ReadonlySet<GateRequirement> = new Set<GateRequirement>(['live-model', 'sidecar-16gb', 'bizapps-common']);
  private static readonly gateFolder = 'packages/AI/PredictiveStudio/TruthSuite/gates';

  /** Every structural error of the registry (count, value lists, where each gate is declared); empty when valid. */
  public static Validate(registry: readonly GateEntry[], repoRoot: string): string[] {
    const errors: string[] = [];
    if (registry.length !== 111) errors.push(`expected 111 gates, found ${registry.length}`);
    const gateFiles = GateRegistryValidator.gateFileSources(repoRoot);
    for (const g of registry) errors.push(...GateRegistryValidator.gateErrors(g, repoRoot, gateFiles));
    return errors;
  }

  /** Changes that relax or rewrite a gate of the base branch: removed, renamed, re-owned, required → expected-fail. */
  public static ValidateAgainstBase(branch: readonly GateEntry[], base: readonly GateEntry[]): string[] {
    const errors: string[] = [];
    for (const b of base) {
      const mine = branch.find((g) => g.GateID === b.GateID);
      if (!mine) { errors.push(`${b.GateID} (${b.TestName}) was removed`); continue; }
      if (mine.TestName !== b.TestName) errors.push(`${b.GateID} renamed from "${b.TestName}" to "${mine.TestName}"`);
      if (mine.OwnerPR !== b.OwnerPR) errors.push(`${b.GateID} owner changed from PR ${b.OwnerPR} to PR ${mine.OwnerPR}`);
      if (b.Status === 'required' && mine.Status !== 'required') {
        errors.push(`${b.GateID} (${b.TestName}) is required on the base branch but expected-fail here`);
      }
    }
    return errors;
  }

  /**
   * The source of every `gates/*.gates.test.ts` file, keyed by its path relative to the TruthSuite package. A `body`
   * gate is found by the title it declares here, never by a file name in the registry.
   */
  private static gateFileSources(repoRoot: string): ReadonlyMap<string, string> {
    const folder = path.join(repoRoot, GateRegistryValidator.gateFolder);
    const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.gates.test.ts')).sort() : [];
    return new Map(files.map((f) => [`gates/${f}`, readFileSync(path.join(folder, f), 'utf8')]));
  }

  /** The errors of one entry: value lists, stub/required, and where its title is declared. */
  private static gateErrors(g: GateEntry, repoRoot: string, gateFiles: ReadonlyMap<string, string>): string[] {
    const tag = `${g.GateID} (${g.TestName})`;
    const errors: string[] = [];
    if (!GateRegistryValidator.statuses.has(g.Status)) errors.push(`${tag}: invalid status ${g.Status}`);
    if (!GateRegistryValidator.modes.has(g.RunMode)) errors.push(`${tag}: invalid runMode ${g.RunMode}`);
    for (const r of g.Requires) if (!GateRegistryValidator.requirements.has(r)) errors.push(`${tag}: unknown requirement ${r}`);
    if (g.Implementation.Kind === 'external') return [...errors, ...GateRegistryValidator.externalErrors(tag, g.TestName, g.Implementation, repoRoot)];
    const declaredIn = [...gateFiles].filter(([, source]) => GateRegistryValidator.titleOccurrences(source, g.TestName) > 0).map(([file]) => file);
    const n = [...gateFiles.values()].reduce((sum, source) => sum + GateRegistryValidator.titleOccurrences(source, g.TestName), 0);
    if (g.Implementation.Kind === 'stub') {
      if (g.Status === 'required') errors.push(`${tag}: a stub cannot be required`);
      if (n > 0) errors.push(`${tag}: a stub has a body in ${declaredIn.join(', ')}`);
      return errors;
    }
    if (n !== 1) {
      const where = declaredIn.length > 0 ? ` (${declaredIn.join(', ')})` : '';
      errors.push(`${tag}: expected exactly one TruthGate.Define titled "${g.TestName}" across gates/*.gates.test.ts, found ${n}${where}`);
    }
    return errors;
  }

  /** An `external` gate: its file in the other package must hold the title exactly once. */
  private static externalErrors(tag: string, testName: string, impl: Extract<GateImplementation, { Kind: 'external' }>, repoRoot: string): string[] {
    const file = path.join(repoRoot, impl.File);
    if (!existsSync(file)) return [`${tag}: implementation file ${file} is missing`];
    const n = GateRegistryValidator.titleOccurrences(readFileSync(file, 'utf8'), testName);
    return n === 1 ? [] : [`${tag}: expected exactly one test titled "${testName}" in ${file}, found ${n}`];
  }

  /**
   * Count occurrences of an exact title as the first, literal argument of `TruthGate.Define(` (TruthSuite bodies and
   * bridges), `it(` or `test(` in a source file.
   */
  private static titleOccurrences(source: string, title: string): number {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (source.match(new RegExp(`(?:TruthGate\\.Define|it|test)\\(\\s*['"\`]${escaped}['"\`]`, 'g')) || []).length;
  }
}
```

  (`externalErrors` takes the implementation already narrowed by `gateErrors`' `Kind === 'external'` check, so
  `impl.File` needs no cast.)
  `Validate`'s `repoRoot` is the MJ root (`path.resolve(TruthSuite.Root(), '../../../..')`). `cli.ts` (run by `pnpm run truth:registry -- [--against <ref>]`): loads
  the registry, runs `GateRegistryValidator.Validate`; with `--against`, reads the base file with
  `git show <ref>:packages/AI/PredictiveStudio/TruthSuite/gates/gates.json` (skips with a printed note when the file
  does not exist at that ref — true until PR 2 merges) and runs `GateRegistryValidator.ValidateAgainstBase`; prints each error and exits 1 if
  any, else prints `registry OK: 111 gates (required N, expected-fail M)` and exits 0.
- [ ] Step 4: `pnpm test -- registry` → `6 passed`; `pnpm run truth:registry` → `registry OK: 111 gates (required 0, expected-fail 111)`.
- [ ] Step 5: Mutation checks (§6 shared notes): delete each `errors.push` of `Validate`/`gateErrors`/`externalErrors`/
  `ValidateAgainstBase` in turn — the count check, status, runMode, requirement, stub-required, stub-with-a-body, body
  title count, external missing file, external title count, removed, renamed, owner changed, relaxed — and confirm
  `reports every structural error it guards against` or `refuses relaxing, …` goes red for each; `n !== 1` → `n < 1` →
  `reports every structural error …` red (the declared-twice case); `gateFileSources` reading one hard-coded file name
  instead of the folder → `reports every structural error …` red (the `any-subject` file is not found);
  `GateRegistry.Find` returning `registry[0]` when nothing matches → `names every gate …` red.

#### Task M2.4: Statistical helpers

**Files:** Create `src/stats/{wilson.ts, binomial.ts, seed-rules.ts}` · Test `src/stats/__tests__/seed-rules.test.ts`

**Interfaces:** Produces `ConfidenceInterval.Wilson(successes, n, z?)`, `ConfidenceInterval.HanleyMcNeil(auc, nPos, nNeg, z?)`,
`ConfidenceInterval.Z95` (`wilson.ts`), `Binomial.RangeProbability(n, p, lo, hi)` (`binomial.ts`), `SeedRule.Passes(rule,
count, n)`, `SeedRule.AcceptanceRange(rule, n)`, `SeedRule.PassProbability(rule, n, trueRate)` and the four per-rule
predicates (`seed-rules.ts`) — static members of the class that owns each computation (coding standards §2).

- [ ] Step 1: Failing test (numbers verified 2026-10-12 with an independent Python computation; see §12):

```ts
import { describe, it, expect } from 'vitest';
import { ConfidenceInterval } from '../wilson';
import { Binomial } from '../binomial';
import { SeedRule } from '../seed-rules';

describe('Wilson interval (z = 1.959963984540054)', () => {
  it('matches the P11 boundary values at n = 400', () => {
    const at28 = ConfidenceInterval.Wilson(28, 400);
    expect(at28.Lower).toBeCloseTo(0.04887, 5);
    expect(at28.Upper).toBeCloseTo(0.09931, 5);
    expect(ConfidenceInterval.Wilson(29, 400).Lower).toBeCloseTo(0.05095, 5);
  });
  it('rejects impossible counts', () => {
    expect(() => ConfidenceInterval.Wilson(5, 4)).toThrow(RangeError);
    expect(() => ConfidenceInterval.Wilson(-1, 4)).toThrow(RangeError);
    expect(() => ConfidenceInterval.Wilson(1, 0)).toThrow(RangeError);
    expect(() => ConfidenceInterval.Wilson(1.5, 4)).toThrow(RangeError);
  });
});

describe('the four 400-seed rules', () => {
  it('noise-publish and false-alarm accept 0–28 of 400', () => {
    expect(SeedRule.AcceptanceRange('noise-publish-400', 400)).toEqual({ Min: 0, Max: 28 });
    expect(SeedRule.AcceptanceRange('false-alarm-400', 400)).toEqual({ Min: 0, Max: 28 });
    expect(SeedRule.NoisePublishPasses(28, 400)).toBe(true);
    expect(SeedRule.NoisePublishPasses(29, 400)).toBe(false);
  });
  it('coverage accepts 372–388 of 400', () => {
    expect(SeedRule.AcceptanceRange('coverage-400', 400)).toEqual({ Min: 372, Max: 388 });
    expect(SeedRule.CoveragePasses(371, 400)).toBe(false);
    expect(SeedRule.CoveragePasses(389, 400)).toBe(false);
  });
  it('detection accepts 372–400 of 400', () => {
    expect(SeedRule.AcceptanceRange('detection-400', 400)).toEqual({ Min: 372, Max: 400 });
    expect(SeedRule.DetectionPasses(371, 400)).toBe(false);
  });
  it('reproduces the published pass probabilities', () => {
    expect(SeedRule.PassProbability('noise-publish-400', 400, 0.05)).toBeCloseTo(0.969, 3);
    expect(SeedRule.PassProbability('noise-publish-400', 400, 0.10)).toBeCloseTo(0.023, 3);
    expect(SeedRule.PassProbability('coverage-400', 400, 0.95)).toBeCloseTo(0.950, 3);
    expect(SeedRule.PassProbability('coverage-400', 400, 0.93)).toBeCloseTo(0.550, 3);
    expect(SeedRule.PassProbability('coverage-400', 400, 0.90)).toBeCloseTo(0.023, 3);
    expect(SeedRule.PassProbability('detection-400', 400, 0.95)).toBeCloseTo(0.969, 3);
    expect(SeedRule.PassProbability('detection-400', 400, 0.90)).toBeCloseTo(0.023, 3);
  });
  it('noise-publish-60 (G0.2) accepts 0–6 of 60', () => {
    expect(SeedRule.AcceptanceRange('noise-publish-60', 60)).toEqual({ Min: 0, Max: 6 });
    expect(SeedRule.PassProbability('noise-publish-60', 60, 0.05)).toBeCloseTo(0.970, 3);
    expect(SeedRule.PassProbability('noise-publish-60', 60, 0.20)).toBeCloseTo(0.031, 3);
  });
  it('reproduces the T2 60-seed pass probability (≤ 4 of 60 at p = 0.0248)', () => {
    expect(Binomial.RangeProbability(60, 0.0248, 0, 4)).toBeCloseTo(0.9834, 4);
  });
});

describe('Hanley–McNeil interval', () => {
  it('collapses to the point for a perfect in-sample AUC', () => {
    const ci = ConfidenceInterval.HanleyMcNeil(1, 2900, 2874);
    expect(ci.Lower).toBeCloseTo(1, 9);
  });
  it('contains 0.5 for a null AUC on W2-sized data', () => {
    const ci = ConfidenceInterval.HanleyMcNeil(0.5, 2900, 2874);
    expect(ci.Lower).toBeLessThan(0.5);
    expect(ci.Upper).toBeGreaterThan(0.5);
  });
});
```

- [ ] Step 2: `pnpm test -- seed-rules` → import failures.
- [ ] Step 3: Implement:

```ts
// wilson.ts
/** A two-sided interval. */
export interface Interval { Lower: number; Upper: number }

/** The interval constructions the gates' statistical rules use (P11, P1). */
export class ConfidenceInterval {
  /** z for a two-sided 95% interval. */
  public static readonly Z95 = 1.959963984540054;

  /** Two-sided Wilson score interval for `successes` of `n` (the rule P11 and P1 use). */
  public static Wilson(successes: number, n: number, z: number = ConfidenceInterval.Z95): Interval {
    if (!Number.isInteger(successes) || !Number.isInteger(n) || n <= 0 || successes < 0 || successes > n) {
      throw new RangeError(`ConfidenceInterval.Wilson: invalid counts ${successes}/${n}`);
    }
    const p = successes / n;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const centre = p + z2 / (2 * n);
    const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
    return { Lower: (centre - half) / denominator, Upper: (centre + half) / denominator };
  }

  /** Hanley & McNeil (1982) normal interval for an AUC with nPos positives and nNeg negatives. */
  public static HanleyMcNeil(auc: number, nPos: number, nNeg: number, z: number = ConfidenceInterval.Z95): Interval {
    const q1 = auc / (2 - auc);
    const q2 = (2 * auc * auc) / (1 + auc);
    const variance = (auc * (1 - auc) + (nPos - 1) * (q1 - auc * auc) + (nNeg - 1) * (q2 - auc * auc)) / (nPos * nNeg);
    const se = Math.sqrt(Math.max(0, variance));
    return { Lower: auc - z * se, Upper: auc + z * se };
  }
}
```

```ts
// binomial.ts — exact binomial tail sums via log-gamma (Lanczos, g = 7), accurate to ~1e-13 here.
export class Binomial {
  private static readonly lanczosC0 = 0.99999999999980993;
  private static readonly lanczosTail: readonly number[] = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  /** ln Γ(x) (Lanczos approximation; reflection below 0.5). */
  public static LogGamma(x: number): number {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - Binomial.LogGamma(1 - x);
    const xm1 = x - 1;
    let a = Binomial.lanczosC0;
    Binomial.lanczosTail.forEach((c, i) => { a += c / (xm1 + i + 1); });
    const t = xm1 + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (xm1 + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /** P(X = k) for X ~ Binomial(n, p). */
  public static Pmf(n: number, p: number, k: number): number {
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(Binomial.LogGamma(n + 1) - Binomial.LogGamma(k + 1) - Binomial.LogGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  /** P(lo ≤ X ≤ hi) for X ~ Binomial(n, p). */
  public static RangeProbability(n: number, p: number, lo: number, hi: number): number {
    let total = 0;
    for (let k = Math.max(0, lo); k <= Math.min(n, hi); k++) total += Binomial.Pmf(n, p, k);
    return total;
  }
}
```

```ts
// seed-rules.ts
import { ConfidenceInterval } from './wilson';
import { Binomial } from './binomial';
import type { StatRule } from '../registry/types';

/** The P11 statistical gate rules over n seeds (§3.3), and their acceptance ranges and power. */
export class SeedRule {
  public static NoisePublishPasses(published: number, n: number): boolean {
    return ConfidenceInterval.Wilson(published, n).Lower <= 0.05;
  }
  public static FalseAlarmPasses(alarms: number, n: number): boolean {
    return SeedRule.NoisePublishPasses(alarms, n);
  }
  public static CoveragePasses(covered: number, n: number): boolean {
    const ci = ConfidenceInterval.Wilson(covered, n);
    return ci.Lower <= 0.95 && 0.95 <= ci.Upper;
  }
  public static DetectionPasses(detected: number, n: number): boolean {
    return ConfidenceInterval.Wilson(detected, n).Upper >= 0.95;
  }

  /** Whether `count` of `n` seeds passes `rule`. */
  public static Passes(rule: StatRule, count: number, n: number): boolean {
    switch (rule) {
      case 'noise-publish-400':
      case 'noise-publish-60': return SeedRule.NoisePublishPasses(count, n);
      case 'false-alarm-400': return SeedRule.FalseAlarmPasses(count, n);
      case 'coverage-400': return SeedRule.CoveragePasses(count, n);
      case 'detection-400': return SeedRule.DetectionPasses(count, n);
    }
  }

  /** The contiguous range of counts the rule accepts at n seeds. */
  public static AcceptanceRange(rule: StatRule, n: number): { Min: number; Max: number } {
    const accepted: number[] = [];
    for (let k = 0; k <= n; k++) if (SeedRule.Passes(rule, k, n)) accepted.push(k);
    // Defensive: none of the five rules accepts nothing at n ≥ 1, so no test reaches this throw (PR description lists it).
    if (accepted.length === 0) throw new Error(`${rule} accepts no count at n = ${n}`);
    return { Min: Math.min(...accepted), Max: Math.max(...accepted) };
  }

  /** Probability the rule passes when each seed independently "succeeds" with probability trueRate. */
  public static PassProbability(rule: StatRule, n: number, trueRate: number): number {
    const { Min, Max } = SeedRule.AcceptanceRange(rule, n);
    return Binomial.RangeProbability(n, trueRate, Min, Max);
  }
}
```

- [ ] Step 4: `pnpm test -- seed-rules` → `10 passed`.
- [ ] Step 5: Mutation checks (§6 shared notes): each clause of the `Wilson` count guard (`isInteger(successes)`,
  `n <= 0`, `successes < 0`, `successes > n`) deleted in turn → `rejects impossible counts` red; `<= 0.05` → `< 0.05`
  → `noise-publish and false-alarm accept 0–28` red; either half of the coverage conjunction deleted → `coverage
  accepts 372–388` red; `>= 0.95` → `> 0.95` in detection → `detection accepts 372–400` red; `Math.max(0, variance)`
  → `variance` → not exposed (the variance is non-negative at every tested AUC; the clamp guards rounding at AUC 1) —
  record it; the `AcceptanceRange` empty throw is defensive and unreachable (see its comment).

#### Task M2.5: `TruthGate.Define`, results, stubs and the report

**Files:** Create `src/gates/{define-gate.ts, results.ts}`, `gates/registry-stubs.gates.test.ts`, `scripts/report.mjs` ·
Test `src/gates/__tests__/outcomes.test.ts`

**Interfaces:** Produces `TruthGate.Define(testName, body)` (the registry validator matches the literal
`TruthGate.Define(`; program D-037, ruling SR-1), `GateResults.DecideOutcome`, `GateResults.ResultsDir`,
`GateResults.Write` (`results.ts`) and `GateSelection.CurrentRunMode`, `GateSelection.IsSelected`,
`GateSelection.MissingRequirement` (`define-gate.ts`) — static members of the classes that own them (coding standards §2).

- [ ] Step 1: Failing test for the outcome mapping and run-mode selection:

```ts
import { describe, it, expect } from 'vitest';
import { GateResults } from '../results';
import { GateSelection } from '../define-gate';
import type { GateEntry } from '../../registry/types';

const passed = { Passed: true, Measured: {}, Detail: 'ok' };
const failed = { Passed: false, Measured: {}, Detail: 'no' };

describe('gate outcomes', () => {
  it('maps status × measurement to an outcome', () => {
    expect(GateResults.DecideOutcome('required', passed, null)).toBe('pass');
    expect(GateResults.DecideOutcome('required', failed, null)).toBe('fail');
    expect(GateResults.DecideOutcome('expected-fail', failed, null)).toBe('xfail');
    expect(GateResults.DecideOutcome('expected-fail', passed, null)).toBe('xpass');
    expect(GateResults.DecideOutcome('expected-fail', null, 'boom')).toBe('error');
    expect(GateResults.DecideOutcome('required', passed, 'boom')).toBe('error');
  });
  it('selects gates by run mode', () => {
    const g: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'nightly', Requires: [] };
    expect(GateSelection.IsSelected(g, 'pr')).toBe(false);
    expect(GateSelection.IsSelected(g, 'nightly')).toBe(true);
    expect(GateSelection.IsSelected(g, 'weekly')).toBe(true);
  });
  it('names a missing requirement (live-model, sidecar-16gb, bizapps-common)', () => {
    const g: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'weekly', Requires: ['live-model'] };
    expect(GateSelection.MissingRequirement(g, {})).toBe('requires live-model: set TRUTH_LIVE_MODEL=1 with model keys configured');
    expect(GateSelection.MissingRequirement(g, { TRUTH_LIVE_MODEL: '1' })).toBeNull();
    const w8: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'weekly', Requires: ['sidecar-16gb'] };
    expect(GateSelection.MissingRequirement(w8, {})).toMatch(/^requires sidecar-16gb:/);
    expect(GateSelection.MissingRequirement(w8, { TRUTH_ALLOW_HIGH_MEMORY: '1' })).toBeNull();
    const bizapps: Pick<GateEntry, 'RunMode' | 'Requires'> = { RunMode: 'nightly', Requires: ['bizapps-common'] };
    expect(GateSelection.MissingRequirement(bizapps, {})).toBe(
      'requires bizapps-common: install bizapps-common with its Feature Pipeline changes and set TRUTH_BIZAPPS_COMMON=1');
    expect(GateSelection.MissingRequirement(bizapps, { TRUTH_BIZAPPS_COMMON: '1' })).toBeNull();
  });
  it('reads the run mode and refuses anything else', () => {
    expect(GateSelection.CurrentRunMode({ TRUTH_RUN_MODE: 'weekly' })).toBe('weekly');
    expect(() => GateSelection.CurrentRunMode({})).toThrow(/TRUTH_RUN_MODE must be pr \| nightly \| weekly \(got unset\)/);
    expect(() => GateSelection.CurrentRunMode({ TRUTH_RUN_MODE: 'daily' })).toThrow(/got daily/);
  });
});
```

- [ ] Step 2: `pnpm test -- outcomes` → import failures.
- [ ] Step 3: Implement `results.ts` (types as §5.2 plus):

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GateEntry, GateStatus } from '../registry/types';

/** What one gate run produced, for {@link GateResults.Write}. */
export interface GateRunRecord {
  Measurement: GateMeasurement | null;
  Error: string | null;
  DurationMs: number;
  /** Overrides the measurement's detail (a `not-run` reason, a stub's owner note). */
  Note?: string;
}

/** Outcome mapping and the per-gate result files of a run. */
export class GateResults {
  /** `fail` and `error` fail the vitest test; `xpass` is reported (flip the gate); `xfail` is the normal pre-owner state. */
  public static DecideOutcome(status: GateStatus, m: GateMeasurement | null, error: string | null): GateOutcome {
    if (error !== null || m === null) return 'error';
    if (status === 'required') return m.Passed ? 'pass' : 'fail';
    return m.Passed ? 'xpass' : 'xfail';
  }

  /** `$TRUTH_RESULTS_DIR`; throws when unset (scripts/run-truth.mjs sets it), so a result is never written to the cwd. */
  public static ResultsDir(): string {
    const dir = process.env.TRUTH_RESULTS_DIR;
    if (!dir) throw new Error('TRUTH_RESULTS_DIR is not set (scripts/run-truth.mjs sets it)');
    return dir;
  }

  /** Write `$TRUTH_RESULTS_DIR/gates/<GateID>.json`. */
  public static Write(gate: GateEntry, outcome: GateOutcome, run: GateRunRecord): void {
    const dir = path.join(GateResults.ResultsDir(), 'gates');
    mkdirSync(dir, { recursive: true });
    const result: GateResult = {
      GateID: gate.GateID, TestName: gate.TestName, OwnerPR: gate.OwnerPR, Status: gate.Status, RunMode: gate.RunMode,
      Outcome: outcome, Measured: run.Measurement?.Measured || {}, Detail: run.Note || run.Measurement?.Detail || '',
      Threshold: gate.Threshold, DurationMs: Math.round(run.DurationMs), Error: run.Error,
      RunID: process.env.TRUTH_RUN_ID || 'local', MJCommit: process.env.TRUTH_MJ_COMMIT || 'unknown',
    };
    writeFileSync(path.join(dir, `${gate.GateID}.json`), `${JSON.stringify(result, null, 2)}\n`);
  }
}
```

`define-gate.ts`:

```ts
import { it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { GateRegistry } from '../registry/load';
import type { GateEntry, RunMode } from '../registry/types';
import { GateResults, type GateMeasurement } from './results';
import type { TruthHarness } from '../harness/types';
import { RunFixtures } from '../harness/run-fixtures';

/** Which gates a run executes: the run mode and the host requirements. */
export class GateSelection {
  private static readonly modeRank: Readonly<Record<RunMode, number>> = { pr: 0, nightly: 1, weekly: 2 };

  /** `TRUTH_RUN_MODE`; anything other than the three lanes is refused (a typo would silently run nothing). */
  public static CurrentRunMode(env: NodeJS.ProcessEnv = process.env): RunMode {
    const mode = env.TRUTH_RUN_MODE;
    if (mode === 'pr' || mode === 'nightly' || mode === 'weekly') return mode;
    throw new Error(`TRUTH_RUN_MODE must be pr | nightly | weekly (got ${mode || 'unset'})`);
  }

  /** A gate runs in its own lane and every larger one (pr ⊂ nightly ⊂ weekly). */
  public static IsSelected(gate: Pick<GateEntry, 'RunMode'>, mode: RunMode): boolean {
    return GateSelection.modeRank[gate.RunMode] <= GateSelection.modeRank[mode];
  }

  /** The first requirement this host lacks, as the `not-run` reason; null when the gate can run here. */
  public static MissingRequirement(gate: Pick<GateEntry, 'Requires'>, env: NodeJS.ProcessEnv): string | null {
    if (gate.Requires.includes('live-model') && env.TRUTH_LIVE_MODEL !== '1') {
      return 'requires live-model: set TRUTH_LIVE_MODEL=1 with model keys configured';
    }
    if (gate.Requires.includes('sidecar-16gb') && env.TRUTH_ALLOW_HIGH_MEMORY !== '1') {
      return 'requires sidecar-16gb: W8 training needs more memory than the runner has (set TRUTH_ALLOW_HIGH_MEMORY=1 on a larger host)';
    }
    if (gate.Requires.includes('bizapps-common') && env.TRUTH_BIZAPPS_COMMON !== '1') {
      return 'requires bizapps-common: install bizapps-common with its Feature Pipeline changes and set TRUTH_BIZAPPS_COMMON=1';
    }
    return null;
  }
}

/** Gate declaration: the one way a gate body is registered (the registry validator counts its literal titles). */
export class TruthGate {
  /**
   * Register one gate as a vitest test. The body measures; it throws only when it cannot measure. Gate files call it
   * with a literal title — `TruthGate.Define('<TestName>', …)` — which is how the registry finds the gate.
   */
  public static Define(testName: string, body: (h: TruthHarness) => Promise<GateMeasurement>): void {
    const gate = GateRegistry.Find(GateRegistry.Load(), testName);
    it(testName, async () => {
      const started = performance.now();
      const skip = TruthGate.skipReason(gate);
      if (skip !== null) {
        GateResults.Write(gate, 'not-run', { Measurement: null, Error: null, DurationMs: 0, Note: skip });
        return;
      }
      let measurement: GateMeasurement | null = null;
      let error: string | null = null;
      try {
        measurement = await body(await RunFixtures.GetRunHarness());
      } catch (e) {
        error = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
      }
      const outcome = GateResults.DecideOutcome(gate.Status, measurement, error);
      GateResults.Write(gate, outcome, { Measurement: measurement, Error: error, DurationMs: performance.now() - started });
      if (outcome === 'fail' || outcome === 'error') {
        throw new Error(`${testName}: ${outcome} — ${error || measurement?.Detail || ''}`);
      }
    });
  }

  /** Why this run does not execute the gate (its lane, or a requirement the host lacks); null when it runs. */
  private static skipReason(gate: GateEntry): string | null {
    const mode = GateSelection.CurrentRunMode();
    return GateSelection.IsSelected(gate, mode)
      ? GateSelection.MissingRequirement(gate, process.env)
      : `runMode ${gate.RunMode} is not part of a ${mode} run`;
  }
}
```

`RunFixtures` lives in `src/harness/run-fixtures.ts`; until M5 it is:

```ts
import type { TruthHarness } from './types';

/** The per-process harness the gates run against (built once the harness modules exist). */
export class RunFixtures {
  /** The run's harness; refused until the harness exists. */
  public static async GetRunHarness(): Promise<TruthHarness> {
    throw new Error('The truth harness is not built yet; no gate body can run before it exists');
  }
}
```

`gates/registry-stubs.gates.test.ts`:

```ts
import { it } from 'vitest';
import { GateRegistry } from '../src/registry/load';
import { GateResults } from '../src/gates/results';

// One named test per gate whose owner has not written its body yet. Replacing a stub = one literal
// TruthGate.Define('<TestName>', …) in a gate file named by subject, and Implementation.Kind "body" (or "external").
for (const gate of GateRegistry.Load().filter((g) => g.Implementation.Kind === 'stub')) {
  it(gate.TestName, () => {
    GateResults.Write(gate, 'not-implemented', { Measurement: null, Error: null, DurationMs: 0, Note: `owner PR ${gate.OwnerPR} implements this gate's body` });
  });
}
```

`scripts/report.mjs` reads `gates/gates.json` and every `$TRUTH_RESULTS_DIR/gates/*.json`, treats a gate with no
result file as `not-run` ("no result written"), and writes `results.json` (111 entries), `summary.md` and
`outcomes.json` (`{ name: TestName, passed: Outcome ∈ {pass, xfail, xpass, not-implemented, not-run}, durationMs: DurationMs,
error: Error }` — the shipped `EMIT_OUTCOMES` shape keeps its camelCase keys, program D-039 (a)). It exits 1 when any outcome is `fail` or `error`, else 0, and prints
`truth suite: pass P · fail F · xfail X · xpass Y · not-implemented N · not-run R · error E (111 gates)`.
- [ ] Step 4: Unit tests → all pass. Gate run (stubs only):

```bash
cd $MJ/packages/AI/PredictiveStudio/TruthSuite
TRUTH_RUN_MODE=pr TRUTH_RESULTS_DIR=$PWD/results pnpm run truth:gates 2>&1 | grep -E "Tests"   # → Tests  111 passed (111)
TRUTH_RESULTS_DIR=$PWD/results node scripts/report.mjs
# → truth suite: pass 0 · fail 0 · xfail 0 · xpass 0 · not-implemented 111 · not-run 0 · error 0 (111 gates)
```

- [ ] Step 5: Mutation checks (§6 shared notes): `DecideOutcome`'s `error !== null ||` deleted → `maps status ×
  measurement …` red (the `('required', passed, 'boom')` case); `status === 'required'` branch inverted → same test
  red; `<=` → `<` in `IsSelected` → `selects gates by run mode` red; each `!== '1'` requirement check deleted →
  `names a missing requirement …` red; the `TRUTH_RUN_MODE` allow-list widened to any string → `reads the run mode …`
  red; `ResultsDir`'s unset guard deleted → not exposed by a unit test (the gate run of Step 4 writes to `results/`
  under the cwd instead — record it); `report.mjs` exit code on `fail`/`error` forced to 0 → copy the Step 4 results
  directory, set one gate file's `Outcome` to `fail`, run `TRUTH_RESULTS_DIR=<copy> node scripts/report.mjs; echo $?` →
  `0` under the mutation, `1` restored (record both).

**Exit tests (M2):** `pnpm test` in TruthSuite → registry 6, seed-rules 10, outcomes 4 passed; `pnpm run build` → exit
0; the stub run above → 111 passed, report line as shown; `pnpm run truth:registry` → `registry OK`.

**Checkpoint commit:** `feat(ps): PR 2 M2 — truth-suite package, 111-gate registry, 400-seed and Wilson helpers`

### M3 — Generators and data  ·  parallel-safe: no  ·  depends on: M2

**Outcome:** The review's world and scenario generators run inside MJ against `MemberJunction/loom` `origin/next` pinned at `63aec01f61a3f9e831fbf64bc9bac4675ac86d84` (no Loom repo changes needed — per Scope Rule §9 `D2-48`, `TruthSuite` calls only `recurringDecision`, `createRng`, `IdentityService`, `calibrateIntercept`, and `sigmoid`, none of which are affected by the standalone Loom CLI findings `F-LOOM-1..4, -6`); every base seed regenerates byte-identical to the review's data; D2, T3-lag, W2 s100–s159 and every 400-seed set are generated on demand and cached by spec hash. Closes F-L2-2.

#### Tasks M3.1–M3.3 (Loom CLI & Unroller findings `F-LOOM-1..4, -6`): Extracted out of PR 2 under Scope Rule (§9 `D2-48`)

**Files:** None modified in `MemberJunction/loom`. `TruthSuite` generators do not call `loom build`, `loom validate`, `RetrospectiveUnroller`, or `emitMetadata`; `fixtures/loom.json` pins `MemberJunction/loom` `origin/next` (`63aec01f61a3f9e831fbf64bc9bac4675ac86d84`) directly in M3.4.

<details>
<summary>Archived M3.1–M3.3 specification (deferred to standalone Loom backlog per §9 D2-48)</summary>

#### Task M3.1 (Loom): time-scoped, indexed aggregations (F-LOOM-3) and motif `fixedFields` (F-LOOM-4)

**Files:** Create `packages/engine/src/simulation/child-index.ts`, `packages/engine/test/child-index.test.ts`,
`packages/engine/test/motif-fixed-fields.test.ts` · Modify `packages/engine/src/simulation/RetrospectiveUnroller.ts`
(`getChildren` at `:295-320`; after `SamplePopulation` at `:140`)

- [ ] Step 1: Failing tests:

```ts
// packages/engine/test/child-index.test.ts
import { describe, it, expect } from 'vitest';
import { ChildIndex } from '../src/simulation/child-index.js';
import type { UnrollEntityState } from '../src/simulation/RetrospectiveUnroller.js';

function state(id: string, entity: string, birthCycle: number, fixedFields: Record<string, string>): UnrollEntityState {
  return { id, entity, birthCycle, isHero: false, motifs: [], latentDials: {}, fixedFields, outcomesByCycle: new Map(), ladderStates: {} };
}

describe('child index (F-LOOM-3)', () => {
  const states = [
    state('P1', 'Person', 2021, {}),
    state('E1', 'EventAttendance', 2021, { PersonID: 'p1' }),
    state('E2', 'EventAttendance', 2023, { PersonID: 'P1' }),
    state('E3', 'EventAttendance', 2022, { PersonID: 'P2' }),
  ];
  const index = ChildIndex.Build(states);

  it('returns only children born at or before the evaluated cycle', () => {
    expect(index.ChildrenAt('P1', 'EventAttendance', 'PersonID', 2022).map((c) => c.id)).toEqual(['E1']);
    expect(index.ChildrenAt('P1', 'EventAttendance', 'PersonID', 2023).map((c) => c.id)).toEqual(['E1', 'E2']);
  });

  it('matches parent ids case-insensitively and never returns another parent\'s children', () => {
    expect(index.ChildrenAt('p1', 'EventAttendance', 'PersonID', 2026).map((c) => c.id)).toEqual(['E1', 'E2']);
    expect(index.ChildrenAt('P3', 'EventAttendance', 'PersonID', 2026)).toEqual([]);
  });

  it('builds in one pass: 20,000 children index in well under a second', () => {
    const many = Array.from({ length: 20000 }, (_, i) => state(`C${i}`, 'EventAttendance', 2021 + (i % 6), { PersonID: `P${i % 2000}` }));
    const t0 = performance.now();
    const big = ChildIndex.Build(many);
    for (let p = 0; p < 2000; p++) big.ChildrenAt(`P${p}`, 'EventAttendance', 'PersonID', 2024);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
```

```ts
// packages/engine/test/motif-fixed-fields.test.ts
import { describe, it, expect } from 'vitest';
import { RetrospectiveUnroller } from '../src/simulation/RetrospectiveUnroller.js';
import { HeroInjector } from '../src/heroes/HeroInjector.js';
import { MotifSampler } from '../src/motifs/MotifSampler.js';
import { StateLadderEngine } from '../src/ladders/StateLadderEngine.js';
import { RngStream } from '../src/math/rng.js';
import type { MotifConfig } from '@memberjunction/loom-contracts';

describe('motif fixedFields reach the unrolled state (F-LOOM-4)', () => {
  it('stamps Region=MOTIF on exactly the sampled entities', () => {
    const motif: MotifConfig = {
      motifKey: 'tagged', targetEntity: 'Person', quota: { mode: 'count', value: 10, rounding: 'round' },
      childRates: [], eras: [], factorOverrides: [], fixedFields: { Region: 'MOTIF' },
    };
    const entities = Array.from({ length: 100 }, (_, i) => ({
      id: `p-${i}`, entity: 'Person', birthCycle: 2021, latentDials: {}, fixedFields: { Region: 'NA' }, isHero: false,
    }));
    const unroller = new RetrospectiveUnroller({
      cycles: [2021], entities, heroInjector: new HeroInjector('d', '9b1dcbf2-c053-41e8-a2f4-d40e11ce66a1', []),
      motifSampler: new MotifSampler([motif]), ladderEngine: new StateLadderEngine([]),
    });
    unroller.Initialize(new RngStream(7));
    const tagged = unroller.GetAllEntityStates().filter((s) => s.fixedFields['Region'] === 'MOTIF');
    expect(tagged).toHaveLength(10);
    expect(tagged.every((s) => unroller.GetMotifAssignments(s.id).some((a) => a.motifKey === 'tagged'))).toBe(true);
  });
});
```

  (Match `RngStream`'s and `HeroInjector`'s constructor signatures to `test/retrospective.test.ts`, which builds both.)
- [ ] Step 2: `cd packages/engine && pnpm test -- child-index motif-fixed-fields` → child-index: cannot resolve `../src/simulation/child-index.js`;
  motif: `expected [] to have length 10`.
- [ ] Step 3: Implement `child-index.ts`:

```ts
import type { UnrollEntityState } from './RetrospectiveUnroller.js';

/** childEntity → fkField → lower-cased parent id → children sorted by birthCycle. */
type ChildMap = Map<string, Map<string, Map<string, UnrollEntityState[]>>>;

/** A per-run index of children by foreign key, so aggregation arrows read one parent's children in O(children). */
export class ChildIndex {
  private constructor(private readonly byEntity: ChildMap) {}

  /** Index every state's string-valued fixed fields once per Run (entity states do not change membership in a run). */
  public static Build(states: Iterable<UnrollEntityState>): ChildIndex {
    const map: ChildMap = new Map();
    for (const s of states) {
      for (const [field, value] of Object.entries(s.fixedFields)) {
        if (typeof value !== 'string' || value.length === 0) continue;
        ChildIndex.listFor(map, s.entity, field, value.toLowerCase()).push(s);
      }
    }
    for (const byField of map.values()) for (const byParent of byField.values()) for (const list of byParent.values()) {
      list.sort((a, b) => a.birthCycle - b.birthCycle);
    }
    return new ChildIndex(map);
  }

  /** Children of `parentId` via `fkField` that exist at `cycle` (born at or before it); parent ids match case-insensitively. */
  public ChildrenAt(parentId: string, childEntity: string, fkField: string, cycle: number): UnrollEntityState[] {
    const list = this.byEntity.get(childEntity)?.get(fkField)?.get(parentId.toLowerCase()) || [];
    return list.filter((c) => c.birthCycle <= cycle);
  }

  private static listFor(map: ChildMap, entity: string, field: string, parentKey: string): UnrollEntityState[] {
    const byField = map.get(entity) || new Map<string, Map<string, UnrollEntityState[]>>();
    map.set(entity, byField);
    const byParent = byField.get(field) || new Map<string, UnrollEntityState[]>();
    byField.set(field, byParent);
    const list = byParent.get(parentKey) || [];
    byParent.set(parentKey, list);
    return list;
  }
}
```

  In `RetrospectiveUnroller`: build `const childIndex = ChildIndex.Build(this.entityStates.values());` once at the top of
  `Run` (after `Initialize`; entity states do not change membership during the run), and replace the body of
  `getChildren` with the index lookup: the explicit-`foreignKeyField` branch becomes `childIndex.ChildrenAt(parentId,
  childEntity, foreignKeyField, c)`, the domain-FK branch iterates `childCfg.foreignKeys` whose `targetEntity` matches and
  concatenates `childIndex.ChildrenAt(…, fk.fieldName || fkKey, c)`, de-duplicated by id; both map each state to the same
  `{ ID, id, __entityName, ...fixedFields, ...latentDials, ...ladderStates }` record as today. For F-LOOM-4, directly
  after `this.motifAssignments = motifSampler.SamplePopulation(entities, rng);` add:

```ts
    // F-LOOM-4: SamplePopulation applies motif.fixedFields to the candidate objects, but entityStates copied the
    // candidates' fixedFields before sampling; write the sampled values back so they reach the output.
    for (const cand of entities) {
      if (cand.isHero || !cand.fixedFields) continue;
      const st = this.entityStates.get(cand.id);
      if (st) Object.assign(st.fixedFields, cand.fixedFields);
    }
```

- [ ] Step 4: `pnpm test` in `packages/engine` → the two new files pass, all previous tests pass (record counts).
- [ ] Step 4b: Mutation checks (§6 shared notes): `c.birthCycle <= cycle` → `true` → `returns only children born at or
  before …` red; `.toLowerCase()` removed from either side → `matches parent ids case-insensitively …` red; the
  write-back loop of F-LOOM-4 deleted → `stamps Region=MOTIF …` red; its `cand.isHero ||` skip deleted → not exposed
  (the test has no heroes; heroes carry no motif `fixedFields`, so the write is a no-op for them) — record it; the
  empty-value skip in `ChildIndex.Build` deleted → not exposed (an empty key is never queried) — record it.
- [ ] Step 5: Commit on the Loom branch: `fix(engine): time-scoped indexed child lookup; motif fixedFields reach output (PS PR 2, F-LOOM-3/4)`.

#### Task M3.2 (Loom): declared latent dials (F-LOOM-1), coefficient-recovery gate (F-LOOM-2), no index-derived defaults (F-LOOM-6), `filePattern` in emitted sync configs (F-L2-1)

**Files:** Modify `packages/contracts/src/ruleset.ts` (`latentDials` on `RulesetModuleSchema`),
`packages/contracts/src/domain.ts` (`allowIndexDefault` on `FieldConfigSchema` at `:77`),
`packages/cli/src/commands/build.ts` (`:73-78`, `:652`), `packages/cli/src/generation.ts` (`:155-161`, `:200-204`),
`packages/engine/src/validation/validator.ts` (new `checkFactorCoefficients`, called next to `checkFactorContracts`),
`packages/engine/src/emitters/metadata.ts` (`:368`) · Create `packages/engine/src/validation/logistic-refit.ts` ·
Tests `packages/engine/test/logistic-refit.test.ts`, `packages/cli/test/index-defaults.test.ts`,
`packages/cli/test/latent-dials.test.ts`

- [ ] Step 1: Failing tests:

```ts
// packages/engine/test/logistic-refit.test.ts
import { describe, it, expect } from 'vitest';
import { LogisticRefit } from '../src/validation/logistic-refit.js';
import { createRng, sigmoid } from '../src/index.js';

describe('logistic refit used by the coefficient-recovery gate (F-LOOM-2)', () => {
  it('recovers planted coefficients inside their 95% intervals', () => {
    const rng = createRng(11, 'refit');
    const X: number[][] = []; const y: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const a = rng.normal(0, 1); const b = rng.bernoulli(0.35) ? 1 : 0;
      X.push([1, a, b]);
      y.push(rng.bernoulli(sigmoid(-0.5 + 0.9 * a + 0.8 * b)) ? 1 : 0);
    }
    const fit = LogisticRefit.Fit(X, y);
    [-0.5, 0.9, 0.8].forEach((beta, j) => {
      expect(Math.abs(fit.Beta[j]! - beta)).toBeLessThan(1.96 * fit.StandardErrors[j]!);
    });
  });
});
```

```ts
// packages/cli/test/index-defaults.test.ts
import { describe, it, expect } from 'vitest';
import { createRng, IdentityService } from '@memberjunction/loom-engine';
import { DomainConfigSchema } from '@memberjunction/loom-contracts';
import { generateEntityRecord } from '../src/generation.js';

const domain = DomainConfigSchema.parse({
  name: 'probe', namespace: 'b1e4c4d5-8f6a-4d2b-9e3a-7a5c8d1f2e34',
  entities: { Person: { entityName: 'People', fields: {
    ID: { type: 'string', isPrimaryKey: true },
    ProbeNum: { type: 'number' },
    ProbeBool: { type: 'boolean' },
    ProbeRoundRobin: { type: 'string', values: ['A', 'B', 'C'] },
    Ok: { type: 'string', values: ['A', 'B'], weights: [1, 1] },
  }, foreignKeys: {} } },
});

describe('index-derived defaults are refused (F-LOOM-6)', () => {
  it('names every field that would get an index-derived value', () => {
    const ids = new IdentityService(); ids.RegisterNamespace('probe', domain.namespace);
    expect(() => generateEntityRecord({ domain, entity: 'Person', i: 1, parentPool: {}, rng: createRng(1), identityService: ids }))
      .toThrow(/Person\.ProbeNum.*Person\.ProbeBool.*Person\.ProbeRoundRobin/s);
  });
  it('allows an explicit opt-in', () => {
    const optIn = structuredClone(domain);
    for (const f of ['ProbeNum', 'ProbeBool', 'ProbeRoundRobin']) optIn.entities['Person']!.fields[f]!.allowIndexDefault = true;
    const ids = new IdentityService(); ids.RegisterNamespace('probe', domain.namespace);
    const row = generateEntityRecord({ domain: optIn, entity: 'Person', i: 1, parentPool: {}, rng: createRng(1), identityService: ids });
    expect(row['ProbeNum']).toBe(10);
  });
});
```

```ts
// packages/cli/test/latent-dials.test.ts — a declared dial is drawn per non-hero entity; an undeclared dial arrow is an error.
import { describe, it, expect } from 'vitest';
import { LatentDialDeclarations } from '../src/commands/build.js';
import { FactorEngine, createRng } from '@memberjunction/loom-engine';

describe('latent dials (F-LOOM-1)', () => {
  it('draws declared dials for non-heroes instead of θ = φ = 0', () => {
    const fe = new FactorEngine();
    fe.RegisterDial({ name: 'theta', mean: 0, stdDev: 1, annualWanderStdDev: 0.15, correlations: {} });
    const values = Array.from({ length: 200 }, (_, i) => LatentDialDeclarations.InitialDials(fe, true, createRng(5, `dials:${i}`), `id-${i}`)['theta']!);
    expect(values.filter((v) => v !== 0).length).toBe(200);
    expect(Math.abs(values.reduce((a, b) => a + b, 0) / 200)).toBeLessThan(0.25);
  });
  it('keeps θ = φ = 0 when the project declares no dials (byte-identical builds)', () => {
    expect(LatentDialDeclarations.InitialDials(new FactorEngine(), false, createRng(5), 'x')).toEqual({ theta: 0, phi: 0 });
  });
  it('refuses a dial arrow whose dial no ruleset declares', () => {
    expect(() => LatentDialDeclarations.AssertArrowsDeclared([{ id: 'renew', arrows: { e: { dial: 'engagement', beta: 0.5 } } }], new Set()))
      .toThrow("Factor 'renew' arrow 'e' uses latent dial 'engagement', which no ruleset declares in latentDials");
  });
});
```

- [ ] Step 2: run each package's tests → all three files fail (missing exports / no throw).
- [ ] Step 3: Implement.
  - `ruleset.ts`: add `latentDials: z.array(LatentDialConfigSchema).default([]),` to `RulesetModuleSchema` (import from
    `./factors.js`). `domain.ts`: add `allowIndexDefault: z.boolean().optional(),` to `FieldConfigSchema`.
  - `build.ts`: export one class holding the two rules and use them:

```ts
/** The build's latent-dial rules (F-LOOM-1): draw declared dials for non-heroes; refuse dial arrows nobody declares. */
export class LatentDialDeclarations {
  /** A non-hero's initial dials: drawn from the declared distributions, or θ = φ = 0 when the project declares none. */
  public static InitialDials(factorEngine: FactorEngine, dialsDeclared: boolean, rng: RngStream, id: string): Record<string, number> {
    return dialsDeclared ? factorEngine.InitializeProfile(rng, id).dials : { theta: 0.0, phi: 0.0 };
  }

  /** Throws for the first factor arrow that reads a dial no ruleset declares in `latentDials`. */
  public static AssertArrowsDeclared(contracts: ReadonlyArray<Pick<FactorContract, 'id' | 'arrows'>>, declared: ReadonlySet<string>): void {
    for (const c of contracts) {
      for (const [key, arrow] of Object.entries(c.arrows)) {
        if ('dial' in arrow && !declared.has(arrow.dial)) {
          throw new Error(`Factor '${c.id}' arrow '${key}' uses latent dial '${arrow.dial}', which no ruleset declares in latentDials`);
        }
      }
    }
  }
}
```

    After `const factorContracts = …` (`:76`): collect `const dials = Object.values(loaded.rulesetModules).flatMap((m) => m.latentDials);`,
    `dials.forEach((d) => factorEngine.RegisterDial(d));`, `LatentDialDeclarations.AssertArrowsDeclared(factorContracts, new Set(dials.map((d) => d.name)));`.
    At `:652` replace the non-hero literal with `LatentDialDeclarations.InitialDials(factorEngine, dials.length > 0, createRng(seed, \`dials:${id}\`), id)`.
    Projects without dial arrows build byte-identically; projects with dial arrows must now declare their dials (fix
    Loom's own fixtures the suite flags, e.g. `renewal-basic`'s `common.json`, by adding the `latentDials` block).
  - `generation.ts`: collect offenders per record and throw once after the field loop:

```ts
  const indexDefaultFields: string[] = [];
  // … in the values-without-weights branch (:160):
      } else if (fieldCfg.allowIndexDefault === true) {
        row[fieldName] = fieldCfg.values[(i - 1) % fieldCfg.values.length];
      } else {
        indexDefaultFields.push(`${entity}.${fieldName}`);
      }
  // … in the `type === 'number'` (:201) and `type === 'boolean'` (:203) branches: same pattern (assign only when allowIndexDefault)
  // after the loop:
  if (indexDefaultFields.length > 0) {
    throw new Error(`Index-derived default values would be emitted for ${indexDefaultFields.join(', ')}: give each field `
      + `'values' with 'weights' (or a generator), or set "allowIndexDefault": true if a deterministic value is intended (F-LOOM-6).`);
  }
```

  - `logistic-refit.ts` (Newton–Raphson IRLS; dense, small p):

```ts
/** A logistic fit: coefficients, their standard errors, and the Newton–Raphson iterations it took. */
export interface LogisticFit { Beta: number[]; StandardErrors: number[]; Iterations: number }

/** Maximum-likelihood logistic regression (Newton–Raphson IRLS) used by the coefficient-recovery gate (F-LOOM-2). */
export class LogisticRefit {
  /** Gauss–Jordan inverse with partial pivoting; throws on a singular information matrix. */
  private static invert(m: number[][]): number[][] {
    const n = m.length;
    const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let pivot = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[pivot]![c]!)) pivot = r;
      [a[c], a[pivot]] = [a[pivot]!, a[c]!];
      const pv = a[c]![c]!;
      if (Math.abs(pv) < 1e-12) throw new Error('LogisticRefit.Fit: singular information matrix (collinear columns)');
      for (let j = 0; j < 2 * n; j++) a[c]![j]! /= pv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = a[r]![c]!;
        for (let j = 0; j < 2 * n; j++) a[r]![j]! -= f * a[c]![j]!;
      }
    }
    return a.map((row) => row.slice(n));
  }

  /** Fit `y` on `X`; `X` must include its own intercept / fixed-effect columns. */
  public static Fit(X: number[][], y: number[], maxIter = 50, tol = 1e-10): LogisticFit {
    const p = X[0]!.length;
    let beta = new Array<number>(p).fill(0);
    let info: number[][] = [];
    for (let it = 1; it <= maxIter; it++) {
      const grad = new Array<number>(p).fill(0);
      info = Array.from({ length: p }, () => new Array<number>(p).fill(0));
      for (let i = 0; i < X.length; i++) {
        const xi = X[i]!;
        const eta = xi.reduce((s, v, j) => s + v * beta[j]!, 0);
        const mu = 1 / (1 + Math.exp(-eta));
        const w = mu * (1 - mu);
        for (let j = 0; j < p; j++) {
          grad[j]! += (y[i]! - mu) * xi[j]!;
          for (let k = 0; k <= j; k++) info[j]![k]! += w * xi[j]! * xi[k]!;
        }
      }
      for (let j = 0; j < p; j++) for (let k = j + 1; k < p; k++) info[j]![k] = info[k]![j]!;
      const inv = LogisticRefit.invert(info);
      const step = inv.map((row) => row.reduce((s, v, k) => s + v * grad[k]!, 0));
      beta = beta.map((b, j) => b + step[j]!);
      if (Math.max(...step.map(Math.abs)) < tol) {
        return { Beta: beta, StandardErrors: inv.map((row, j) => Math.sqrt(row[j]!)), Iterations: it };
      }
    }
    throw new Error(`LogisticRefit.Fit: no convergence in ${maxIter} iterations`);
  }
}
```

  (If the engine's tsconfig rejects `!` non-null assertions by lint rule, rewrite the indexed accesses with local
  variables; the algorithm is unchanged.)
  - `validator.ts`: add `checkFactorCoefficients(data, factors, ctx, gates)`: for each factor whose arrows include
    feature arrows, build `X` = cycle fixed effects (one column per distinct value of the effect entity's cycle field
    from `Validator.GetCandidateCycleFields(entityCfg)[0]`, no separate intercept) + one column per feature arrow
    (compiled with `compileFeature(arrow.feature)`), `y` = the compiled outcome; `LogisticRefit.Fit`; push one gate
    `Coefficient Gate: <factor>.<arrow>` per feature arrow, `passed = |β̂ − β| ≤ 1.96·SE`, `expected = β`,
    `actual = β̂` (4 dp). Dial arrows are reported as gates with `passed: true` and message `dial not observable in
    emitted data; checked by build-time registration (F-LOOM-1)`. Call it right after `checkFactorContracts`.
  - `metadata.ts:368`: `const syncConfig: Record<string, unknown> = { entity: entityCfg.entityName, filePattern: '*.json' };`.
- [ ] Step 4: `pnpm test` at the Loom root → all pass (record counts; update fixtures/tests whose expectations encoded
  the defects, and list each such change in the Loom PR description).
- [ ] Step 5: Runtime (Loom acceptance repros): `node packages/cli/dist/index.js build --project projects/fixture` exits 0
  (or names the fields/dials the fixture must declare — fix the fixture); `… validate --project projects/fixture` now
  prints `Coefficient Gate:` lines; change one planted β in a copy of the fixture after building and re-run validate →
  that coefficient gate fails.
- [ ] Step 5b: Mutation checks (§6 shared notes): `generation.ts`'s `allowIndexDefault === true` branch made
  unconditional → `names every field that would get an index-derived value` red; the final `throw` deleted → same
  test red; `!declared.has(arrow.dial)` → `false` → `refuses a dial arrow whose dial no ruleset declares` red;
  `InitialDials`'s `dialsDeclared ?` branch inverted → `draws declared dials …` red; the coefficient gate's
  `|β̂ − β| ≤ 1.96·SE` → `true` → Step 5's altered-β run no longer fails its gate (record both runs);
  `invert`'s singular-matrix throw deleted → not exposed (no test fits collinear columns) — record it.
- [ ] Step 6: Commit on the Loom branch: `fix(loom): declared latent dials, coefficient-recovery gate, refuse index-derived defaults, filePattern in sync configs (PS PR 2, F-LOOM-1/2/6, F-L2-1)`.

#### Task M3.3 (Loom): open the companion PR and pin

- [ ] Step 1: `git push -u origin ps/pr-2-truth-suite-containment && git branch -vv` (must track its own name);
  `gh pr create --repo MemberJunction/loom --base next --draft --title "Loom fixes for the PS planted-truth suite (MJ PR 2)" --body-file <file>`
  (body: the five findings, before/after repro output, and "merge before MJ PR 2; MJ pins the merge commit").
- [ ] Step 2: Until the Loom PR merges, `fixtures/loom.json` pins the companion branch head
  (`git -C $LOOM rev-parse HEAD`); M-final.2 re-pins to the merge commit on Loom `next` (a refresh trigger (b) item).

</details>

#### Task M3.4: Port the generators

**Files:** Create in `packages/AI/PredictiveStudio/TruthSuite/`: `fixtures/loom.json`, `scripts/fetch-loom.mjs`,
`generators/loom.mjs`, `generators/{gen_lib.mjs, make_scenario.mjs, calibrate_intercept.mjs, make_world.mjs,
make_world_multiclass.mjs, derive_t3_lag.mjs}`, `fixtures/worlds/*.json` (9), `fixtures/worlds-domain/domain.json`,
`fixtures/scenarios/specs/*.json` (14), `vitest.regeneration.config.ts`

- [ ] Step 1: Copy and verify the sources (ps-review @ `d47dfb86f1`; sha256 prefixes recorded 2026-10-12):

```bash
R=/Users/arieglazier/repos/ps-review; T=$MJ/packages/AI/PredictiveStudio/TruthSuite
mkdir -p $T/generators $T/fixtures/worlds/../worlds-domain $T/fixtures/scenarios/specs
cp $R/probes/scenarios/{make_scenario.mjs,gen_lib.mjs,calibrate_intercept.mjs} $T/generators/
cp $R/probes/loom-worlds/{make_world.mjs,make_world_multiclass.mjs} $T/generators/
cp $R/probes/loom-worlds/worlds/*.json $T/fixtures/worlds/
cp $R/probes/loom-worlds/worlds-domain/domain.json $T/fixtures/worlds-domain/
cp $R/probes/scenarios/specs/*.json $T/fixtures/scenarios/specs/
cd $T && shasum -a 256 generators/make_scenario.mjs generators/gen_lib.mjs generators/calibrate_intercept.mjs generators/make_world.mjs generators/make_world_multiclass.mjs fixtures/worlds-domain/domain.json | cut -c1-12
# → 0e6740650a7f  e1a67b27cbd1  03e9d1320f2c  e235740ec06e  d8dda6ca97e0  9becaa550f40   (in that order)
```

- [ ] Step 2: `fixtures/loom.json`: `{ "repo": "https://github.com/MemberJunction/loom", "sha": "63aec01f61a3f9e831fbf64bc9bac4675ac86d84" }`.
  `scripts/fetch-loom.mjs`:

```js
#!/usr/bin/env node
// fetch-loom.mjs — check out the pinned Loom commit into .loom/<sha> and build its engine (idempotent).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { repo, sha } = JSON.parse(readFileSync(path.join(root, 'fixtures', 'loom.json'), 'utf8'));
const dir = process.env.TRUTH_LOOM_DIR || path.join(root, '.loom', sha);
const sh = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`failed: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1); }
};
if (existsSync(path.join(dir, '.built'))) { console.log(`Loom ${sha.slice(0, 10)} already built at ${dir}`); process.exit(0); }
mkdirSync(dir, { recursive: true });
if (!existsSync(path.join(dir, '.git'))) {
  sh('git', ['init', '-q'], dir);
  sh('git', ['remote', 'add', 'origin', repo], dir);
}
sh('git', ['fetch', '-q', '--depth', '1', 'origin', sha], dir);
sh('git', ['checkout', '-q', '--detach', sha], dir);
sh('pnpm', ['install', '--frozen-lockfile', '--ignore-workspace-root-check'], dir);
sh('pnpm', ['--filter', '@memberjunction/loom-contracts', '--filter', '@memberjunction/loom-engine', 'run', 'build'], dir);
writeFileSync(path.join(dir, '.built'), `${sha}\n`);
console.log(`Loom ${sha.slice(0, 10)} built at ${dir}`);
```

  `generators/loom.mjs`:

```js
// loom.mjs — the one import of the Loom engine for every generator (pinned by fixtures/loom.json).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sha } = JSON.parse(readFileSync(path.join(root, 'fixtures', 'loom.json'), 'utf8'));
const loomDir = process.env.TRUTH_LOOM_DIR || path.join(root, '.loom', sha);
const entry = path.join(loomDir, 'packages', 'engine', 'dist', 'index.js');
if (!existsSync(entry)) {
  throw new Error(`Loom engine not built at ${entry}. Run: pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:loom`);
}
export const LOOM_SHA = sha;
// Dynamic import, allowed case 5 of .claude/rules/typescript-style.md ("runtime discovery from config"): the module's
// path is the pinned Loom checkout named in fixtures/loom.json, known only at run time. Loom is deliberately not a
// pnpm dependency of MJ (its workspace lockfile and `workspace:*` contracts cannot resolve in MJ's), so no
// static import or package.json entry can name it. One top-of-module load; every generator imports `engine` from here.
export const engine = await import(pathToFileURL(entry).href);
```

- [ ] Step 3: Edit the copies (and nothing else in their logic):
  - `gen_lib.mjs`: replace its engine import (`:4`) with `import { engine } from './loom.mjs'; export const { createRng, IdentityService } = engine;`;
    same in `calibrate_intercept.mjs`, `make_world.mjs` (`:14-15`) and `make_world_multiclass.mjs` (`:19-20`), destructuring the names each file used.
  - `make_scenario.mjs`: arguments become `node make_scenario.mjs <spec.json> <outDir> [--seed <n>]`; `const seed = <--seed value> ?? spec.seed;` (`??` on purpose: seed 0 is a valid seed)
    and every `spec.seed` use becomes `seed` (the RNG at `:25-26`, the hidden/traps/leak streams, `ids(spec.namespace, seed)`,
    `manifest.seed`); output goes to `<outDir>` directly (the caller passes `<cache>/<id>/<hash>/seed-<k>`), not `<outRoot>/<id>`.
  - `make_world.mjs` / `make_world_multiclass.mjs`: arguments become `<world.json> <outDir> [--seeds 100,101,…] [--emit-metadata]`;
    loop over `--seeds` (default `[...spec.seeds, spec.freshSeed]`), write each seed to `<outDir>/seed-<k>/`; call
    `emitMetadata` only with `--emit-metadata`; after `rows.csv` write `people.csv` with header
    `ID,MemberNumber,Region,PostalCode,IncomeK,AutoRenew,Status,WorldID,Seed` (booleans as `1`/`0`, no trailing newline,
    same `toCsv` as rows) built from `people` after the status reset — this is F-L2-2's fix (the loader no longer needs
    the metadata tree or a `WorldID`/`Seed` injection).
  - `fixtures/scenarios/specs/D2.json`: in `sizingNote` replace `q(3) = 0.01737` with `q(3) = 0.0171` and
    `(0.0500 on 100,000 fresh replays)` with `(independently checked any-alarm rate 0.0498, evidence/P11-roadmap.md:349-350)`.
  - `derive_t3_lag.mjs` (new): `node derive_t3_lag.mjs <T3 seed dir> <outDir>` copies `truth.csv`,
    `truth_origins.csv`, writes `rows.csv` without the `SamePeriodTarget` column (CSV columns split on `,`; T3 has no
    quoted fields) and `manifest.json` = T3's manifest with `id: "T3-lag"`, `derivedFrom: "T3"`,
    `droppedColumns: ["SamePeriodTarget"]` and `columns.features` without it.
- [ ] Step 4: `cd $T && pnpm run truth:loom` → `Loom <sha> built at …/.loom/<sha>`; smoke:
  `node generators/make_world.mjs fixtures/worlds/W1-signal.json /tmp/w1 --seeds 42 && head -c 120 /tmp/w1/seed-42/people.csv`
  → `ID,MemberNumber,Region,PostalCode,IncomeK,AutoRenew,Status,WorldID,Seed` then a row ending `,W1-signal,42`.

#### Task M3.5: Dataset catalog, seed sets and the cache

**Files:** Create `src/data/{seeds.ts, catalog.ts, cache.ts, cli.ts}` · Test `src/data/__tests__/data.test.ts`

- [ ] Step 1: Failing test:

```ts
import { describe, it, expect } from 'vitest';
import { DatasetSeeds } from '../seeds';
import { DataCache } from '../cache';
import { CATALOG } from '../catalog';

describe('seed sets', () => {
  it('fixes the base, T2 and 400-seed sets', () => {
    expect(DatasetSeeds.SeedSet('world', 'W1-signal', 'base')).toEqual([42, 43, 44, 9042]);
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 't2')).toEqual(Array.from({ length: 60 }, (_, i) => 100 + i));
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 'n400')).toHaveLength(400);
    expect(DatasetSeeds.SeedSet('world', 'W2-noise', 'n400')[399]).toBe(499);
    const c2 = DatasetSeeds.SeedSet('scenario', 'C2', 'n400');
    expect(c2.slice(0, 3)).toEqual([2201, 2201001, 2201002]);
    expect(new Set(c2).size).toBe(400);
  });
});

describe('cache', () => {
  it('hashes the spec, the generator and the Loom pin together', () => {
    const a = DataCache.SpecHash({ id: 'X', seed: 1 }, 'generator-bytes', 'loomsha');
    expect(DataCache.SpecHash({ seed: 1, id: 'X' }, 'generator-bytes', 'loomsha')).toBe(a);   // key order does not matter
    expect(DataCache.SpecHash({ id: 'X', seed: 2 }, 'generator-bytes', 'loomsha')).not.toBe(a);
    expect(DataCache.SpecHash({ id: 'X', seed: 1 }, 'generator-bytes', 'other')).not.toBe(a);
    expect(DataCache.SpecHash({ id: 'X', seed: 1 }, 'other-generator', 'loomsha')).not.toBe(a);
    expect(DataCache.SpecHash({ id: 'X', nested: { b: 1, a: 2 } }, 'g', 'l')).toBe(DataCache.SpecHash({ nested: { a: 2, b: 1 }, id: 'X' }, 'g', 'l'));
    expect(DataCache.Dir('/d', 'world', 'W1-signal', a, 42)).toBe(`/d/world/W1-signal/${a.slice(0, 12)}/seed-42`);
  });
  it('catalogs 9 worlds and 15 scenarios (14 specs + T3-lag)', () => {
    expect(CATALOG.filter((d) => d.Kind === 'world')).toHaveLength(9);
    expect(CATALOG.filter((d) => d.Kind === 'scenario').map((d) => d.ID)).toContain('T3-lag');
    expect(CATALOG.filter((d) => d.Kind === 'scenario')).toHaveLength(15);
  });
});
```

- [ ] Step 2: run → import failures.
- [ ] Step 3: Implement:

```ts
// seeds.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../registry/load';

export type SeedSetName = 'base' | 't2' | 'n400';
interface WorldSpecSeeds { seeds: number[]; freshSeed: number }
interface ScenarioSpecSeed { seed: number }

/** The fixed seed sets of every dataset. */
export class DatasetSeeds {
  /** The seeds of `set` for a world or scenario: `base` from its spec file, `t2`/`n400` the fixed W2/400-seed ranges. */
  public static SeedSet(kind: 'world' | 'scenario', id: string, set: SeedSetName): number[] {
    if (kind === 'world') {
      const spec = SafeJSONParse<WorldSpecSeeds>(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'worlds', `${id}.json`), 'utf8'));
      if (!spec) throw new Error(`Invalid world spec JSON for ${id}`);
      if (set === 'base') return [...spec.seeds, spec.freshSeed];
      if (id !== 'W2-noise') throw new Error(`seed set ${set} is defined only for W2-noise`);
      return Array.from({ length: set === 't2' ? 60 : 400 }, (_, i) => 100 + i);
    }
    const specId = id === 'T3-lag' ? 'T3' : id;
    const spec = SafeJSONParse<ScenarioSpecSeed>(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'scenarios', 'specs', `${specId}.json`), 'utf8'));
    if (!spec) throw new Error(`Invalid scenario spec JSON for ${specId}`);
    if (set === 'base') return [spec.seed];
    if (set === 't2') throw new Error('seed set t2 is defined only for W2-noise');
    return [spec.seed, ...Array.from({ length: 399 }, (_, k) => spec.seed * 1000 + k + 1)];
  }
}
```

```ts
// cache.ts
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Canonicalize } from '@memberjunction/global';
import { TruthSuite } from '../registry/load';

/** A JSON value as the specs hold it. */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** The generated-data cache: its root, its key (spec hash) and a seed's directory. */
export class DataCache {
  /** `$TRUTH_DATA_DIR`, else `TruthSuite/.data`. */
  public static Root(): string {
    return process.env.TRUTH_DATA_DIR || path.join(TruthSuite.Root(), '.data');
  }

  /**
   * sha256 of the canonical spec (MJGlobal `Canonicalize`: object keys sorted at every level, so key order never changes
   * the hash), the generator's source and the Loom pin: any of the three changing regenerates.
   */
  public static SpecHash(spec: { [k: string]: Json }, generatorSource: string, loomSha: string): string {
    return createHash('sha256').update(Canonicalize(spec)).update('\0').update(generatorSource).update('\0').update(loomSha).digest('hex');
  }

  /** `<root>/<kind>/<id>/<specHash12>/seed-<k>`. */
  public static Dir(dataRoot: string, kind: 'world' | 'scenario', id: string, specHash: string, seed: number): string {
    return path.join(dataRoot, kind, id, specHash.slice(0, 12), `seed-${seed}`);
  }
}
```

  `catalog.ts` lists each dataset `CatalogEntry { Kind, ID, SpecFile, Generator }` (a new shape: PascalCase members, program D-039) (worlds W1–W8 → `make_world.mjs`, W9 →
  `make_world_multiclass.mjs`, 14 scenarios → `make_scenario.mjs`, T3-lag → `derive_t3_lag.mjs` from T3) as the
  exported constant `CATALOG`, and the class `DatasetCatalog` whose static
  `DatasetCatalog.EnsureGenerated(entry, seed): Promise<string>` (program D-037) computes the hash, returns the cache dir when `.complete`
  exists, otherwise runs the generator with `node` (child process, `--seed`/`--seeds` as the generator takes), checks
  the expected files exist, writes `.complete` and returns the dir. `cli.ts`: `pnpm run truth:data -- --set base`
  generates every dataset's base seeds; `--set t2 --only W2-noise`; `--set n400 --only <id> --stream` generates, hashes
  (appending to `n400.sha256`) and deletes each seed in turn; prints one line per dataset with seed count and seconds.
- [ ] Step 4: `pnpm test -- data` → `3 passed`; `pnpm run truth:data -- --set base` → 24 dataset lines, total < 60 s,
  `du -sh .data` ≈ 100–150 MB; `pnpm run truth:data -- --set t2 --only W2-noise` → 60 seeds.
- [ ] Step 5: Mutation checks (§6 shared notes): `Canonicalize(spec)` replaced by `JSON.stringify(spec)` → `hashes the spec,
  the generator and the Loom pin together` red (both key-order assertions); any one `.update(…)` of `SpecHash` removed → same test red
  (the matching "changes the hash" assertion); `DatasetSeeds.SeedSet`'s `id !== 'W2-noise'` refusal deleted → not exposed by the
  unit test — run `pnpm run truth:data -- --set t2 --only W1-signal` and record that it must exit 1 naming the rule;
  `DatasetCatalog.EnsureGenerated`'s `.complete` check deleted → M3.6's second `test:regeneration` run takes as long as the first
  (record both wall times).

#### Task M3.6: Byte-identical regeneration check

**Files:** Create `fixtures/golden-hashes.json` (content below), `generators/__tests__/regeneration.test.ts`,
`vitest.regeneration.config.ts` (same as `vitest.config.ts` with `include: ['generators/__tests__/**/*.test.ts']`,
`testTimeout: 600_000`)

- [ ] Step 1: Write `fixtures/golden-hashes.json` exactly (sha256 of the review's on-disk data, recomputed 2026-10-12;
  W1-signal s42 was regenerated from Loom `63aec01` the same day and matched):

```json
{
  "source": "ps-review data/ @ d47dfb8 (Loom 63aec01f61), recomputed 2026-10-12",
  "worlds": {
    "W1-signal/seed-42": { "rows": "672ba1b3c4586531f747b6f5f916f40def4330cdd6a4a96ea5d934ffca1c1ca4", "truth": "d60c7e21b306e79ba146fd54bd20fdb8b6805b7dc08dc8e0d6ac3870d0bbb736" },
    "W1-signal/seed-43": { "rows": "a49b74e2f3f3c960148d3cb55a3e3045be94b7f9b82a3731b0d3d88f4055c79b", "truth": "c50b047e5324c4688520adede296f1c68ca26b8b9b872a9a662aec040e313363" },
    "W1-signal/seed-44": { "rows": "6f9615b9304357bdcb7660382baed8cd12e07dc6d95cb209bc8d8c05c979f819", "truth": "65e449a88cbf509f871fc47e29f81ce9c3759db2fed6a719fa5b8376078a52e3" },
    "W1-signal/seed-9042": { "rows": "ce8dffd2f57c3ea185c2c5b2fca612ff321e5d4a5d1a604953dd4de2b259d3b9", "truth": "1b5b479416fd05bce3a65b09d84e8c5a09965d13bd1dcbf381964b2487104bb5" },
    "W2-noise/seed-100": { "rows": "427297876942dfa38ef723c04372d8cc98858c014c5544b2096eef437fe2df94", "truth": "e17b9afff6ec06946df472dffb2d7a265bf06a25e435f067d375eb9559050f84" },
    "W2-noise/seed-101": { "rows": "cda10bf33b6e82b000363e81e1b5b5c3886134e3a0011be9e2258c1c465d8a69", "truth": "8f2be0b0d154b687b073696456a02a1b3a2f7bd5235934c24e42270e4ee1b4ec" },
    "W2-noise/seed-102": { "rows": "c9d03889a733cd7b9cd3f8aa1b74fc143ea69a7baa0c2e462660afd5642a226d", "truth": "0f0f330ebae0d545e8e55f04731b7c9d10ebcbdce43fc4a61d15a924096c0244" },
    "W2-noise/seed-103": { "rows": "f47c9b5b5cec2e8e699214964fffb5c14462474afeaf16633cff0e83e7b668e7", "truth": "7c91bd22a3ad4f9a2eb4fa278042f59c79cd82996d9e5c2b8e3a0739a7f6801f" },
    "W2-noise/seed-104": { "rows": "059b6c19b37d39481778766df9a12ecfb910ff05390286433c0b80cbba221aaa", "truth": "221cc7881b0d54d48100a33e08d4257478f4b60d49c66606c1261301b36ac8a6" },
    "W2-noise/seed-105": { "rows": "33bba7e5b17ece80056a0f6477bb28ac5a02a82a6ce9d391b009552a750a2fa4", "truth": "6486261bd458b2067e1cc9c07d95656c68cb7b487ec047af349ffca1dba3c7a2" },
    "W2-noise/seed-106": { "rows": "1943f1a8c62b0fe409b1804c20a3b664d3c3fcba5a56e8b708c66f3a4b04b075", "truth": "e06d3b36bc35d583c4013a8a395fa0b0d1b3534ad0d8ecc8b9993fbc520f3ef0" },
    "W2-noise/seed-107": { "rows": "741ec675a8d49c5398d647911f9fb4a7d9a86f95113b24d3a171b12f2b28d9fa", "truth": "6a8d1f9a4da6e694d4a3b95e5072394a6ccaecedbe8541f390dbf42df30f58d0" },
    "W2-noise/seed-108": { "rows": "b97c42b335defa15dca543ef6fbe737957e0bd6245eeb0cab7f8619d04bf36c5", "truth": "5d8c2970504ec9e933ea016a0ce7f229fab697d7c46cabdf9cf7bee315d92fc8" },
    "W2-noise/seed-109": { "rows": "b328b62812038fbc2decefc016001e7f2fd26fdf4488be286e6e068c59384e84", "truth": "113a46af13c9fa2b332a529766ea6c7a1abcd4ed8ca1a122411535626cc1c6fc" },
    "W2-noise/seed-110": { "rows": "f68993334473690c49ce1feee9466986f85451e120f53e325bed85f5e7bdabd1", "truth": "2261bc1ca82411c39d9439b01a863ddfe484336ef8937b3a18388e68b4159f34" },
    "W2-noise/seed-111": { "rows": "8935af0773423ef40e8bfa34bab668e39be1019f2619c2cb7e918e27eeef10f6", "truth": "7b691b3cb336785f0fedfe76a3857f92a3b12624a7174284abaa27d7e5de4eff" },
    "W2-noise/seed-112": { "rows": "46b5818b28b23c38ae229630ea9d9a274d24450870904202f11109d4e47f8017", "truth": "2f9323cd2cf859ccefe44352a2841954b118cc148472f821ad5a8d662dabb5fd" },
    "W2-noise/seed-113": { "rows": "c8476d3769712f510a6a990f64b305fda4aaf784de3849026394a20f4b6f3419", "truth": "aed726f5e64ef2552e5c9bcf1631dda073fc8da97f6a1fcdb579defe889e04f8" },
    "W2-noise/seed-114": { "rows": "2ec3368b30a8e5acc6de9cb546fc65b1bd6cc317059f5554ca3b908ab11d4241", "truth": "7dbef9dd9302b80e6286b8eb7e9183f29bb5c36ef851f7b6b17a9752bca678b4" },
    "W2-noise/seed-115": { "rows": "c4e5e9351bf2a09c1d7c5b6fe3da796e0927fa16dc0b17f0e49362aa94739194", "truth": "be47324fdc481b5879812a419b96d5f1419095947ab151adbc3e0db1b64a5162" },
    "W2-noise/seed-116": { "rows": "935920154183c2941b397ac7d323b2dca01904cf385b3803ff44290b86d18933", "truth": "b98ed8f2fbf14a0bad0a68c1f0fa3cbac5144df0d3613a1c5a7ca1aa81015e16" },
    "W2-noise/seed-117": { "rows": "b098986f47c2cf300496aa23aafeb1023b0d22561143e6a6c0335d922c5fd99b", "truth": "3d8a52d87ffd9b3187fdbe9518013a41e03cf296b8bcdec6cf63df6e171c5608" },
    "W2-noise/seed-118": { "rows": "d5bc5f713f018d541f168c776ddd86c98bbac0d2e4235269d14f76fb19b8b11c", "truth": "df75ea0bbe9248e32575561cc5d04beb6cc1ec15d044ee287197c66bf47d5570" },
    "W2-noise/seed-119": { "rows": "92a4e551e6e8b1b52dd7d9810410a29400fd8e9c27db29d43c2eeb94c4058677", "truth": "887b4f4e90d3870d5fefc1818624cc73c3020342eaceed2d59c60310f715ab67" },
    "W2-noise/seed-9100": { "rows": "43a40db064276463153df437110547c86188cba04229db9f7c63df04b240f4bd", "truth": "91b58c37ebc32968d326c729889b82ef825640aac0221381a695083acdcc449a" },
    "W3-leak-row/seed-42": { "rows": "876743d0a3ded90193c094c85fbb5af562afe8a58bf7cee82072bf6e6ea4f1b7", "truth": "d60c7e21b306e79ba146fd54bd20fdb8b6805b7dc08dc8e0d6ac3870d0bbb736" },
    "W3-leak-row/seed-43": { "rows": "2f5b9b1ee43386f701c4dac83baa476c5366338cf52daef863cff338b9b6ddfd", "truth": "c50b047e5324c4688520adede296f1c68ca26b8b9b872a9a662aec040e313363" },
    "W3-leak-row/seed-44": { "rows": "d9eced6a34d159e1a868763c185138eac4c62deb33418336f40044f0e92abf9a", "truth": "65e449a88cbf509f871fc47e29f81ce9c3759db2fed6a719fa5b8376078a52e3" },
    "W3-leak-row/seed-9042": { "rows": "e1365807a62ce6d7ca7ef2e3df345e6c587b5e64ff7008057c1e574f03ab8708", "truth": "1b5b479416fd05bce3a65b09d84e8c5a09965d13bd1dcbf381964b2487104bb5" },
    "W4-pit/seed-42": { "rows": "7b77a28f6b5206f4fe94823b06169920ff7785f36bac6372c3a1645a63e12c52", "truth": "d60c7e21b306e79ba146fd54bd20fdb8b6805b7dc08dc8e0d6ac3870d0bbb736" },
    "W4-pit/seed-43": { "rows": "405c544e9f49421af38812c046b6ac08374959feaf3a8299c83fcfe8cc319f76", "truth": "c50b047e5324c4688520adede296f1c68ca26b8b9b872a9a662aec040e313363" },
    "W4-pit/seed-44": { "rows": "5d15707c7c0f3b029a87d4862cd8c1c5a962eea961e7e2ab85ca421ac7f4b904", "truth": "65e449a88cbf509f871fc47e29f81ce9c3759db2fed6a719fa5b8376078a52e3" },
    "W4-pit/seed-9042": { "rows": "ffd94bf993f6688293d07f691fe879e9148f1180f9d8ce562420fab668ee97b5", "truth": "1b5b479416fd05bce3a65b09d84e8c5a09965d13bd1dcbf381964b2487104bb5" },
    "W5-censor/seed-42": { "rows": "73a5ede511d8b1f4cdc915d186207b58e5b97b71dca9a69e4e5ed75b78905418", "truth": "391107a9151c0a083f3ccda527ae53c2c20a4b5214624165a6aa3610762a74c2" },
    "W5-censor/seed-43": { "rows": "96522d0a4591bb71c12d364066b5a1a9408ed5aa395d11a427698ee18ae3d634", "truth": "7f6e856e23c79cf3303dd6286b590c53348419d378a5b92b503201b9869f997f" },
    "W5-censor/seed-44": { "rows": "2bbfef9179554734fa26b05562acc42458d85a5bfbafaaf250f1a6c245ea4607", "truth": "9a2ce7f882c15c14fd9b6457fc0ca7c2dad884e4a8427051c41a5e6df26f48ac" },
    "W5-censor/seed-9042": { "rows": "b923442a5113d4323dc3c33287e90ba4260201cf9af5bcb0512baffbc36b5740", "truth": "c192ca8fb8433c4de1bbb357e6e2d30de16b962edc7af446f687bcd31bd2bba5" },
    "W6-drift/seed-42": { "rows": "1a060a39afc4ecab532843adb6d26c233765f60b212f8992b760e81ca0ac1c07", "truth": "76d6a6ba78b391d5b4c2f619826f1ee33d3ea1d4d7803b61fe90c3a2bebb4036" },
    "W6-drift/seed-43": { "rows": "9647cb8d842a77441fbfc07b3461a379e24626f6dd35bde5fe96ef236cbdc604", "truth": "12d6a2101de28146fc210e1719b57b60ce70d0ebe5f55a037a5d8e252fab6fe3" },
    "W6-drift/seed-44": { "rows": "f696db6df6386a9246ebc88d2a1d72b2615ebe59e6ce2380115e6e8c639968c5", "truth": "cb4fb6e30211d3bf8cf5d299ad6fe43cde5d3cfecd9c62b973d6a301423acd74" },
    "W6-drift/seed-9042": { "rows": "23e99f90c67252a79991664b9fa6aaa9736cfe48f6a92bcab76a99ef8410f20f", "truth": "319916a8d1612212e5ceae84529f89da608c46aafac0588fca0e4bcb49a934c8" },
    "W7-small-imbalanced/seed-42": { "rows": "6115fc65b8c3171b0a7f8304f727e194af3320e5df0101dc32535e5743b5caf9", "truth": "89d7e8f7846f5de8c9bbac07f89466f2a1e0ef828066ab6a19edbaf8ff943319" },
    "W7-small-imbalanced/seed-43": { "rows": "cc5fdf90a3cd6ebc15b2a0639ccc298f34c4077cff39c188477294deb2b526b3", "truth": "00aae7941be6b2584af8b02f4aaae1e85890be29108b0e8a565800c7d7f24a84" },
    "W7-small-imbalanced/seed-44": { "rows": "5e5c46d312b94bf384ecb0ef50e0642b453dd237d65de18efc98b76ab9b2b7f3", "truth": "56b173374d32f7789a6ea4b2c96d571c8242aabf5dd6971e6b67df4ad7e5577e" },
    "W7-small-imbalanced/seed-9042": { "rows": "615d4d34425f4d4c7f3c37e1c919ab3ea4097c340699180b80d0a470ee8ac80e", "truth": "65d1459fa7e33c8abbaf52d3b360d5754b70d04170b91f44e6abe3a797f2d687" },
    "W8-highcard/seed-42": { "rows": "87b154994120dd7467fbb2c91423e02960febe944b8b80d679a465d01c5d6e12", "truth": "d60c7e21b306e79ba146fd54bd20fdb8b6805b7dc08dc8e0d6ac3870d0bbb736" },
    "W8-highcard/seed-43": { "rows": "876f2caf0bc1f2baf3d6426b18c834d0329e232197592e0465b6630280c95710", "truth": "c50b047e5324c4688520adede296f1c68ca26b8b9b872a9a662aec040e313363" },
    "W8-highcard/seed-44": { "rows": "5de3c3b1fd4abd181cbacb772a783d32df1ee371dfbf7a9a63369defa2f6b045", "truth": "65e449a88cbf509f871fc47e29f81ce9c3759db2fed6a719fa5b8376078a52e3" },
    "W8-highcard/seed-9042": { "rows": "4f325963981256d2a7450ebd636831279164d4b8da7513d3fa2897ed6cd61111", "truth": "1b5b479416fd05bce3a65b09d84e8c5a09965d13bd1dcbf381964b2487104bb5" },
    "W9-multiclass/seed-42": { "rows": "4172e642ca316dda07e37fc3d8869d3d3740689f12c15fa0a8cf0a6141c9be6d", "truth": "8167d6311456de7df5737df992a5d45da8d1cda895c91d7e42d432a9e8e71ad2" },
    "W9-multiclass/seed-43": { "rows": "0f5088666e48f4c04ffb1cf4e74042fcfa8d238ecf0a7df16fe840cc342a18d8", "truth": "bba13db035b7755cecb6b928af0053aec9052fe8124d9cf2f302dd22912ccf0d" },
    "W9-multiclass/seed-44": { "rows": "1659a43292820f75897b8d4432a71ee53f0e786647dd4af5bd1d9afab71f99a5", "truth": "6e62bed13f3a5f03340cbb94263098e3fa71f0ae0f1cd6347ab9488586208e87" },
    "W9-multiclass/seed-9042": { "rows": "d6f38dafddbc4200d99de59f387c5210cbd02be8f38fed1763773b42e6e4afcf", "truth": "aaa512a454c9057dcffd86006ec151f12465173d0123c1c7d7df3238d7e7f036" }
  },
  "scenarios": {
    "C2": { "rows": "979408ec8f980b785d632a85a723ff2f2f2a85e281a6fb2ecf9aa7f870db8080", "truth": "95c57d703778805b97ec88c4d2e35479b07eddcdd5ac05a20e920c4ed62297f4" },
    "C4": { "rows": "ede07ca3808f88a9b9398ad2bac2b1ae2e9704ef73101c15964d512151c21509", "truth": "c7b329b02d5ceff941ed08223a9f82ee3703f80d215d7ccec79640f995081eba" },
    "D1c": { "rows": "0a065a087710c04cd381c1f92ec8b8888c7a732b7c379ad6c1ffa74d3608d8ed", "truth": "5dbe55ba3f59195d96c318754390a4de49d9f53b2d3d70d5d018d60fdc55a2e7" },
    "D1r": { "rows": "ededbeb1b76614181b6c80fe0dbe2aa05643d2139af1eed2390019bcfc1343cc", "truth": "c472b67c5b87d382e8b6701864716a437a72a3f7a4676d07c9ee1c296f35823e" },
    "D2": { "rows": "5bf3511e44c08a4fc96c321a55d5530f1e60dc239c47d463212cac1a290c1608", "truth": "496b179f4137a6477f03db8369b051065c174504415dc141f73475a043c83c8a" },
    "N1c": { "rows": "7c4b14b7d1611f64aa5dd9400436e8444dc4bab47a4fec6bda79fc637e678232", "truth": "d05db5a31bc6bacd59e913ce169b4684f95057dacf6cad868aa1499105342d88" },
    "N1r": { "rows": "def22770674fbae98d7b78a5366b467b8e7037f3af31ecf27dc634c80ecac42f", "truth": "df320adf966c1dedc5de6705c6c14b3cda896b236c6a4b909b612ed4a253fdda" },
    "R1": { "rows": "6725254f568f9cd36ea800452f3ff6dcad3dc674c206a2bdc86c77db8c1f2f51", "truth": "534ca3394a5bc8e4299658932fe2d9e39bd3728065454565b7a22aa6f331e54b" },
    "R2p": { "rows": "3838dc9e965c19c67cdb2e4bb3e4c443d401e52559e55d8e722e800279174f1f", "truth": "945e0e9439a9b93f75eaae2542a12a18c416aec1e82edde4cc07af6579e5e47d" },
    "R3": { "rows": "995ba1d1d52b53097a646620b1bd3f5de7fb0f5ef49901b3d10e67a9035bf3fa", "truth": "dbb3d6debcc840425a42678d2893fa1ba3b2bffc48e49fe07e3b1a897d2b90d1" },
    "T1p": { "rows": "374a18588062ff367e299f51b51d87d2ca49d3006a83b868652a0cd80d5f711a", "truth": "3a5e09bdf162a27a31d6c750ab2a010d1eb34e98195e9251ca8ab0b773320c7a" },
    "T2p": { "rows": "e9e1428f8df2b62e5d90e50ac06852b0d0544aa28e70c71da1ceb98f3f7dc313", "truth": "8a9558129e2fa5ad143d41589cd2bb99daa4cf8902c8faa3dc594794eb7be85a" },
    "T3": { "rows": "281740422cbdfcc353de4cc4bfae353ba0ca9494736fbe2a60dd2c77862eb148", "truth": "57a39e7b7c1a85a7ad152d8bd6c631ab0aa5cde6c0b6a0d658e8f23e158b3978" },
    "T4": { "rows": "411fb72a9e797b6d5a41e721f3d1cb46a30bf6d4969a54adf03d6658d3d7bda5", "truth": "26df60065d6e9bd105ee92baa643eaf07b0d0d1c677675bb4dc277bcaf21c31b" }
  }
}
```

- [ ] Step 2: The test:

```ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../../src/registry/load';
import { CATALOG, DatasetCatalog } from '../../src/data/catalog';
import { DatasetSeeds } from '../../src/data/seeds';

interface Golden { worlds: Record<string, { rows: string; truth: string }>; scenarios: Record<string, { rows: string; truth: string }> }
const golden = JSON.parse(readFileSync(path.join(TruthSuite.Root(), 'fixtures', 'golden-hashes.json'), 'utf8')) as Golden;
const sha = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('every base seed regenerates byte-identical to the review data', () => {
  for (const entry of CATALOG.filter((d) => d.ID !== 'T3-lag')) {
    for (const seed of DatasetSeeds.SeedSet(entry.Kind, entry.ID, 'base')) {
      const key = entry.Kind === 'world' ? `${entry.ID}/seed-${seed}` : entry.ID;
      const expected = entry.Kind === 'world' ? golden.worlds[key] : golden.scenarios[key];
      it(`${key}`, async () => {
        expect(expected, `no golden hash for ${key}`).toBeDefined();
        const dir = await DatasetCatalog.EnsureGenerated(entry, seed);
        expect(sha(path.join(dir, 'rows.csv'))).toBe(expected!.rows);
        expect(sha(path.join(dir, 'truth.csv'))).toBe(expected!.truth);
      });
    }
  }
  it('W2-noise s120–s159 regenerate identically into two fresh caches (determinism beyond the golden seeds)', async () => {
    const w2 = CATALOG.find((d) => d.ID === 'W2-noise');
    if (!w2) throw new Error('W2-noise missing from the catalog');
    const rootA = mkdtempSync(path.join(tmpdir(), 'truth-a-'));
    const rootB = mkdtempSync(path.join(tmpdir(), 'truth-b-'));
    for (const seed of DatasetSeeds.SeedSet('world', 'W2-noise', 't2').slice(20)) {
      const a = await DatasetCatalog.EnsureGenerated(w2, seed, rootA);
      const b = await DatasetCatalog.EnsureGenerated(w2, seed, rootB);
      expect(sha(path.join(a, 'rows.csv'))).toBe(sha(path.join(b, 'rows.csv')));
    }
  });
});
```

  (Add `import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os';` and give `DatasetCatalog.EnsureGenerated` the
  signature `DatasetCatalog.EnsureGenerated(entry: CatalogEntry, seed: number, dataRoot: string = DataCache.Root()): Promise<string>`
  (`DataCache.Root()`, M3.5's `cache.ts`).)
  The golden map covers W2 s100–s119 + 9100 (`base` = spec seeds + fresh), W1/W3–W9 s42–s44 + 9042, and the 14
  scenarios (`T3-lag` is derived, checked by M3.4's manifest only).
- [ ] Step 3: Run against the **pinned Loom** (the companion head after M3.1–M3.2):

```bash
cd $T && pnpm run test:regeneration 2>&1 | tail -3     # → Tests  68 passed (68)   (53 world seeds + 14 scenarios + determinism)
```

  A mismatch after the Loom fixes means a fix changed engine output for worlds that do not use the fixed features —
  stop, find which Loom change altered `recurringDecision`/`createRng`/`calibrateIntercept` output, and fix it in the
  companion (the worlds must not move: every gate threshold in the registry was measured on these bytes).
- [ ] Step 4: Re-run against Loom `63aec01` (`TRUTH_LOOM_DIR=<a 63aec01 build> pnpm run test:regeneration`) → the same 68
  passed (proves the generator ports are faithful independent of the Loom changes).

**Exit tests (M3):** Loom: `pnpm test` all passed (counts recorded); TruthSuite: `pnpm test` (registry 6, seed-rules 10,
outcomes 4, data 3), `pnpm run test:regeneration` → 68 passed, `pnpm run build` exit 0.

**Checkpoint commit:** `feat(ps): PR 2 M3 — Loom-pinned generators, dataset cache, byte-identical regeneration` (MJ);
the Loom branch is pushed with its two commits.

### M4 — Test schema, loaders and isolation  ·  parallel-safe: no  ·  depends on: M3

**Outcome:** a fresh MJ database gets the `pstruth` schema and its `PS Truth: …` entities from one `mj migrate`
command; any dataset seed loads into its own tables in seconds through the `DB_*` settings (no bcp, Docker, fixed
database, port or path); loading one dataset never touches another. Closes the review's hard-wiring (R4) and F-L2-2's
loader half; performs F-ENV-12's runtime repro if M1.6 deferred it.

#### Task M4.1: Generate the test-schema DDL

**Files:** Create `scripts/gen-pstruth-ddl.mjs`, `migrations/V202610130001__pstruth_tables.sql` (hand-written part) ·
Test `src/db/__tests__/ddl.test.ts`

- [ ] Step 1: Failing test:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TruthSuite } from '../../registry/load';

const root = TruthSuite.Root();
const migration = readFileSync(path.join(root, 'migrations', 'V202610130001__pstruth_tables.sql'), 'utf8');
const marker = '-- CODEGEN OUTPUT BELOW';

describe('pstruth migration', () => {
  it('starts with exactly the DDL the generator prints', () => {
    const generated = execFileSync('node', [path.join(root, 'scripts', 'gen-pstruth-ddl.mjs')], { encoding: 'utf8' });
    const handWritten = migration.includes(marker) ? migration.slice(0, migration.indexOf(marker)).trimEnd() : migration.trimEnd();
    expect(handWritten).toBe(generated.trimEnd());
  });
  it('declares one table set per dataset', () => {
    for (const w of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']) {
      expect(migration).toContain(`CREATE TABLE pstruth.${w}_Person (`);
      expect(migration).toContain(`CREATE TABLE pstruth.${w}_MembershipYear (`);
    }
    expect(migration).toContain('CREATE TABLE pstruth.W9_EventRegistration (');
    for (const s of ['C2', 'C4', 'D1c', 'D1r', 'D2', 'N1c', 'N1r', 'R1', 'R2p', 'R3', 'T1p', 'T2p', 'T3', 'T3lag', 'T4', 'R2real', 'T1real']) {
      expect(migration).toContain(`CREATE TABLE pstruth.Scn_${s} (`);
    }
    for (const s of ['T1p', 'T3', 'T4', 'T1real']) {
      expect(migration).toContain(`CREATE TABLE pstruth.SeriesFrame_${s} (`);
      expect(migration).toContain(`CREATE TABLE pstruth.SeriesTrain_${s} (`);
    }
    expect(migration).toContain('CREATE TABLE pstruth.PersonYear (');
  });
  it('computes every appended EntityField Sequence at apply time', () => {
    const codegen = migration.includes(marker) ? migration.slice(migration.indexOf(marker)) : '';
    const inserts = codegen.split(/\n(?=INSERT INTO|IF NOT EXISTS)/).filter((b) => /EntityField\]?\s*\(/.test(b) && /\bSequence\b/.test(b));
    for (const block of inserts) {
      expect(block).toMatch(/SELECT COALESCE\(MAX\(\[Sequence\]\), 0\) \+ 1 FROM \[[^\]]+\]\.\[EntityField\]/);
    }
  });
});
```

  (CodeGen emits `(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = '…')` —
  `CodeGenLib/src/__tests__/entity-field-sequence-insert.test.ts:29`; the test passes vacuously until M4.2 appends.)
- [ ] Step 2: `pnpm test -- ddl` → `ENOENT … V202610130001__pstruth_tables.sql`.
- [ ] Step 3: Implement `scripts/gen-pstruth-ddl.mjs` (pure function of the fixtures; prints to stdout):

```js
#!/usr/bin/env node
// gen-pstruth-ddl.mjs — the hand-written DDL of migrations/V202610130001__pstruth_tables.sql (print; never edit by hand).
// Column typing follows the review loader's rules (load_scenarios.py:10-20): ID UNIQUEIDENTIFIER PK, EntityKey
// NVARCHAR(50), T DATE NULL, Target FLOAT; normal → FLOAT, int/bernoulli → INT; stateFeature → INT; target-proxy and
// time-shifted-label traps → INT, high-cardinality-id → NVARCHAR(100); a series LagTarget/SamePeriodTarget → FLOAT.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = (id) => JSON.parse(readFileSync(path.join(root, 'fixtures', 'scenarios', 'specs', `${id}.json`), 'utf8'));
const lines = [];
const emit = (s) => lines.push(s);

emit('-- pstruth: the Predictive Studio planted-truth suite test schema. TruthSuite only; never copied into migrations/.');
emit('-- Generated by scripts/gen-pstruth-ddl.mjs. Apply with:');
emit('--   mj migrate --schema pstruth --dir packages/AI/PredictiveStudio/TruthSuite/migrations');
emit("IF SCHEMA_ID('pstruth') IS NULL EXEC('CREATE SCHEMA pstruth');");
emit('GO');

const PERSON = 'ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, MemberNumber NVARCHAR(40) NULL, Region NVARCHAR(10) NULL, PostalCode NVARCHAR(10) NULL, IncomeK INT NULL, AutoRenew BIT NULL, Status NVARCHAR(20) NULL, WorldID NVARCHAR(40) NOT NULL, Seed INT NOT NULL';
for (const w of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']) {
  emit(`CREATE TABLE pstruth.${w}_Person (${PERSON});`);
  emit(`CREATE TABLE pstruth.${w}_MembershipYear (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, PersonID UNIQUEIDENTIFIER NOT NULL REFERENCES pstruth.${w}_Person(ID), [Year] INT NOT NULL, StartDate DATE NOT NULL, [Plan] NVARCHAR(20) NOT NULL, EventsAttended INT NOT NULL, IncomeK INT NOT NULL, AutoRenew BIT NOT NULL, Region NVARCHAR(10) NOT NULL, PostalCode NVARCHAR(10) NULL, MemberNumber NVARCHAR(80) NULL, Noise1 INT NOT NULL, Noise2 INT NOT NULL, Noise3 INT NOT NULL, Noise4 INT NOT NULL, Noise5 INT NOT NULL, Renewed BIT NULL, Status NVARCHAR(20) NULL, PersonStatusNow NVARCHAR(20) NULL, WorldID NVARCHAR(40) NOT NULL, Seed INT NOT NULL, TruthScore FLOAT NULL, TruthClass NVARCHAR(20) NULL);`);
}
emit(`CREATE TABLE pstruth.W9_Person (${PERSON});`);
emit('CREATE TABLE pstruth.W9_EventRegistration (ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, PersonID UNIQUEIDENTIFIER NOT NULL REFERENCES pstruth.W9_Person(ID), EventDate DATE NOT NULL, TicketTier NVARCHAR(20) NOT NULL, DaysRegisteredBefore INT NOT NULL, PriorAttendance INT NOT NULL, Outcome NVARCHAR(20) NULL, WorldID NVARCHAR(40) NOT NULL, Seed INT NOT NULL, TruthScore FLOAT NULL, TruthClass NVARCHAR(20) NULL);');

const DIST = { normal: 'FLOAT', int: 'INT', bernoulli: 'INT' };
function scenarioColumns(id) {
  const s = spec(id === 'T3lag' ? 'T3' : id);
  const cols = [['ID', 'UNIQUEIDENTIFIER NOT NULL PRIMARY KEY'], ['EntityKey', 'NVARCHAR(50) NULL'], ['T', 'DATE NULL']];
  for (const [name, d] of Object.entries(s.features || {})) cols.push([name, DIST[d.dist]]);
  if (s.stateFeature) cols.push([s.stateFeature, 'INT']);
  if (s.seriesLeak) {
    cols.push([s.seriesLeak.lagColumn, 'FLOAT']);
    if (id !== 'T3lag') cols.push([s.seriesLeak.sameColumn, 'FLOAT']);
  }
  if (s.traps) {
    cols.push([s.traps.proxy.column, 'INT'], [s.traps.nextPeriod.column, 'INT'], [s.traps.highCardId.column, 'NVARCHAR(100)']);
  }
  cols.push(['Target', 'FLOAT NULL'], ['TruthScore', 'FLOAT NULL']);
  return cols;
}
const table = (name, cols) => emit(`CREATE TABLE pstruth.${name} (${cols.map(([c, t]) => `[${c}] ${t}`).join(', ')});`);
for (const id of ['C2', 'C4', 'D1c', 'D1r', 'D2', 'N1c', 'N1r', 'R1', 'R2p', 'R3', 'T1p', 'T2p', 'T3', 'T3lag', 'T4']) {
  table(`Scn_${id}`, scenarioColumns(id));
}
const REAL_R2 = [['tier', 'NVARCHAR(100)'], ['tenure_years', 'FLOAT'], ['prior_lapse', 'INT'], ['events_attended_y', 'INT'],
  ['courses_completed_y', 'INT'], ['certs_held_y', 'INT'], ['committee_active_y', 'INT'], ['segment', 'NVARCHAR(100)'],
  ['region', 'NVARCHAR(100)'], ['nondues_lines_y', 'INT'], ['nondues_spend_y', 'FLOAT']];
table('Scn_R2real', [['ID', 'UNIQUEIDENTIFIER NOT NULL PRIMARY KEY'], ['EntityKey', 'NVARCHAR(50) NULL'], ['T', 'DATE NULL'], ...REAL_R2, ['Target', 'FLOAT NULL'], ['TruthScore', 'FLOAT NULL']]);
table('Scn_T1real', [['ID', 'UNIQUEIDENTIFIER NOT NULL PRIMARY KEY'], ['EntityKey', 'NVARCHAR(50) NULL'], ['T', 'DATE NULL'], ['Target', 'FLOAT NULL'], ['TruthScore', 'FLOAT NULL']]);
for (const id of ['T1p', 'T3', 'T4', 'T1real']) {
  const base = id === 'T1real'
    ? [['ID', 'UNIQUEIDENTIFIER NOT NULL PRIMARY KEY'], ['EntityKey', 'NVARCHAR(50) NULL'], ['T', 'DATE NULL'], ['Target', 'FLOAT NULL']]
    : scenarioColumns(id).filter(([c]) => c !== 'TruthScore');
  const cal = [['MonthIndex', 'INT NOT NULL'], ['MonthOfYear', 'INT NOT NULL'], ['Month', 'NVARCHAR(3) NOT NULL'], ['TruthScore', 'FLOAT NULL']];
  table(`SeriesFrame_${id}`, [...base, ...cal]);
  table(`SeriesTrain_${id}`, [...base, ...cal]);
}
table('PersonYear', [['ID', 'UNIQUEIDENTIFIER NOT NULL PRIMARY KEY'], ['person_id', 'NVARCHAR(50) NOT NULL'], ['period_index', 'INT NOT NULL'],
  ['decision_date', 'DATE NOT NULL'], ['year', 'INT NOT NULL'], ['renewed', 'INT NOT NULL'], ...REAL_R2, ['TruthScore', 'FLOAT NULL']]);
emit('GO');
process.stdout.write(`${lines.join('\n')}\n`);
```

  `MemberNumber` is `NVARCHAR(80)` on the row tables because W8's `MN-<uuid>` is 39 characters and the review's 40
  left no margin. Write the file: `node scripts/gen-pstruth-ddl.mjs > migrations/V202610130001__pstruth_tables.sql`.
- [ ] Step 4: `pnpm test -- ddl` → the first two pass; the third passes trivially until M4.2 appends CodeGen output.

#### Task M4.2: Register the tables as entities (scoped CodeGen, appended once)

**Files:** Create `codegen/truth-codegen.config.cjs`, `scripts/provision.mjs`, `metadata/.mj-sync.json`,
`metadata/entities/.mj-sync.json` (copies of MJ's root and `metadata/entities/` sync configs) and
`metadata/entities/.pstruth-entities.json` · Modify the migration (append CodeGen output)

- [ ] Step 1: `codegen/truth-codegen.config.cjs` (committed under this name; `provision.mjs` copies it to
  `.run/codegen/mj.config.cjs`, which is git-ignored, and runs CodeGen with that directory as cwd):

```js
/**
 * Scoped CodeGen config for the pstruth test schema (Predictive Studio truth suite). Copied to
 * .run/codegen/mj.config.cjs by scripts/provision.mjs --codegen; never run against a shared database.
 * includeSchemas is CodeGen's positive scope: __mj and every other schema are excluded. No additionalSchemaInfo.
 */
const path = require('node:path');
const MJ_ROOT = process.env.TRUTH_MJ_ROOT;
if (!MJ_ROOT) throw new Error('TRUTH_MJ_ROOT is not set (scripts/provision.mjs sets it)');
if (!/^MJ_PS_PR\d+_|^test$/.test(process.env.DB_DATABASE || '')) {
  throw new Error(`Refusing to run scoped CodeGen on '${process.env.DB_DATABASE}': only MJ_PS_PR<n>_<agent> or the CI 'test' database`);
}
const base = require(path.join(MJ_ROOT, 'mj.config.cjs'));
const scoped = {
  ...base,
  includeSchemas: ['pstruth'],
  excludeSchemas: ['sys', 'staging'],
  settings: [
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'recompile_mj_views', value: false },
    { name: 'auto_index_foreign_keys', value: true },
  ],
  newEntityDefaults: {
    ...base.newEntityDefaults,
    TrackRecordChanges: false,
    AddToApplicationWithSchemaName: false,
    NameRulesBySchema: [{ SchemaName: 'pstruth', EntityNamePrefix: 'PS Truth: ', EntityNameSuffix: '' }],
  },
  customSQLScripts: [],
  output: [],
  commands: [],
  schemaOutput: [],
};
delete scoped.additionalSchemaInfo;
module.exports = scoped;
```

- [ ] Step 2: `scripts/provision.mjs`:
  - `node scripts/provision.mjs` → runs `node <MJ>/packages/MJCLI/bin/run.js migrate --schema pstruth --dir <TruthSuite>/migrations`
    from the MJ root (exit code checked), then queries `SELECT COUNT(*) FROM __mj.Entity WHERE SchemaName='pstruth'` and
    prints `pstruth: <n> entities`; exits 1 if `n` is 0 (the CodeGen output has not been appended yet). It then pushes
    the test schema's entity settings with `node <MJ>/packages/MJCLI/bin/run.js sync push --dir <TruthSuite>/metadata --ci`
    (exit code checked) and checks `SELECT COUNT(*) FROM __mj.Entity WHERE SchemaName='pstruth' AND AllowDirectSQLInsert=1
    AND AllowDirectSQLUpdate=1 AND AllowDirectSQLDelete=1` equals `n` (prints `pstruth: <n> entities, direct SQL
    sanctioned on <n>`; exits 1 otherwise).
  - `metadata/entities/.pstruth-entities.json` (no `sync` blocks; written by `node scripts/gen-pstruth-ddl.mjs
    --metadata` from the same table list as the DDL, so the two cannot drift): one record per `pstruth` table,
    `"primaryKey": { "ID": "@lookup:MJ: Entities.Name=PS Truth: <table>" }` and `fields` `TrackRecordChanges: false`,
    `TrustServerCacheCompletely: false`, `DeleteType: "Hard"`, `AllowDirectSQLInsert: true`, `AllowDirectSQLUpdate: true`,
    `AllowDirectSQLDelete: true` — the opt-in `.claude/rules/data-access.md` requires before the bulk loaders (M4.3)
    and the harness's `ResetColumn` (M5.6) write these tables with SQL (program D-040, ruling SR-4; the shape of
    MJ's own `metadata/entities/.work-queue-entities.json`; the database CHECK needs the first three settings).
  - `node scripts/provision.mjs --codegen` → copies the config to `.run/codegen/mj.config.cjs`, runs
    `node <MJ>/packages/MJCLI/bin/run.js codegen --skipfiles` with that cwd and `TRUTH_MJ_ROOT` set, and prints the
    path of the newest `CodeGen_Run_*.sql` it wrote (CodeGen writes it under the cwd's configured SQL output).
- [ ] Step 3 (one time, on your database): apply the DDL, run the scoped CodeGen, append its output:

```bash
cd $MJ/packages/AI/PredictiveStudio/TruthSuite
node scripts/provision.mjs; echo exit=$?                        # → applies V202610130001, then "pstruth: 0 entities", exit=1
node scripts/provision.mjs --codegen                             # → codegen exit 0; prints …/CodeGen_Run_<ts>.sql
{ printf '\n%.0s' $(seq 1 55); echo '-- CODEGEN OUTPUT BELOW'; cat <that file>; } >> migrations/V202610130001__pstruth_tables.sql
```

- [ ] Step 4: Check the appended block's `EntityField` inserts use the apply-time sequence expression, not literals:
  `grep -n "Sequence" migrations/V202610130001__pstruth_tables.sql | head` — every `EntityField` insert must compute
  `Sequence` from `MAX(Sequence)` at apply time (the form `migrations/CLAUDE.md` prescribes); copy one block's shape from a
  recent core `CodeGen_Run` migration if CodeGen emitted literals, and record it. Then run the M4.1 test → `3 passed`.
- [ ] Step 5: Prove a fresh database needs only `mj migrate` + `mj sync push` (D2-40): create `MJ_PS_PR2_<agent>_fresh`, build it per §2.3
  (core only), run `node scripts/provision.mjs` → `pstruth: 44 entities, direct SQL sanctioned on 44` (16 W1–W8 + 2 W9 + 17 Scn + 8 Series + 1
  PersonYear; every table must be an entity), `SELECT Name, UserViewMaxRows FROM __mj.Entity WHERE SchemaName='pstruth'` → names `PS Truth: …`,
  `UserViewMaxRows` 1000. Drop the `_fresh` database afterwards.
- [ ] Step 6: If M1.6's runtime repro was deferred, run it now with this config (`includeSchemas` swapped to
  `pstruth_fenv12`) and record the output.

#### Task M4.3: Bulk loader, stamps and dataset loaders

**Files:** Create `src/db/{connection.ts, bulk-load.ts, stamp.ts, world-loader.ts, scenario-loader.ts, csv.ts}` · Test
`src/db/__tests__/csv.test.ts`

**Interfaces:** Produces `WorldLoader.LoadSeed(pool, worldId, dir): Promise<LoadSummary>`,
`ScenarioLoader.LoadSeed(pool, scenarioId, dir)`, `ScenarioLoader.FillSeriesTrain(pool, scenarioId, origin)`, `DatasetStamp.Read(pool, table)`;
consumed by the harness `EnsureLoaded` (M5.7).

- [ ] Step 1: Failing test for the pure parts (CSV parsing with typed coercion, truth-file refusal):

```ts
import { describe, it, expect } from 'vitest';
import { TruthCsv } from '../csv';

describe('loader CSV handling', () => {
  it('parses an unquoted CSV without a trailing newline (the world files have none)', () => {
    expect(TruthCsv.Parse('ID,Renewed\na,1\nb,')).toEqual({ Header: ['ID', 'Renewed'], Rows: [['a', '1'], ['b', '']] });
  });
  it('refuses quoted fields (the generators never quote; a quote means a file it cannot split safely)', () => {
    expect(() => TruthCsv.Parse('ID,Name\na,"x,y"')).toThrow(/quote/);
  });
  it('accepts a header that is an ordered subset of the table columns and refuses any other', () => {
    expect(() => TruthCsv.AssertHeaderOrder(['ID', 'Renewed'], ['ID', 'Year', 'Renewed', 'TruthScore'])).not.toThrow();
    expect(() => TruthCsv.AssertHeaderOrder(['Renewed', 'ID'], ['ID', 'Year', 'Renewed'])).toThrow(/order/);
    expect(() => TruthCsv.AssertHeaderOrder(['ID', 'TrueP'], ['ID', 'Renewed'])).toThrow(/TrueP/);
  });
  it('coerces cells by SQL type; empty is NULL', () => {
    expect(TruthCsv.CoerceCell('', 'INT')).toBeNull();
    expect(TruthCsv.CoerceCell('42', 'INT')).toBe(42);
    expect(() => TruthCsv.CoerceCell('4.5', 'INT')).toThrow(/not an integer/);
    expect(TruthCsv.CoerceCell('0.0789', 'FLOAT')).toBe(0.0789);
    expect(TruthCsv.CoerceCell('1', 'BIT')).toBe(true);
    expect(TruthCsv.CoerceCell('2026-01-01', 'DATE')).toEqual(new Date(Date.UTC(2026, 0, 1)));
  });
  it('refuses truth files by name, not by directory', () => {
    expect(() => TruthCsv.AssertNotTruthFile('/x/TruthSuite/.data/world/W1-signal/abc/seed-42/truth.csv')).toThrow(/truth file/);
    expect(() => TruthCsv.AssertNotTruthFile('/x/TruthSuite/.data/world/W1-signal/abc/seed-42/rows.csv')).not.toThrow();
  });
});
```

- [ ] Step 2: run → import failure.
- [ ] Step 3: Implement.
  - `csv.ts`: `TruthCsv.Parse(text): { Header: string[]; Rows: string[][] }` (split on `\n`, strip `\r`, split on `,`; refuse a `"` anywhere — the generators emit no
    quoting, and the review loader made the same refusal), `type SqlCell = string | number | boolean | Date | null` and
    `TruthCsv.CoerceCell(value, sqlType): SqlCell` for `INT`, `FLOAT`, `BIT`, `DATE`, `NVARCHAR(n)`, `UNIQUEIDENTIFIER`
    (lower-cased string), `TruthCsv.AssertNotTruthFile(path)` (throws when `path.basename(p).toLowerCase().startsWith('truth')`),
    and `TruthCsv.AssertHeaderOrder(header, tableColumns)` (the review's header check, `load_world.sh:43-54`: every header column
    exists in the table, in the table's order; the error names the first offending column) — all four are public
    statics of one `TruthCsv` class (program D-037, ruling SR-1; PR 3's plan imports `TruthCsv`).
  - `connection.ts`: `TruthConnection.OpenPool(): Promise<sql.ConnectionPool>` (a static of `TruthConnection`, D-037) from `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`,
    `DB_DATABASE`, `DB_TRUST_SERVER_CERTIFICATE` (no defaults for host/database; throws naming the missing variable).
  - `bulk-load.ts`: `BulkLoader.Insert(pool, table, columns: Array<{ Name: string; SqlType: string }>, rows: SqlCell[][])` —
    builds an `sql.Table` (`create: false`), maps each SQL type to the `mssql` type (`sql.UniqueIdentifier`, `sql.Int`,
    `sql.Float`, `sql.Bit`, `sql.Date`, `sql.NVarChar(n)`), adds rows, `request.bulk(table)` in batches of 50,000; reads
    the column list from `sys.columns` (excluding `__mj_*`) and calls `TruthCsv.AssertHeaderOrder(header, tableColumns)` before
    the first batch. Before any DML, the loaders read the table's entity flags (`SELECT AllowDirectSQLInsert,
    AllowDirectSQLDelete FROM __mj.Entity WHERE SchemaName = 'pstruth' AND BaseTable = @table`, parameterised) and throw
    naming `truth:provision` when either is 0 — direct SQL only where the entity opts in (M4.2, D-040).
  - `stamp.ts`: `DatasetStamp.Read(pool, table)` / `DatasetStamp.Write(pool, table, value)` on the extended property
    `pstruth_dataset` (`sys.extended_properties`, `sp_addextendedproperty` / `sp_updateextendedproperty`).
  - `world-loader.ts`: `WorldLoader.LoadSeed(pool, worldId, dir): Promise<LoadSummary>`: prefix `W1`…`W9` from the world id; `DELETE` the row table,
    `DELETE` the person table (in one transaction), bulk-insert `people.csv` then `rows.csv`,
    `ALTER TABLE … WITH CHECK CHECK CONSTRAINT ALL`, verify `COUNT(*)` equals the manifest `rowCount` (else throw),
    stamp both tables `<worldId>/seed-<k>#<sha256(rows.csv)>`, return `{ Table, Rows, People, Ms }` (`export interface LoadSummary { Table: string; Rows: number; People: number; Ms: number }`).
  - `scenario-loader.ts`: `ScenarioLoader.LoadSeed` (same for `Scn_<ID>`, `-` removed; checks `manifest.nRows`),
    `ScenarioLoader.LoadSeriesFrame(pool, id, dir)` (rows + `MonthIndex = months since the first T`, `MonthOfYear`, `Month = 'M' +
    two-digit month`, the review's definition, `make_p6_tables.py:201-202`), `ScenarioLoader.FillSeriesTrain(pool, id, origin)`
    (`DELETE` + `INSERT … SELECT * FROM SeriesFrame_<id> WHERE MonthIndex < firstTestPeriod + 12·(origin − 1)` with
    `firstTestPeriod = nPeriods − K·H` from the manifest's `planted.rollingOrigin`, i.e. 96 for T1p/T3/T4), stamped
    `<id>/seed-<k>/origin-<o>#<sha>`.
  - Each loader module's exports are the public statics of one class named for it — `BulkLoader`, `DatasetStamp`,
    `WorldLoader`, `ScenarioLoader` (program D-047: every exported function a plan writes is a static).
- [ ] Step 4: `pnpm test -- csv` → `5 passed`; `pnpm run build` → exit 0.
- [ ] Step 4b: Mutation checks (§6 shared notes): the quote refusal deleted → `refuses quoted fields …` red; the order
  check in `TruthCsv.AssertHeaderOrder` deleted → `accepts a header that is an ordered subset …` red; `TruthCsv.CoerceCell`'s integer
  check deleted → `coerces cells by SQL type …` red; `TruthCsv.AssertNotTruthFile`'s `startsWith('truth')` → `false` →
  `refuses truth files …` red; `WorldLoader.LoadSeed`'s row-count check deleted → not exposed by a unit test (it needs a
  database) but by M4.4's second integration test (`refuses a seed whose row count …`), which goes red under it; the
  loaders' opt-in check deleted → not exposed by a unit test: on the M4.2 Step 5 `_fresh` database, set one table's
  `AllowDirectSQLInsert` to 0 through its `MJ: Entities` record (`Save()`), run the M4.3 Step 5 load — it must throw
  naming `truth:provision`, and load under the mutation (record both runs; restore with `node scripts/provision.mjs`).
- [ ] Step 5: Runtime (your database, after M4.2):

```bash
cd $MJ/packages/AI/PredictiveStudio/TruthSuite
npx tsx -e "import { TruthConnection } from './src/db/connection'; import { WorldLoader } from './src/db/world-loader'; import { CATALOG, DatasetCatalog } from './src/data/catalog';
const p = await TruthConnection.OpenPool(); const w1 = CATALOG.find((d) => d.ID === 'W1-signal'); if (!w1) throw new Error('no W1');
console.log(await WorldLoader.LoadSeed(p, 'W1-signal', await DatasetCatalog.EnsureGenerated(w1, 42))); await p.close();"
# → { Table: 'pstruth.W1_MembershipYear', Rows: 16776, People: 4999, Ms: <≈1,000–3,000> }
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -d "$DB_DATABASE" -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*), SUM(CAST(Renewed AS INT)) FROM pstruth.W1_MembershipYear; SELECT CAST(value AS NVARCHAR(200)) FROM sys.extended_properties WHERE major_id=OBJECT_ID('pstruth.W1_MembershipYear') AND name='pstruth_dataset'"
# → 16776 13488   and   W1-signal/seed-42#672ba1b3c4586531f747b6f5f916f40def4330cdd6a4a96ea5d934ffca1c1ca4
```

  (13,488 = the W1 s42 renewals, 0.8040 × 16,776; `L1-worlds.md:157`.)

#### Task M4.4: Isolation check

**Files:** Create `src/db/__tests__/isolation.integration.test.ts`, `vitest.db.config.ts` (as `vitest.config.ts` with
`include: ['src/**/__tests__/**/*.integration.test.ts']`, `testTimeout: 300_000`) · Modify `vitest.config.ts` (add
`exclude: ['**/*.integration.test.ts']`) and `package.json` (`"test:db": "vitest run --config vitest.db.config.ts"`)

- [ ] Step 1: The test loads W1 s42, then W3 s42, then W1 s43, and asserts after each step: the W1 tables hold the
  last W1 seed loaded (stamp and row count), the W3 tables are untouched by the W1 reload (stamp unchanged, same
  `CHECKSUM_AGG(CHECKSUM(*))`), and no `pstruth` table other than the two being loaded changed its row count. A second
  test, `refuses a seed whose row count differs from its manifest`, copies W1 s42's seed directory to a temp dir, drops
  the last line of its `rows.csv`, and expects `WorldLoader.LoadSeed` to reject naming both counts (the guard of M4.3's
  row-count check; the W1 tables are reloaded from the real seed afterwards).
- [ ] Step 2: `pnpm run test:db` → `2 passed` (record the three load times).
- [ ] Step 3: `grep -rn "TRUNCATE" src scripts` → no matches (nothing truncates the schema).

**Exit tests (M4):** `pnpm test` (registry 6, seed-rules 10, outcomes 4, data 3, ddl 3, csv 5); `pnpm run test:db` → 2
passed; the fresh-database provision of M4.2 Step 5; `pnpm run build` exit 0.

**Checkpoint commit:** `feat(ps): PR 2 M4 — pstruth test schema and entities, bulk loaders, per-dataset isolation`

### M5 — Judges, reference pipeline and harness  ·  parallel-safe: M5.1–M5.5 (Python) and M5.6–M5.8 (TypeScript) may run on two sub-branches  ·  depends on: M4

**Outcome:** the reference pipeline (69 tests) and the judges run from the truth-suite venv and reproduce the review's
18 reference results exactly; the TypeScript harness drives PS through MJAPI (direct path, Pipeline Builder agent path,
scoring, record-process scoring, promotion) against a single-threaded sidecar; the 12 Phase-0 gate bodies exist and
run in their lanes (PR 2's ten and PR 4's G0.2/G0.3, program D-030); the first local `pr` run records their baseline.

#### Task M5.1: Python package and venv

**Files:** Create `python/{requirements.txt, pytest.ini, mypy.ini}`, `python/truthsuite/{__init__.py, paths.py}`,
`scripts/{setup-python.mjs, run-pytest.mjs}`; Modify `src/data/cli.ts` (write `$TRUTH_DATA_DIR/index.json`)

- [ ] Step 1: `python/requirements.txt`:

```
# Truth-suite judges + reference pipeline. Product pins come first so the judge computes with the sidecar's libraries.
-r ../../Sidecar/src/python/requirements.txt
statsmodels==0.15.0
patsy==1.0.3
pyarrow==25.0.1
mypy==1.17.1
pandas-stubs==2.2.2.240807
```

  `scripts/setup-python.mjs`: `node ../Sidecar/scripts/setup-python.mjs --venv <TruthSuite>/.venv --requirements
  <TruthSuite>/python/requirements.txt` (spawned with `stdio: 'inherit'`, exit code propagated). `scripts/run-pytest.mjs`:
  like the sidecar's, with `cwd = python/`, interpreter `PREDICTIVE_STUDIO_TRUTH_PYTHON` or `.venv/bin/python`, and
  `PYTHONHASHSEED=0`, `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, `MKL_NUM_THREADS=1` (the refpipe forces single
  threads too, `run.py:31-32`; setting them here keeps pytest and CLI runs equal).
- [ ] Step 2: `python/truthsuite/paths.py` — the one place Python learns where data lives:

```python
"""Where the truth suite's data lives. TRUTH_DATA_DIR/index.json is written by `pnpm run truth:data` (src/data/cli.ts)."""
from __future__ import annotations

import json
import os
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[2]          # …/TruthSuite
FIXTURES = PACKAGE_ROOT / "fixtures"


def data_root() -> Path:
    return Path(os.environ.get("TRUTH_DATA_DIR") or str(PACKAGE_ROOT / ".data"))  # an empty value counts as unset


def seed_dir(kind: str, dataset_id: str, seed: int) -> Path:
    """The cache directory of one generated seed ('world' | 'scenario'), via the index the TS data CLI maintains."""
    index_file = data_root() / "index.json"
    if not index_file.exists():
        raise FileNotFoundError(f"{index_file} missing: run `pnpm run truth:data -- --set base` first")
    index: dict[str, str] = json.loads(index_file.read_text())
    key = f"{kind}/{dataset_id}/seed-{seed}"
    if key not in index:
        raise KeyError(f"{key} not generated: run `pnpm run truth:data` for it")
    return Path(index[key])


def real_fixture(name: str) -> Path:
    return FIXTURES / "real" / name
```

  `src/data/cli.ts` / `DatasetCatalog.EnsureGenerated` append `"<kind>/<id>/seed-<k>": "<abs dir>"` to `index.json` (read-merge-write).
- [ ] Step 3: `pnpm run setup:python` → `Python environment ready: …/TruthSuite/.venv/bin/python`;
  `.venv/bin/python -c "import scipy, statsmodels, pyarrow; print(scipy.__version__, statsmodels.__version__, pyarrow.__version__)"`
  → `1.17.1 0.15.0 25.0.1`.

#### Task M5.2: Port the reference pipeline and its fixtures

**Files:** Create `python/truthsuite/refpipe/{__init__.py, run.py, models.py, scoring.py, splits.py, audit.py, baselines.py,
summary.py, verdict_diff.py}`, `python/truthsuite/scenarios/{__init__.py, manifest.py}`, `python/tests/{test_run.py,
test_scoring.py, test_splits.py, test_manifest.py}`, `fixtures/real/{person_years.parquet, person_years_leaky.parquet,
R2-real.rows.csv, R2-real.manifest.json, T1-real.rows.csv, T1-real.manifest.json}`

- [ ] Step 1: Copy and verify (sha256 prefixes from ps-review `d47dfb86f1`):

```bash
R=/Users/arieglazier/repos/ps-review/probes; P=$MJ/packages/AI/PredictiveStudio/TruthSuite/python
mkdir -p $P/truthsuite/refpipe $P/truthsuite/scenarios $P/tests
for f in run models scoring splits audit baselines summary verdict_diff; do cp $R/refpipe/$f.py $P/truthsuite/refpipe/; done
cp $R/refpipe/test_{run,scoring,splits}.py $P/tests/; cp $R/scenarios/manifest.py $P/truthsuite/scenarios/; cp $R/scenarios/test_manifest.py $P/tests/
touch $P/truthsuite/__init__.py $P/truthsuite/refpipe/__init__.py $P/truthsuite/scenarios/__init__.py
cd $P && shasum -a 256 truthsuite/refpipe/{run,models,scoring,splits,audit,baselines,summary,verdict_diff}.py truthsuite/scenarios/manifest.py | cut -c1-12
# → ab35d4e31d7c a90e7aa4e9b1 44db3bface2e 48bcf2133c61 f961599e6c29 6761379a0667 300a7caddb1f 0db657e6335b e2e89432ec35
D=/Users/arieglazier/repos/ps-review/data; F=$MJ/packages/AI/PredictiveStudio/TruthSuite/fixtures/real; mkdir -p $F
cp $D/person_years.parquet $D/person_years_leaky.parquet $F/
cp $D/scenarios/R2-real/rows.csv $F/R2-real.rows.csv; cp $D/scenarios/R2-real/manifest.json $F/R2-real.manifest.json
cp $D/scenarios/T1-real/rows.csv $F/T1-real.rows.csv; cp $D/scenarios/T1-real/manifest.json $F/T1-real.manifest.json
shasum -a 256 $F/person_years.parquet $F/person_years_leaky.parquet $F/R2-real.rows.csv $F/T1-real.rows.csv | cut -c1-12
# → 3729e51a5ec8 36958e67d4c0 e265ea02f919 7adfd649f03f
```

- [ ] Step 2: Edits (the only edits; the numerics are untouched):
  - every `from probes.refpipe…` / `import probes.refpipe…` → `truthsuite.refpipe`; `probes.scenarios.manifest` →
    `truthsuite.scenarios.manifest` (`grep -rn "probes\." python/` must print nothing afterwards).
  - `run.py`: drop `ROOT = …parents[2]` (`:48`); data reads become: scenario `sid` → `paths.seed_dir('scenario', sid,
    <the spec seed>) / "rows.csv"` and its manifest (spec seeds: C2 2201, C4 2202, R1 2203, R2p 2204, R3 2205, T1p 2206,
    T2p 2207, T3 2208, T4 2209, D1c 2210, D1r 2211, N1c 2212, N1r 2213 — read from `fixtures/scenarios/specs/<id>.json`);
    R2-real / T1-real → `paths.real_fixture("<id>.rows.csv")` + `"<id>.manifest.json"`; C1 / T2-real →
    `paths.real_fixture("person_years.parquet")` (`:197`); C3 → `paths.seed_dir('world', 'W9-multiclass', 42) / "rows.csv"`
    (`:211`). The `source.file` strings in the output JSON keep their review spelling (`data/scenarios/<id>/rows.csv`,
    …) so outputs stay comparable with the review's JSON.
  - `_is_truth_path` (`:59-65`): the world-manifest clause becomes
    `"/world/" in norm and base == "manifest.json"` (the cache layout of §5.4) — keep the `truth*.{csv,json,parquet}` clause.
  - the CLI entry is `python -m truthsuite.refpipe.run <id> --out <file> [--shuffle-labels]`.
- [ ] Step 3: Run the ported tests (needs `pnpm run truth:data -- --set base` done):

```bash
cd $MJ/packages/AI/PredictiveStudio/TruthSuite && pnpm run test:python -- tests/test_run.py tests/test_scoring.py tests/test_splits.py tests/test_manifest.py 2>&1 | tail -1
# → 73 passed   (69 refpipe + 4 manifest, as in the review: evidence/logs/final/pytest-refpipe.txt "69 passed")
.venv/bin/python -m mypy --strict -p truthsuite.refpipe -p truthsuite.scenarios 2>&1 | tail -1
# → Success: no issues found in 11 source files
```

#### Task M5.3: The 18-of-18 reference reproduction check

**Files:** Create `fixtures/reference/p5-golden.json` (content below), `python/tests/test_reference_reproduction.py`

- [ ] Step 1: `fixtures/reference/p5-golden.json` — the review's committed reference results
  (`evidence/logs/P5/<id>.json`, extracted 2026-10-12; `value`/`ci` rounded to 10 significant decimals):

```json
{
  "C2": {"selected": "glm", "score": "logLoss", "value": 0.0866005444, "ci": [0.0768464522, 0.09774006], "nTest": 7500, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "979408ec8f980b785d632a85a723ff2f2f2a85e281a6fb2ecf9aa7f870db8080"},
  "C4": {"selected": "glm", "score": "logLoss", "value": 0.4481357304, "ci": [0.4303626301, 0.4673115428], "nTest": 3000, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "ede07ca3808f88a9b9398ad2bac2b1ae2e9704ef73101c15964d512151c21509"},
  "D1c": {"selected": "glm", "score": "logLoss", "value": 0.5861445448, "ci": [0.5696355416, 0.6028566181], "nTest": 4000, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "0a065a087710c04cd381c1f92ec8b8888c7a732b7c379ad6c1ffa74d3608d8ed"},
  "D1r": {"selected": "glm", "score": "rmse", "value": 4.164319376, "ci": [4.083736454, 4.241252794], "nTest": 4000, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "ededbeb1b76614181b6c80fe0dbe2aa05643d2139af1eed2390019bcfc1343cc"},
  "N1c": {"selected": "glm", "score": "logLoss", "value": 0.6705088211, "ci": [0.6594369223, 0.6815807199], "nTest": 1500, "outcome": "no-signal", "branch": "c:no-signal", "sha256": "7c4b14b7d1611f64aa5dd9400436e8444dc4bab47a4fec6bda79fc637e678232"},
  "N1r": {"selected": "glm", "score": "rmse", "value": 4.100665725, "ci": [3.963035406, 4.240188705], "nTest": 1500, "outcome": "no-signal", "branch": "c:no-signal", "sha256": "def22770674fbae98d7b78a5366b467b8e7037f3af31ecf27dc634c80ecac42f"},
  "R1": {"selected": "glm", "score": "rmse", "value": 4.971000452, "ci": [4.797989229, 5.139717894], "nTest": 1500, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "6725254f568f9cd36ea800452f3ff6dcad3dc674c206a2bdc86c77db8c1f2f51"},
  "R2p": {"selected": "glm", "score": "tweedieDeviance(power=1.5)", "value": 21.73642712, "ci": [20.92127048, 22.75292697], "nTest": 6250, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "3838dc9e965c19c67cdb2e4bb3e4c443d401e52559e55d8e722e800279174f1f"},
  "R3": {"selected": "glm", "score": "poissonDeviance", "value": 1.118965468, "ci": [1.066981239, 1.171340619], "nTest": 3000, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "995ba1d1d52b53097a646620b1bd3f5de7fb0f5ef49901b3d10e67a9035bf3fa"},
  "T1p": {"selected": "trend_season_ar1", "score": "mase", "value": 0.4401059204, "ci": [0.3645724719, 0.5401424002], "nTest": 144, "outcome": "model", "branch": "a:beats-best-simple", "sha256": "374a18588062ff367e299f51b51d87d2ca49d3006a83b868652a0cd80d5f711a"},
  "T2p": {"selected": "glm", "score": "rmse", "value": 1.559098962, "ci": [1.512303196, 1.608225373], "nTest": 2000, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "e9e1428f8df2b62e5d90e50ac06852b0d0544aa28e70c71da1ceb98f3f7dc313"},
  "T3": {"selected": "trend_season_ar1", "score": "mase", "value": 0.5574566548, "ci": [0.4980536165, 0.6218488533], "nTest": 144, "outcome": "model", "branch": "a:beats-best-simple", "sha256": "281740422cbdfcc353de4cc4bfae353ba0ca9494736fbe2a60dd2c77862eb148"},
  "T4": {"selected": "ar1_const", "score": "mase", "value": 0.6241706514, "ci": [0.4853774327, 0.7821028193], "nTest": 144, "outcome": "model", "branch": "a:Q15-only-model-beats-dummy", "sha256": "411fb72a9e797b6d5a41e721f3d1cb46a30bf6d4969a54adf03d6658d3d7bda5"},
  "R2-real": {"selected": "glm", "score": "tweedieDeviance(power=1.5)", "value": 27.76775776, "ci": [26.14390739, 29.32313042], "nTest": 1205, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "e265ea02f919c808b7b3e7690b78b73a3137ae1eb6e8654b2b8390dfa74150da"},
  "T1-real": {"selected": "trend_season_ols", "score": "mase", "value": 1.554571734, "ci": [1.109007989, 2.124346418], "nTest": 60, "outcome": "model", "branch": "a:Q15-only-model-beats-dummy", "sha256": "7adfd649f03f1916b627ce59a4abf2a5b7fd83e5db3e192881bef0ae5e5a1766"},
  "C1": {"selected": "glm", "score": "logLoss", "value": 0.365239432, "ci": [0.327995351, 0.4080320562], "nTest": 1205, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "3729e51a5ec8591ee588d45ae3aefe5fd75d1ac4891ce7de7f0c1b20b0eb7e51"},
  "T2-real": {"selected": "glm", "score": "logLoss", "value": 0.365239432, "ci": [0.327995351, 0.4080320562], "nTest": 1205, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "3729e51a5ec8591ee588d45ae3aefe5fd75d1ac4891ce7de7f0c1b20b0eb7e51"},
  "C3": {"selected": "glm", "score": "multiclassLogLoss", "value": 0.7174426684, "ci": [0.6899352703, 0.7426981742], "nTest": 3000, "outcome": "keep-simple-baseline", "branch": "b:keep-simple-baseline", "sha256": "4172e642ca316dda07e37fc3d8869d3d3740689f12c15fa0a8cf0a6141c9be6d"},
  "C2-shuffled": {"selected": "glm", "score": "logLoss", "value": 0.1014005118, "ci": [0.0890051899, 0.1142376472], "nTest": 7500, "outcome": "no-signal", "branch": "c:no-signal", "sha256": "979408ec8f980b785d632a85a723ff2f2f2a85e281a6fb2ecf9aa7f870db8080"},
  "N1c-shuffled": {"selected": "glm", "score": "logLoss", "value": 0.6748277846, "ci": [0.6637157876, 0.6858792741], "nTest": 1500, "outcome": "no-signal", "branch": "c:no-signal", "sha256": "7c4b14b7d1611f64aa5dd9400436e8444dc4bab47a4fec6bda79fc637e678232"}
}
```

- [ ] Step 2: The test (marked `slow`; runs in the nightly lane and in M5's exit tests):

```python
"""The ported reference pipeline reproduces the review's 18 committed results (+ the two shuffled-label controls)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from truthsuite.paths import FIXTURES

GOLDEN: dict[str, dict[str, object]] = json.loads((FIXTURES / "reference" / "p5-golden.json").read_text())
IDS = sorted(GOLDEN)


@pytest.mark.slow
@pytest.mark.parametrize("ref_id", IDS)
def test_reference_result_reproduces(ref_id: str, tmp_path: Path) -> None:
    sid, shuffled = (ref_id.removesuffix("-shuffled"), ref_id.endswith("-shuffled"))
    out = tmp_path / f"{ref_id}.json"
    cmd = [sys.executable, "-m", "truthsuite.refpipe.run", sid, "--out", str(out)] + (["--shuffle-labels"] if shuffled else [])
    subprocess.run(cmd, check=True, cwd=Path(__file__).resolve().parents[1])
    got = json.loads(out.read_text())
    want = GOLDEN[ref_id]
    assert got["selected"] == want["selected"]
    assert got["primaryScore"]["name"] == want["score"]
    assert round(got["primaryScore"]["value"], 10) == pytest.approx(want["value"], abs=1e-9)
    assert [round(x, 10) for x in got["primaryScore"]["ci"]] == pytest.approx(want["ci"], abs=1e-9)
    assert got["primaryScore"]["nTest"] == want["nTest"]
    assert got["gateOutcome"] == want["outcome"]
    assert got["gate"]["branch"] == want["branch"]
    assert got["source"]["sha256"] == want["sha256"]
```

  `pytest.ini`: `markers = slow: minutes-long reproduction runs` and `addopts = -m "not slow"` (so the default unit run
  stays fast); run the slow set explicitly with `-m slow`.
- [ ] Step 3: `pnpm run test:python -- -m slow tests/test_reference_reproduction.py 2>&1 | tail -1` → `20 passed`
  (18 references + 2 shuffled controls; the review's own reproduction was 18/18 `match=True`, `logs/P6/ref/ref.txt`, and
  its determinism 20/20 byte-identical re-runs, `logs/P5/determinism.txt`). Record the wall time (the review measured
  refpipe tests at 78.5 s; the 20 runs take several minutes).

#### Task M5.4: Port the judges

**Files:** Create `python/truthsuite/judges/{__init__.py, judge.py, judge_multiclass.py, verdicts.py, delong.py,
holdout_rebuild.py, scenarios.py, cli.py}`, `python/tests/test_judges.py`

- [ ] Step 1: Copy and verify:

```bash
R=/Users/arieglazier/repos/ps-review/probes; J=$MJ/packages/AI/PredictiveStudio/TruthSuite/python/truthsuite/judges; mkdir -p $J && touch $J/__init__.py
cp $R/loom-worlds/judge.py $J/judge.py; cp $R/loom-worlds/judge_multiclass.py $J/judge_multiclass.py
cp $R/loom-worlds/L4_verdicts.py $J/verdicts.py; cp $R/loom-worlds/L4_delong.py $J/delong.py
cp $R/ps-runner/judge_scenarios.py $J/scenarios.py; cp $R/ps-runner/test_judge_scenarios.py $MJ/packages/AI/PredictiveStudio/TruthSuite/python/tests/test_judge_scenarios.py
cd $J && shasum -a 256 judge.py judge_multiclass.py verdicts.py delong.py scenarios.py | cut -c1-12
# → e78f8411086b 481df9784ea8 0b1543f53f51 c3a1962579b2 eba51c65f7e7
```

- [ ] Step 2: Edits: `judge.py`'s `append_row(…, out='evidence/truth-results.csv')` (`:156`) and
  `judge_multiclass.py`'s output (`:92`, `:207`) take an explicit `--out-dir` (default `$TRUTH_RESULTS_DIR/judges`),
  never the cwd; `verdicts.py`/`delong.py` import `truthsuite.judges.judge` and read `--results-dir` instead of
  `evidence/…`; `scenarios.py` imports `truthsuite.refpipe` and reads run directories passed as arguments; every
  absolute `/Users/arieglazier/…` path and `MJ_6_2_PSREVIEW_arie` reference is removed
  (`grep -rn "arieglazier\|PSREVIEW\|evidence/" python/truthsuite` → nothing). `holdout_rebuild.py` is extracted from
  `judge.py:96-133` (`sqlserver_guid_key`, the trailing-n rebuild preferring `lineage.lockedHoldoutRowCount`) with a
  CLI `python -m truthsuite.judges.holdout_rebuild --rows <rows.csv> --model <model.json> --label <col>` printing
  `{"n": …, "positives": …, "ids": [...]}`. `cli.ts`-style dispatch lives in `judges/cli.py`
  (`python -m truthsuite.judges.cli <judge> …`, JSON on stdout) for `judge-bridge.ts`.
- [ ] Step 3: Tests `python/tests/test_judges.py`:

```python
from __future__ import annotations

import uuid

from truthsuite.judges.holdout_rebuild import sqlserver_guid_key, trailing_holdout
from truthsuite.judges.delong import delong_paired_z


def test_sqlserver_guid_order_sorts_by_the_last_six_bytes_first() -> None:
    a = uuid.UUID("00000000-0000-0000-0000-000000000001")
    b = uuid.UUID("01000000-0000-0000-0000-000000000000")
    # SQL Server compares bytes 10-15 first, so a (…0001 in the node) sorts after b.
    assert sorted([str(a), str(b)], key=sqlserver_guid_key) == [str(b), str(a)]


def test_trailing_holdout_takes_the_last_n_rows_in_sql_server_order() -> None:
    ids = [str(uuid.UUID(int=i << 0)) for i in range(1, 11)]
    labels = {i: (1 if k % 2 else 0) for k, i in enumerate(ids)}
    held = trailing_holdout(ids, labels, n_hold=3)
    assert len(held) == 3 and set(held) <= set(ids)
    assert held == sorted(ids, key=sqlserver_guid_key)[-3:]


def test_delong_detects_a_strictly_better_scorer() -> None:
    y = [0, 0, 0, 0, 1, 1, 1, 1] * 50
    perfect = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9] * 50
    noisy = [0.5, 0.2, 0.6, 0.4, 0.4, 0.7, 0.3, 0.9] * 50
    z = delong_paired_z(y, perfect, noisy)
    assert z > 3.09   # one-sided p < 0.001, the leak rule's threshold (18-rec:1808)
```

  (Name the functions as the port exposes them: `L4_delong.py` computes the paired DeLong z; expose it as
  `delong_paired_z(y, a, b)`; `judge.py`'s rebuild becomes `trailing_holdout(ids, labels, n_hold)`. Keep the review's
  arithmetic.)
- [ ] Step 4: `pnpm run test:python 2>&1 | tail -1` → all passed, 0 failed (73 + the 3 judge tests + the ported
  `test_judge_scenarios.py`, 3 test functions in the review; record the exact count); `mypy --strict -p truthsuite` → `Success`.

#### Task M5.5: Statistical rule scripts (Python mirror, for later owners)

**Files:** Create `python/truthsuite/stats/{__init__.py, noise_publish.py, coverage.py, monitor_m.py}`, `python/tests/test_stats.py`

- [ ] Step 1: Copy `evidence/logs/P11/noise_publish_n400.py` (sha `03fa9c1f1c2d`) → `noise_publish.py`,
  `evidence/logs/P1/st5_power.py` (`1e56fe0b713e`) → `coverage.py`, and the replay generators + BH procedure of
  `evidence/logs/P11/D2/d2_power.py` (`ad1a43257fb6`) → `monitor_m.py` with the module constants
  `Q12 = 0.0095` and `Q3 = 0.0171` (the current values, `P11-roadmap.md:347-350`) and no `print` of the withdrawn
  0.01004 / 0.01737 (`grep -n "0.01004\|0.01737" python/truthsuite` → nothing). `qcal.py`'s absolute
  `sys.path.insert` is not ported (PR 4 re-calibrates from `monitor_m` when it implements monitor M).
- [ ] Step 2: `tests/test_stats.py` asserts `max_accepted_publications(400) == 28`, the coverage acceptance range
  `(372, 388)`, and the pass probabilities 0.969 / 0.023 / 0.950 / 0.550 to 3 dp — the same numbers M2.4 asserts in
  TypeScript (two implementations, one answer).
- [ ] Step 3: `pnpm run test:python 2>&1 | tail -1` → all passed, 0 failed (the M5.4 count + the new stats tests; record it).

#### Task M5.6: The TypeScript harness

**Files:** Create `src/harness/{types.ts (§5.7), connect.ts, entities.ts, datasets.ts, pipelines.ts, train.ts, score.ts,
promote.ts, agent-plan.ts, agent.ts, agent-step.ts, story-step.ts, judge-bridge.ts, artifacts.ts, containment-probe.ts (§5.8),
run-fixtures.ts}` — each module's exports are the public statics of one class named for it (program D-037, ruling SR-1):
`MJAPIConnection` (connect), `TruthEntities` (entities), `HarnessDatasets`, `HarnessPipelines`, `HarnessTraining` (train),
`HarnessScoring` (score), `HarnessModels` (promote), `HarnessAgent` (agent), `AgentPlans` (agent-plan: `Build(input: AgentPlanInput): ModelingPlanSpec`, the pure plan
builder; `AgentPlanInput { Name; Entity; Target; Features; Algorithms; DenyFields }`), `JudgeBridge`, `HarnessArtifacts`,
`ContainmentProbe`, `RunFixtures` ·
Test `src/harness/__tests__/agent-plan.test.ts`

Port from `probes/ts/probe-truth-harness.ts` (`1d4cebb3b9f1`), `ps-client.ts` (`bd87208942b3`),
`probe-truth-agent-step.ts` (`074b44d01fcf`), keeping their PS calls and changing their plumbing:

- [ ] Step 0: Add `export class TrustVerdicts { public static DeriveTrustVerdict(…); public static TrustEvidenceLine(…) }` in `Core/src/trust.ts` so `TruthSuite`'s harness calls `TrustVerdicts.DeriveTrustVerdict` and `TrustVerdicts.TrustEvidenceLine` (matching PR 3's contract), while keeping `DeriveTrustVerdict` and `TrustEvidenceLine` exported so untouched files (`Engine/src/agent/pipeline-builder.ts` per D-030 / §7 line 9650, `packages/TestingFramework/integration-test-suite/rigs/ps-inproc-agent-builder.ts`, and `business-predictions.view-models.ts`) are not modified (`§9 D2-48`). Delete `Core/src/trust.ts`'s `@deprecated` camelCase aliases `deriveTrustVerdict`, `trustEvidenceLine` and `trustDots`, and update `Core/src/__tests__/trust.test.ts` and `ps-predictions-resource.component.ts` (both modified in C4/C5) to use `TrustVerdicts` / `TrustDots`.

- [ ] Step 1: Failing test for the pure plan builder:

```ts
import { describe, it, expect } from 'vitest';
import { AgentPlans } from '../agent-plan';
import type { EntityInfo } from '@memberjunction/core';

const entity = { Name: 'PS Truth: W3_MembershipYear', Fields: [
  { Name: 'Plan', TSType: 'string' }, { Name: 'EventsAttended', TSType: 'number' }, { Name: 'Status', TSType: 'string' },
] } as unknown as EntityInfo; // test double: only Name/Fields are read by AgentPlans.Build

describe('AgentPlans.Build', () => {
  it('builds an approved plan with one experiment per algorithm in the given order', () => {
    const plan = AgentPlans.Build({ Name: 'PSTruth: G0.3 lr-first', Entity: entity, Target: 'Renewed', Features: ['Plan', 'EventsAttended', 'Status'],
      Algorithms: ['logistic_regression', 'xgboost'], DenyFields: ['ID', 'PersonID', 'WorldID', 'Seed'] });
    expect(plan.Approved).toBe(true);
    expect(plan.ProposedExperiments?.map((e) => e.AlgorithmName)).toEqual(['logistic_regression', 'xgboost']);
    expect(plan.CandidateFeatures?.find((f) => f.Name === 'Plan')?.Kind).toBe('categorical');
    expect(plan.ValidationStrategy).toEqual({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 });
  });
});
```

  (`as unknown as EntityInfo` is confined to this test double; production code never casts.)
- [ ] Step 2: run → import failure.
- [ ] Step 3: Implement. Key code:

```ts
// connect.ts — MJAPI over GraphQL, exactly as a browser client (API key auth).
import { BootstrapIntegrationClient } from '@memberjunction/testing-integration';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { UserInfo } from '@memberjunction/core';
import '@memberjunction/core-entities';

/** The harness's one MJAPI connection. */
export class MJAPIConnection {
  /** Connects as the API key's user; throws when MJAPI is down or the key resolves no user. */
  public static async Connect(): Promise<{ Provider: GraphQLDataProvider; User: UserInfo }> {
    await BootstrapIntegrationClient(); // preflights http://localhost:$GRAPHQL_PORT/ (or MJAPI_URL) and authenticates with MJ_API_KEY
    const provider = GraphQLDataProvider.Instance;
    const user = provider.CurrentUser;
    if (!user) throw new Error('No current user after BootstrapIntegrationClient: check MJ_API_KEY and that MJAPI is up');
    return { Provider: provider, User: user };
  }
}
```

```ts
// entities.ts — pstruth entities are resolved by table, never by a guessed name.
import type { EntityInfo } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** Test-schema entities, resolved by table. */
export class TruthEntities {
  /** The registered entity of `pstruth.<table>`; throws naming the fix when CodeGen has not registered it. */
  public static ForTable(provider: GraphQLDataProvider, table: string): EntityInfo {
    const entity = provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === table);
    if (!entity) throw new Error(`No MJ entity for pstruth.${table}: run truth:provision, then restart MJAPI`);
    return entity;
  }
}
```

```ts
// pipelines.ts — the review's runDirect pipeline, parameterised (probe-truth-harness.ts:301-324).
/** The harness's pipeline members. */
export class HarnessPipelines {
  private static lastTimeIndexDeclared = false;

  /** Creates and saves a truth-suite pipeline from a spec; throws with the save's message when it fails. */
  public static async CreatePipeline(provider: GraphQLDataProvider, user: UserInfo, algos: readonly AlgorithmRow[], spec: PipelineSpec): Promise<MJMLTrainingPipelineEntity> {
    const algo = algos.find((a) => a.DriverClass === spec.Algorithm);
    if (!algo) throw new Error(`algorithm '${spec.Algorithm}' is not in MJ: ML Algorithms`);
    const p = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    p.NewRecord();
    p.Name = spec.Name;
    p.Description = 'Predictive Studio truth suite (safe to delete)';
    p.Version = 1;
    p.Status = 'Draft';
    p.TargetEntityID = spec.Dataset.Entity.ID;
    p.TargetVariable = spec.Target;
    p.ProblemType = spec.ProblemType;
    p.AlgorithmID = algo.ID;
    p.SourceBindings = JSON.stringify([{ Kind: 'Entity', Ref: spec.Dataset.Entity.Name }]);
    p.FeatureSteps = JSON.stringify(HarnessPipelines.featureSteps(spec.Dataset.Entity, spec.Features));
    p.AsOfStrategy = JSON.stringify(spec.AsOf);
    p.LeakageGuard = JSON.stringify({ DenyFields: spec.DenyFields, SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT });
    p.ValidationStrategy = JSON.stringify(spec.Validation);
    // The time-index declaration is applied before the single Save, so it is saved with the pipeline (G0.11).
    HarnessPipelines.lastTimeIndexDeclared = spec.TimeIndexColumn !== undefined && ContainmentProbe.ApplyTimeIndexDeclaration(p, spec.TimeIndexColumn);
    if (!(await p.Save())) throw new Error(`pipeline save failed: ${p.LatestResult?.CompleteMessage || 'no message'}`);
    return p;
  }

  /** What the time-index declaration answered for the last CreatePipeline (TruthHarness.LastTimeIndexDeclared). */
  public static LastTimeIndexDeclared(): boolean {
    return HarnessPipelines.lastTimeIndexDeclared;
  }
}
```

  (`HarnessPipelines.featureSteps`, a private static, is the review's `featureSteps` (`:282-292`): one `select` of the
  features plus a `onehot` per string field.) `HarnessTraining.Train` (`train.ts`) wraps `new PredictiveStudioTrainModelOperation().Execute({ pipelineId: pipeline.ID, maxRows: opts?.MaxRows, asOf: opts?.AsOf,
  sidecarVersion: 'truth-suite' }, { provider, user })` into a `TrainAttempt` (never throws for `Success: false`).
  `HarnessScoring.Score` (`score.ts`) wraps `PredictiveStudioScoreRecordSetOperation` into a `ScoreAttempt`, and `HarnessScoring.ScoreViaRecordProcess` ports
  the review's `CreateScoringProcess` + `RecordProcess.RunNow` + Process Run Details read
  (`probe-truth-harness.ts:440-560`; read details with `IgnoreMaxRows: true`, `BypassCache: true`). `HarnessModels.Promote` (`promote.ts`) wraps
  `PredictiveStudioPromoteModelOperation` into a `PromoteAttempt`. `HarnessModels.ReadModel` ports `readCandidates` (`:403-436`), adding
  `HoldoutRowCount = lineage.lockedHoldoutRowCount` and the raw `Lineage`/`ValidationResults` JSON, with one change:
  the review computed `trust` from `{ Metrics, HoldoutMetrics, ProblemType }` only (`:448`); the port passes the loaded
  entity itself, `Trust: TrustVerdicts.DeriveTrustVerdict(m)` (`MJMLModelEntity` satisfies `TrustModelInput`), so every field the
  verdict reads — from C5 on, `Lineage` — reaches it (§9 D2-26). `HarnessTraining.Train` returns `{ Ok: false, ModelID: null,
  TrainingRunID: null, ErrorMessage }` whenever the operation's `Success` is false or it has no `Output`; it never throws
  for a product refusal. `HarnessDatasets` (`datasets.ts`)
  implements `EnsureLoaded` with M3's `DatasetCatalog.EnsureGenerated` + M4's loaders (opens one `mssql` pool per run) and returns the
  entity from `TruthEntities.ForTable`; `series-origin` refs call `ScenarioLoader.FillSeriesTrain`. `CountNonNull`/`ResetColumn` run
  `SELECT COUNT(*) … WHERE TruthScore IS NOT NULL` / `UPDATE … SET TruthScore = NULL` on the dataset's row table
  through the same pool (direct SQL on the test schema only, sanctioned by the entities' `AllowDirectSQLUpdate`, D-040).
  `HarnessAgent.RunBuilderAgent` (`agent.ts`) writes the plan to `$TRUTH_RESULTS_DIR/agent/<name>.plan.json`, spawns
  `npx tsx src/harness/agent-step.ts --plan … --out …` **asynchronously** (the review's lesson: a blocking `execFileSync`
  longer than MJAPI's keep-alive window breaks the pooled GraphQL socket, `probe-truth-harness.ts:264-268`) and reads the
  `AgentStepResult`. `agent-step.ts` is the review's agent leg on the framework bootstrap:

```ts
// agent-step.ts — runs the registered `Pipeline Builder` code agent in-process (server provider; no AI model call).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import '@memberjunction/server-bootstrap-lite';
import '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import { BootstrapIntegrationServer } from '@memberjunction/testing-integration';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { LoadMLModelInferenceProcessor, type PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import type { AgentStepResult } from './types';

LoadMLModelInferenceProcessor();

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { plan: { type: 'string' }, out: { type: 'string' } } });
  if (!values.plan || !values.out) throw new Error('usage: agent-step.ts --plan <file> --out <file>');
  const plan = SafeJSONParse<ModelingPlanSpec>(readFileSync(values.plan, 'utf8'));
  if (!plan) throw new Error(`Invalid plan JSON in ${values.plan}`);
  const ctx = await BootstrapIntegrationServer();
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => a.Name?.toLowerCase() === 'pipeline builder');
  if (!agent || agent.DriverClass !== 'PredictiveStudioPipelineBuilderAgent') {
    throw new Error(`'Pipeline Builder' agent missing or has DriverClass '${agent?.DriverClass || 'none'}'`);
  }
  const t0 = Date.now();
  const result = await new AgentRunner(ctx.Provider).RunAgent<Record<string, never>, PredictiveStudioBuilderPayload>({
    agent, conversationMessages: [{ role: 'user', content: 'build it' }], contextUser: ctx.User, payload: plan,
  });
  const build = result.payload?.BuildResult || null;
  const out: AgentStepResult = {
    AgentRunID: result.agentRun?.ID || null, AgentSuccess: result.success, AgentErrorMessage: result.agentRun?.ErrorMessage || null,
    BuildModelID: build?.modelId || null, BuildSuccess: build?.success === true, BuildErrorMessage: build?.errorMessage || null,
    WallMs: Date.now() - t0,
  };
  writeFileSync(values.out, JSON.stringify(out, null, 2));
  await ctx.ClosePool();
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(2);
}
```

  `HarnessAgent.GenerateStory(modelId)` (G0.6's "generated stories", §9 D2-24) is `agent.ts`'s second leg: it spawns
  `npx tsx src/harness/story-step.ts --model <id> --out <file>` the same asynchronous way and returns the file's
  `story`. The story is what the Model Development Agent tells a user about a finished build — its "4. Report" step,
  the story-generation prompt S9.3 names — asked for in one turn about a model that already exists:

```ts
// story-step.ts — one Model Development Agent turn that reports on an existing model (live AI model; server provider).
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import '@memberjunction/server-bootstrap-lite';
import '@memberjunction/core-entities';
import { SafeJSONParse } from '@memberjunction/global';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { BootstrapIntegrationServer } from '@memberjunction/testing-integration';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { TrustVerdicts } from '@memberjunction/predictive-studio-core';

/** The facts a user would have after a build, in the words the agent receives them. */
function storyRequest(model: MJMLModelEntity): string {
  const trust = TrustVerdicts.DeriveTrustVerdict(model);
  const weights = Object.entries(SafeJSONParse<Record<string, number>>(model.FeatureImportance || '{}') || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, w]) => `${f} (${(w * 100).toFixed(1)}%)`).join(', ');
  return [
    `Our model predicting ${model.TargetVariable} is already built and trained (ML Model ${model.ID}, version ${model.Version}).`,
    `Holdout metrics: ${model.HoldoutMetrics || 'none'}. Trust: ${trust.grade} — ${trust.oneLiner}`,
    `Feature weights recorded for it: ${weights || 'none'}.`,
    'Do not call any sub-agent or action and do not train anything. Give me the summary you give after a build',
    '(your "Report" step): what it predicts, how good it is with the metric explained, and which features it weighted most.',
  ].join('\n');
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { model: { type: 'string' }, out: { type: 'string' } } });
  if (!values.model || !values.out) throw new Error('usage: story-step.ts --model <id> --out <file>');
  const ctx = await BootstrapIntegrationServer();
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => a.Name === 'Model Development Agent');
  if (!agent) throw new Error("'Model Development Agent' is not in the agent metadata");
  // The run-scoped provider the bootstrap set up, not the process-global one (coding standards §6).
  const model = await ctx.Provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
  if (!(await model.Load(values.model))) throw new Error(`ML Model ${values.model} not found`);
  const result = await new AgentRunner(ctx.Provider).RunAgent({
    agent, conversationMessages: [{ role: 'user', content: storyRequest(model) }], contextUser: ctx.User, absoluteMaxIterations: 3,
  });
  // The user-facing text of the run's final step; null when the agent ended without one (counts as "no story").
  const story = result.success && result.agentRun?.Message ? result.agentRun.Message : null;
  writeFileSync(values.out, JSON.stringify({ story, agentRunId: result.agentRun?.ID || null, finalStep: result.agentRun?.FinalStep || null }, null, 2));
  await ctx.ClosePool();
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(2);
}
```

  `judge-bridge.ts`: `JudgeBridge.Judge<T>(module, args)` spawns `<TruthSuite>/.venv/bin/python -m truthsuite.judges.<module> …`
  (cwd `python/`, env as `run-pytest.mjs`), parses stdout as JSON, throws with stderr on a non-zero exit.
  `run-fixtures.ts` builds the harness as **one object literal** (later PRs add members here; PR 3 adds
  `ReadWorldTruth`, `SampleRowIds`, `ResolveProvenance`, `UseSuiteSidecar` from its `harness-extensions.ts`). Each
  module above exports one class whose public static is named after the member it implements, taking a `RunContext`
  first:

```ts
// run-fixtures.ts — the memoised per-process harness. Add a member: extend TruthHarness (types.ts), then add one line here.
import { randomUUID } from 'node:crypto';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { UserInfo } from '@memberjunction/core';
import { MJAPIConnection } from './connect';
import { HarnessDatasets, type DatasetPool } from './datasets';
import { HarnessPipelines, type AlgorithmRow } from './pipelines';
import { HarnessTraining } from './train';
import { HarnessScoring } from './score';
import { HarnessModels } from './promote';
import { HarnessAgent } from './agent';
import { JudgeBridge } from './judge-bridge';
import { HarnessArtifacts } from './artifacts';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from './w-world';
import type { CandidateModel, LoadedDataset, TruthHarness } from './types';

/** What every harness member closes over: one MJAPI connection, one mssql pool, the algorithm catalogue, the run id. */
export interface RunContext {
  readonly Provider: GraphQLDataProvider;
  readonly User: UserInfo;
  readonly Pool: DatasetPool;
  readonly Algorithms: readonly AlgorithmRow[];
  readonly RunID: string;
}

/** The per-process harness the gates run against, and the fixture models several gates share. */
export class RunFixtures {
  private static harness: Promise<TruthHarness> | null = null;
  private static w1Draft: Promise<CandidateModel> | null = null;
  private static w1Validated: Promise<CandidateModel> | null = null;

  /** The run's harness, built on first use and shared by every gate of the process. */
  public static GetRunHarness(): Promise<TruthHarness> {
    RunFixtures.harness ||= RunFixtures.buildHarness();
    return RunFixtures.harness;
  }

  /** Trains a logistic-regression model on the given dataset (`MaxRows: 1_000_000`) and returns its `ModelID`. */
  public static async TrainedModel(h: TruthHarness, tag: string, dataset: LoadedDataset): Promise<string> {
    const p = await h.CreatePipeline({
      Name: `PSTruth: ${tag} ${h.RunID}`, Dataset: dataset, Target: 'Renewed', ProblemType: 'classification',
      Features: [...W_WORLD_FEATURES], Algorithm: 'logistic_regression', AsOf: { Mode: 'none' },
      Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 }, DenyFields: [...W_WORLD_DENY_FIELDS],
    });
    const t = await h.Train(p, { MaxRows: 1_000_000 });
    if (!t.ModelID) throw new Error(`${tag} training failed: ${t.ErrorMessage || 'no model id'}`);
    return t.ModelID;
  }

  /** Memoised W1 s42 Draft logistic-regression model (`MaxRows: 1_000_000`). */
  public static W1S42Model(h: TruthHarness): Promise<CandidateModel> {
    RunFixtures.w1Draft ||= (async (): Promise<CandidateModel> => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const id = await RunFixtures.TrainedModel(h, 'fixture W1 s42 draft', w1);
      return h.ReadModel(id);
    })();
    return RunFixtures.w1Draft;
  }

  /** Memoised W1 s42 Validated logistic-regression model (`MaxRows: 1_000_000`), promoted via `h.Promote`. */
  public static W1S42ValidatedModel(h: TruthHarness): Promise<CandidateModel> {
    RunFixtures.w1Validated ||= (async (): Promise<CandidateModel> => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const id = await RunFixtures.TrainedModel(h, 'fixture W1 s42 validated', w1);
      const promoted = await h.Promote(id, 'Validated', 'truth suite fixture: promote');
      if (!promoted.Promoted) throw new Error(`could not promote fixture W1 s42 model (${promoted.Status})`);
      return h.ReadModel(id);
    })();
    return RunFixtures.w1Validated;
  }

  /** One object literal: a TruthHarness member without a line here is a compile error. */
  private static async buildHarness(): Promise<TruthHarness> {
    const { Provider: provider, User: user } = await MJAPIConnection.Connect();
    const ctx: RunContext = {
      Provider: provider, User: user, Pool: await HarnessDatasets.OpenDatasetPool(),
      Algorithms: await HarnessPipelines.LoadAlgorithms(provider, user), RunID: process.env.TRUTH_RUN_ID || randomUUID(),
    };
    return {
      Provider: provider,
      User: user,
      RunID: ctx.RunID,
      EnsureLoaded: (ref) => HarnessDatasets.EnsureLoaded(ctx, ref),
      CreatePipeline: (spec) => HarnessPipelines.CreatePipeline(ctx.Provider, ctx.User, ctx.Algorithms, spec),
      LastTimeIndexDeclared: () => HarnessPipelines.LastTimeIndexDeclared(),
      Train: (pipeline, opts) => HarnessTraining.Train(ctx, pipeline, opts),
      RunBuilderAgent: (plan) => HarnessAgent.RunBuilderAgent(ctx, plan),
      ReadModel: (modelId) => HarnessModels.ReadModel(ctx, modelId),
      ModelsForPipelineNamePrefix: (prefix) => HarnessModels.ModelsForPipelineNamePrefix(ctx, prefix),
      Promote: (modelId, target, reason) => HarnessModels.Promote(ctx, modelId, target, reason),
      Score: (modelId, req) => HarnessScoring.Score(ctx, modelId, req),
      ScoreViaRecordProcess: (modelId, dataset, extraFilter) => HarnessScoring.ScoreViaRecordProcess(ctx, modelId, dataset, extraFilter),
      CountNonNull: (dataset, column) => HarnessDatasets.CountNonNull(ctx, dataset, column),
      ResetColumn: (dataset, column) => HarnessDatasets.ResetColumn(ctx, dataset, column),
      GenerateStory: (modelId) => HarnessAgent.GenerateStory(ctx, modelId),
      Judge: (module, args) => JudgeBridge.Judge(module, args),
      WriteArtifact: (name, data) => HarnessArtifacts.WriteArtifact(name, data),
    };
  }
}
```

  (`HarnessArtifacts.WriteArtifact` writes `$TRUTH_RESULTS_DIR/artifacts/<name>.json` and returns the
  path; `HarnessDatasets.OpenDatasetPool`/`HarnessPipelines.LoadAlgorithms` are the pool and `MJ: ML Algorithms` reads
  `datasets.ts`/`pipelines.ts` already perform, public so the context holds one of each.) A `TruthHarness` member without a line here is a
  compile error, which is how a later PR's extension is checked.
  `run-fixtures.ts`: `RunFixtures.GetRunHarness()` connects once per process and memoises; `RunFixtures.W1S42Model(h)` trains (once per run)
  a logistic-regression model on all W1 s42 rows (`MaxRows: 1_000_000`) and leaves it **Draft** (G0.7's Draft case);
  `RunFixtures.W1S42ValidatedModel(h)` trains a second one the same way and promotes it to **Validated** through the product's promote
  operation (`h.Promote`, the call a Studio user's promote makes) — the scorable model G0.1's scoring half, G0.4/G0.5, G0.6's stories and G0.7's dry-run case use
  (after C3 a Draft model is no longer scorable, so nothing but G0.7's refusal case may score with a Draft model).
- [ ] Step 4: `pnpm test -- agent-plan` → `1 passed`; `pnpm run build` → exit 0.
- [ ] Step 5: Mutation checks (§6 shared notes), run after M5.9 Step 4 has a baseline: `HarnessTraining.Train` rethrowing when the
  operation returns `Success: false` → G0.8 reports `error` instead of `xfail`/`xpass` (the "never throws for a
  product refusal" contract); `HarnessModels.ReadModel` computing `Trust` from `{ Metrics, HoldoutMetrics, ProblemType }` instead of
  the entity (§9 D2-26) → after C5, G0.11 reports `withheldVerdictsStored` 12 but `gradedAbovePoorOrActionable` > 0
  (C5.8 Step 2) — record both runs; `CreatePipeline`'s `p.Save()` check deleted → not exposed (a failed save then
  fails at training with a missing pipeline) — record it.

#### Task M5.7: Single-threaded sidecar and the run orchestrator

**Files:** Create `scripts/sidecar.mts`, `scripts/run-truth.mjs`; Modify `package.json`
(`"truth:sidecar": "tsx scripts/sidecar.mts"`)

- [ ] Step 1: `scripts/sidecar.mts` starts the product sidecar in managed mode with single-threaded math and stays up:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

// One thread everywhere: G0.10 compares two trainings to 1e-9, and equal results across machines need it.
for (const v of ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS']) process.env[v] = '1';
process.env.PYTHONHASHSEED = '0';
delete process.env.PREDICTIVE_STUDIO_SIDECAR_URL; // this process owns the sidecar

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runDir = path.join(root, '.run');
mkdirSync(runDir, { recursive: true });
const sidecar = new MLSidecar();             // interpreter: PREDICTIVE_STUDIO_PYTHON, else the Sidecar venv
await sidecar.start();
const url = `http://127.0.0.1:${sidecar.Port}`;
writeFileSync(path.join(runDir, 'sidecar.url'), url);
console.log(`truth sidecar up at ${url} (single-threaded)`);
const stop = async (): Promise<void> => { await sidecar.stop(); process.exit(0); };
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
setInterval(() => undefined, 60_000);       // keep the event loop alive
```

- [ ] Step 2: `scripts/run-truth.mjs --mode pr|nightly|weekly [--gate "<testName>"]`: checks `.run/sidecar.url`
  answers `/health`; checks MJAPI answers on `http://localhost:$GRAPHQL_PORT/`; sets `TRUTH_RUN_MODE`,
  `TRUTH_RUN_ID` (`<mode>-<UTC timestamp>`), `TRUTH_MJ_COMMIT` (`git rev-parse --short HEAD`),
  `TRUTH_RESULTS_DIR` (`results/<run id>`); runs `pnpm run truth:data -- --set base` (and `--set t2 --only W2-noise` for
  nightly/weekly), then `vitest run --config vitest.gates.config.ts [-t "<pattern>"]`, then `scripts/report.mjs`; exits with the report's code. Without `--gate`, the gate
  run is unfiltered. With `--gate "<testName>"`: `<pattern>` is the test name with regex metacharacters escaped, so
  vitest runs that gate's body (and, harmlessly, any stub whose name extends it, e.g. `W1 → S7.5 #2`). Unknown names exit 2 with `no gate named "<testName>"`. It prints, before running, the MJAPI start command it expects:
  `PREDICTIVE_STUDIO_SIDECAR_URL=$(cat <TruthSuite>/.run/sidecar.url) pnpm --filter mj_api start`.
- [ ] Step 3: Local loop:

```bash
cd $MJ/packages/AI/PredictiveStudio/TruthSuite
pnpm run truth:sidecar > /tmp/truth-sidecar.log 2>&1 &
until [ -s .run/sidecar.url ]; do sleep 1; done; cat .run/sidecar.url          # → http://127.0.0.1:<port>
(cd $MJ/packages/MJAPI && PREDICTIVE_STUDIO_SIDECAR_URL=$(cat $MJ/packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url) pnpm start > /tmp/mjapi-pr2.log 2>&1 &)
until curl -s -o /dev/null --max-time 3 http://localhost:$GRAPHQL_PORT/; do sleep 5; done; echo UP
```

#### Task M5.8: Harness smoke against the review's numbers

- [ ] Step 1: A one-off script `scripts/smoke-w1.mts` (kept; `pnpm run truth:smoke`): loads W1 s42, trains logistic
  regression with `MaxRows: 1_000_000` (the review's `full` regime), reads the model, scores the 1,625 rows of
  `[Year] = 2024 AND Region = 'NA'` through the record-process path, and prints training/holdout rows, holdout AUC and
  the record-process run status.
- [ ] Step 2: Expected (`evidence/12-scoring-ui.md` "Retrained with the L3 harness"): `train 13421 / holdout 3355`,
  `holdout AUC 0.723051942813813` (to 1e-9 — same rows, same algorithm, deterministic), `1625 Succeeded`. A different
  AUC means a porting error in the pipeline definition (features, one-hot steps, deny list, validation) — diff the
  pipeline JSON against `probe-truth-harness.ts:301-324` and fix before continuing.
- [ ] Step 3: Check the database: `SELECT Status, COUNT(*) FROM __mj.vwMLModels WHERE Pipeline LIKE 'PSTruth:%' GROUP BY Status`
  (→ `Draft 1`), and that the sidecar log shows the training request.

#### Task M5.9: The Phase-0 gate bodies (G0.1–G0.3, G0.6–G0.12)

**Files:** Create `gates/containment.gates.test.ts`, `src/gates/causal-copy.ts`, `src/harness/w-world.ts`, tests
`src/gates/__tests__/causal-copy.test.ts` and `src/harness/__tests__/containment-probe.test.ts`;
Modify `gates/gates.json` (G0.1–G0.3, G0.6–G0.12: `"Implementation": { "Kind": "body" }` — the registry finds each body
by the title its `TruthGate.Define` declares, program D-043)

- [ ] Step 1: `src/gates/causal-copy.ts` + its test:

```ts
// causal-copy.ts — the S9.3 scan: causal or "lever" wording in user-facing strings and the story prompt.
import { readFileSync } from 'node:fs';

/** One user-facing string of a source file. */
export interface UserFacingLine { Line: number; Text: string }

/** The S9.3 causal-copy scan the G0.6 gate body runs. */
export class CausalCopyScan {
  // The eight phrases the assessment flagged (F-UI-1, F-UI-2, S9.3). Once Core carries the same list
  // (`CausalCopy.Patterns`) this list derives from it, so the gate and the product's own scan test use one list.
  // Associative wording ("an association, not a cause") is allowed on purpose.
  public static readonly Patterns: readonly RegExp[] = [
    /\blevers?\b/i, /\bwhat drives\b/i, /\bdrives? the outcome\b/i, /\bwhat(?:'|’)?s driving\b/i,
    /\bexplains about\b/i, /\bdecision drivers\b/i, /\binfluential\b/i, /\bhonest holdout evaluation\b/i,
  ];

  /** Linear character scanner extracting string literals from a single TS/JS source line, ignoring `//` comments. */
  private static extractStringLiterals(line: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '/' && line[i + 1] === '/') break;
      if (ch !== "'" && ch !== '"' && ch !== '`') continue;
      const quote = ch;
      let buf = '';
      for (i += 1; i < line.length; i++) {
        const c = line[i]!;
        if (c === '\\' && i + 1 < line.length) {
          buf += c + line[i + 1]!;
          i += 1;
          continue;
        }
        if (c === quote) {
          out.push(buf);
          break;
        }
        buf += c;
      }
    }
    return out;
  }

  /** String literals (TS/JS) or text (HTML/Markdown) of one file, with line numbers. */
  public static UserFacingText(file: string, source: string): UserFacingLine[] {
    const out: UserFacingLine[] = [];
    source.split('\n').forEach((raw, i) => {
      if (/\.(ts|js)$/.test(file)) {
        for (const text of CausalCopyScan.extractStringLiterals(raw)) {
          out.push({ Line: i + 1, Text: text });
        }
      } else {
        out.push({ Line: i + 1, Text: raw });
      }
    });
    return out;
  }

  /** `<file>:<line>: <text>` for every user-facing string that matches a pattern. */
  public static Scan(files: readonly string[]): string[] {
    const hits: string[] = [];
    for (const file of files) {
      for (const { Line, Text } of CausalCopyScan.UserFacingText(file, readFileSync(file, 'utf8'))) {
        if (CausalCopyScan.Patterns.some((re) => re.test(Text))) hits.push(`${file}:${Line}: ${Text.trim()}`);
      }
    }
    return hits;
  }
}
```

```ts
import { describe, it, expect } from 'vitest';
import { CausalCopyScan } from '../causal-copy';

describe('causal copy scan', () => {
  it('finds the shipped regression headline and ignores comments without quotes', () => {
    const src = "// this comment causes nothing\nreturn `Explains about ${pct}% of what drives the outcome.`;";
    const texts = CausalCopyScan.UserFacingText('trust.ts', src).map((t) => t.Text);
    expect(texts.some((t) => CausalCopyScan.Patterns.some((re) => re.test(t)))).toBe(true);
    expect(texts).not.toContain('this comment causes nothing');
  });
  it('accepts driver wording', () => {
    expect(CausalCopyScan.Patterns.some((re) => re.test('Top drivers of this prediction'))).toBe(false);
    expect(CausalCopyScan.Patterns.some((re) => re.test('Lowers Risk'))).toBe(false);
  });
});
```

`src/harness/w-world.ts` — the W-world pipeline inputs every Phase-0 body and fixture script shares (one list, so
the copies in `scripts/ui-fixture.mts` (C4.5) and `scripts/majority-rule-check.mts` (C5.8) cannot drift):

```ts
/** Features of the W-world membership-year tables the containment gates train on. */
export const W_WORLD_FEATURES: readonly string[] = ['Plan', 'EventsAttended', 'IncomeK', 'AutoRenew', 'Region', 'Year',
  'Noise1', 'Noise2', 'Noise3', 'Noise4', 'Noise5'];
/** Columns no containment-gate pipeline may use: keys, world stamps and the truth-suite write-back columns. */
export const W_WORLD_DENY_FIELDS: readonly string[] = ['ID', 'PersonID', 'WorldID', 'Seed', 'TruthScore', 'TruthClass'];
```

`src/harness/__tests__/containment-probe.test.ts` — the probe's predicates are the guards every gate body counts with:

```ts
import { describe, it, expect } from 'vitest';
import { TrustVerdicts } from '@memberjunction/predictive-studio-core';
import { ContainmentProbe } from '../containment-probe';
import type { CandidateModel, ScoreAttempt, TrainAttempt } from '../types';

const train = (over: Partial<TrainAttempt>): TrainAttempt =>
  ({ Ok: false, ErrorMessage: 'refused', ModelID: null, TrainingRunID: null, HoldoutMetricsJSON: null, DurationMs: 1, ...over });
const score = (over: Partial<ScoreAttempt>): ScoreAttempt =>
  ({ Ok: false, ErrorMessage: 'refused', Scored: 0, Failed: 0, Skipped: 0, WroteBack: false, Predictions: [], DurationMs: 1, ...over });
const model = (over: Partial<CandidateModel>): CandidateModel => ({
  ModelID: 'm1', PipelineID: 'p1', Algorithm: 'logistic_regression', Status: 'Draft', TrainingRowCount: 10, HoldoutRowCount: 2,
  Metrics: {}, HoldoutMetrics: {}, Trust: TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.5 }), ProblemType: 'classification' }),
  TrainingRunStatus: 'Completed', TrainingRunNotes: null, LineageJSON: null, ValidationResultsJSON: null, ...over,
});

describe('containment probe — predicates', () => {
  it('counts a training refusal only when the operation failed and produced no model', () => {
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({}))).toBe(true);
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ Ok: true, ErrorMessage: null, ModelID: 'm1' }))).toBe(false);
    expect(ContainmentProbe.WasRefusedBeforeTraining(train({ ModelID: 'm1' }))).toBe(false);   // failed after a model row existed
  });
  it('counts a scoring refusal only when it failed with a message and scored nothing', () => {
    expect(ContainmentProbe.WasScoringRefused(score({}))).toBe(true);
    expect(ContainmentProbe.WasScoringRefused(score({ ErrorMessage: null }))).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ Scored: 5 }))).toBe(false);
    expect(ContainmentProbe.WasScoringRefused(score({ Ok: true, ErrorMessage: null }))).toBe(false);
  });
  it('counts Published, and only Published, as reaching publication', () => {
    expect(ContainmentProbe.ReachedPublishedUnattended(model({ Status: 'Published' }))).toBe(true);
    expect(ContainmentProbe.ReachedPublishedUnattended(model({ Status: 'Validated' }))).toBe(false);
  });
  it('flags a verdict above Poor or one cleared to act', () => {
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({}))).toBe(false);   // AUC 0.5 → Poor, not actionable
    const good = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.8 }), ProblemType: 'classification' });
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({ Trust: good }))).toBe(true);
    expect(ContainmentProbe.GradedAbovePoorOrActionable(model({ Trust: { ...model({}).Trust, canAct: true } }))).toBe(true);
  });
});
```

  Add to the `ContainmentProbe` class (final here; no C milestone changes them):

```ts
  /** The story-generation prompt S9.3 scans: the Model Development Agent's templates (its "4. Report" step writes stories). */
  public static StoryPromptFiles(mjRoot: string): string[] {
    const dir = path.join(mjRoot, 'metadata/prompts/templates/model-development-agent');
    return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
  }

  /** One generated story about a model: the agent's report turn (the harness's `GenerateStory`, live model). */
  public static async GenerateModelStory(h: TruthHarness, modelId: string): Promise<string | null> {
    return h.GenerateStory(modelId);
  }
```

  (add `import path from 'node:path'; import { readdirSync } from 'node:fs';` and `TruthHarness` to its type import.)
  With these patterns the scan of `origin/next` @ `141d8d065c` hits five strings — `at-risk.view-models.ts:307`,
  `ps-predictions-grid.component.html:355`, `predictive-studio-agent-context.ts:122`,
  `ps-predictions-resource.component.ts:443` and `Core/src/trust.ts:152` — every one of which C4 rewrites (C4.2, C4.3,
  C4.4). The scan reads string literals line by line, so text inside a multi-line template literal (the resource's
  `What's driving this:` at `:126`) is caught by C4.4's whole-file scan test, not by this gate.
- [ ] Step 2: `gates/containment.gates.test.ts` (G0.1–G0.3, G0.6–G0.12; M5.10 appends G0.4 and G0.5):

```ts
import { describe } from 'vitest';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { NormalizeUUID } from '@memberjunction/global';
import { TruthGate } from '../src/gates/define-gate';
import { CausalCopyScan } from '../src/gates/causal-copy';
import { SeedRule } from '../src/stats/seed-rules';
import { ConfidenceInterval } from '../src/stats/wilson';
import { TruthSuite } from '../src/registry/load';
import { RunFixtures } from '../src/harness/run-fixtures';
import { AgentPlans } from '../src/harness/agent-plan';
import { HarnessDatasets } from '../src/harness/datasets';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from '../src/harness/w-world';
import { ContainmentProbe } from '../src/harness/containment-probe';
import type { AlgorithmKey, TruthHarness, LoadedDataset, PipelineSpec } from '../src/harness/types';

const MJ_ROOT = path.resolve(TruthSuite.Root(), '../../../..');
const W_FEATURES = [...W_WORLD_FEATURES];
const DENY = [...W_WORLD_DENY_FIELDS];
const ALGOS: AlgorithmKey[] = ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest'];
const CAP_NAMED = /\bcap\b|max ?rows|1,?000|UserViewMaxRows/i;
const WRITE_BACK = { OutputMapping: { fields: { TruthScore: '$.score' } } };

function spec(h: TruthHarness, tag: string, dataset: LoadedDataset, over: Partial<PipelineSpec> = {}): PipelineSpec {
  return {
    Name: `PSTruth: ${tag} ${h.RunID}`, Dataset: dataset, Target: 'Renewed', ProblemType: 'classification', Features: W_FEATURES,
    Algorithm: 'logistic_regression', AsOf: { Mode: 'none' }, Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
    DenyFields: DENY, ...over,
  };
}

function walk(dir: string, keep: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f, keep) : keep(f) ? [f] : [];
  });
}

describe('Containment gates', () => {
  TruthGate.Define('W1 → S7.5', async (h) => {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const p = await h.CreatePipeline(spec(h, 'G0.1 W1 s42', w1));
    const t = await h.Train(p);                                   // the UI default: no MaxRows
    const m = t.ModelID ? await h.ReadModel(t.ModelID) : null;
    // `??` on purpose for the row counts here and in `Measured`: 0 is a legitimate count, and `|| null` would report it as null.
    const trainRead = m ? (m.TrainingRowCount ?? 0) + (m.HoldoutRowCount ?? 0) : null;
    const trainOk = m ? trainRead === w1.RowCount : CAP_NAMED.test(t.ErrorMessage || '');
    const scoring = await RunFixtures.W1S42ValidatedModel(h);                 // full-row, Validated: scoring is tested even if training refused
    const s = await h.Score(scoring.ModelID, { scope: { filter: { entityName: w1.Entity.Name } } });
    const scoreOk = s.Ok ? s.Scored === w1.RowCount : CAP_NAMED.test(s.ErrorMessage || '');
    return {
      Passed: trainOk && scoreOk,
      Measured: { labelledRows: w1.RowCount, trainingRows: m?.TrainingRowCount ?? null, holdoutRows: m?.HoldoutRowCount ?? null,
        trainError: t.ErrorMessage, filterScored: s.Scored, scoreError: s.ErrorMessage },
      Detail: `training read ${trainRead === null ? 'refused' : trainRead} of ${w1.RowCount}; filter scoring scored ${s.Scored}${s.ErrorMessage ? ` (${s.ErrorMessage})` : ''}`,
    };
  });

  // G0.2 and G0.3 are owned by the gated-publish change (registry OwnerPR), written here with the agent-run harness and
  // expected-fail until that change flips them. Both run with automated publishing on (the builder's autoPublish
  // default) and count a run as published when any of its models reaches Published, whoever promoted it. G0.3 passes
  // at 0 of 2. G0.2 has two halves: (a) runs reaching Published ≤ 6 of 60 (statRule noise-publish-60) and (b) every run
  // that reaches Published has a stored gate outcome 'model' that publish reverification re-derives, 60 of 60 runs
  // consistent (a run that publishes nothing is consistent). Half (b) needs a stored outcome and the reverification
  // (ContainmentProbe.ReadStoredGateDecision / ReverifiesStoredDecision read them once they exist); until then any
  // published run is inconsistent and the gate stays xfail — expected for this expected-fail gate.
  TruthGate.Define('W2 → C1.1', async (h) => {
    const publishedSeeds: number[] = [];
    const inconsistentSeeds: number[] = [];
    for (let seed = 100; seed <= 159; seed++) {
      const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: seed });
      const name = `PSTruth: G0.2 W2 s${seed} ${h.RunID}`;
      await h.RunBuilderAgent(AgentPlans.Build({ Name: name, Entity: w2.Entity, Target: 'Renewed', Features: W_FEATURES, Algorithms: ALGOS, DenyFields: DENY }));
      const models = await h.ModelsForPipelineNamePrefix(name);
      const published = models.filter((m) => ContainmentProbe.ReachedPublishedUnattended(m));
      if (published.length > 0) publishedSeeds.push(seed);
      if (published.some((m) => ContainmentProbe.ReadStoredGateDecision(m) !== 'model' || !ContainmentProbe.ReverifiesStoredDecision(m))) inconsistentSeeds.push(seed);
    }
    const countOk = SeedRule.Passes('noise-publish-60', publishedSeeds.length, 60);
    const consistent = 60 - inconsistentSeeds.length;
    return { Passed: countOk && consistent === 60,
      Measured: { runs: 60, published: publishedSeeds.length, maxPublished: SeedRule.AcceptanceRange('noise-publish-60', 60).Max,
        consistent, seeds: publishedSeeds.join(','), inconsistentSeeds: inconsistentSeeds.join(',') },
      Detail: `${publishedSeeds.length} of 60 agent runs reached Published with automated publishing on (≤ 6 accepted); ${consistent} of 60 runs consistent (stored outcome 'model', re-derived at publish)` };
  });

  TruthGate.Define('W3 → C1.1', async (h) => {
    const w3 = await h.EnsureLoaded({ Kind: 'world', ID: 'W3-leak-row', Seed: 42 });
    const features = [...W_FEATURES, 'Status'];
    const published: string[] = [];
    for (const [order, algorithms] of [['lr-first', ALGOS], ['lr-last', [...ALGOS].reverse()]] as const) {
      const name = `PSTruth: G0.3 W3 s42 ${order} ${h.RunID}`;
      await h.RunBuilderAgent(AgentPlans.Build({ Name: name, Entity: w3.Entity, Target: 'Renewed', Features: features, Algorithms: [...algorithms], DenyFields: DENY }));
      if ((await h.ModelsForPipelineNamePrefix(name)).some((m) => ContainmentProbe.ReachedPublishedUnattended(m))) published.push(order);
    }
    return { Passed: published.length === 0, Measured: { runs: 2, published: published.length, orders: published.join(',') },
      Detail: `${published.length} of 2 agent runs on W3 s42 reached Published with automated publishing on` };
  });

  TruthGate.Define('W1 → S9.3', async (h) => {
    const files = [
      ...walk(path.join(MJ_ROOT, 'packages/Angular/Explorer/dashboards/src/PredictiveStudio'), (f) => /\.(ts|html)$/.test(f) && !/\.test\.ts$/.test(f)),
      ...walk(path.join(MJ_ROOT, 'packages/AI/PredictiveStudio/Core/src'), (f) => f.endsWith('.ts') && !f.includes('__tests__')),
      ...ContainmentProbe.StoryPromptFiles(MJ_ROOT),
    ];
    const hits = CausalCopyScan.Scan(files);
    const model = await RunFixtures.W1S42ValidatedModel(h);
    const stories: string[] = [];
    for (let i = 0; i < 10; i++) {
      const story = await ContainmentProbe.GenerateModelStory(h, model.ModelID);
      if (story !== null) stories.push(story);
    }
    const causalStories = stories.filter((s) => CausalCopyScan.Patterns.some((re) => re.test(s))).length;
    return {
      Passed: hits.length === 0 && stories.length === 10 && causalStories === 0,
      Measured: { filesScanned: files.length, causalHits: hits.length, firstHit: hits[0] || null, storiesGenerated: stories.length, causalStories },
      Detail: `${hits.length} causal phrases in UI strings/story prompt; ${causalStories} of ${stories.length} stories causal`,
    };
  });

  TruthGate.Define('W1 → S7.3', async (h) => {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const scope = { filter: { entityName: w1.Entity.Name, extraFilter: "Region = 'NA' AND [Year] = 2024", maxRows: 5000 } };
    const draft = await RunFixtures.W1S42Model(h);                                            // Draft
    const archivedId = await RunFixtures.TrainedModel(h, 'G0.7 archived', w1);
    await h.Promote(archivedId, 'Validated', 'truth suite fixture: promote');
    const archived = await h.Promote(archivedId, 'Archived', 'truth suite fixture: archive');
    if (archived.Status !== 'Archived') throw new Error(`could not archive the G0.7 fixture model (status ${archived.Status})`);
    const validatedId = (await RunFixtures.W1S42ValidatedModel(h)).ModelID;

    const attempt = async (modelId: string, dryRun: boolean) => {
      await h.ResetColumn(w1, 'TruthScore');
      const a = await h.Score(modelId, { scope, writeBack: WRITE_BACK, dryRun });
      return { a, written: await h.CountNonNull(w1, 'TruthScore') };
    };
    const d = await attempt(draft.ModelID, false);
    const ar = await attempt(archivedId, false);
    const dry = await attempt(validatedId, true);
    const refused = [d, ar].filter((x) => x.written === 0 && ContainmentProbe.WasScoringRefused(x.a)).length;
    return {
      Passed: refused === 2 && dry.written === 0,
      Measured: { draftWritten: d.written, draftError: d.a.ErrorMessage, archivedWritten: ar.written, archivedError: ar.a.ErrorMessage, dryRunWritten: dry.written },
      Detail: `Draft/Archived refused with 0 rows written: ${refused} of 2; dry run wrote ${dry.written} rows`,
    };
  });

  TruthGate.Define('W4 → S2.1', async (h) => {
    const w4 = await h.EnsureLoaded({ Kind: 'world', ID: 'W4-pit', Seed: 42 });
    const features = [...W_FEATURES, 'PersonStatusNow'];
    const pipelineColumn = await h.CreatePipeline(spec(h, 'G0.8 W4 column-mode', w4, { Features: features, AsOf: { Mode: 'column', Column: 'StartDate' } }));
    const a = await h.Train(pipelineColumn);
    const pipelinePlain = await h.CreatePipeline(spec(h, 'G0.8 W4 asOf-input', w4, { Features: features }));
    const b = await h.Train(pipelinePlain, { AsOf: { Mode: 'column', Column: 'StartDate' } });
    const refused = [a, b].filter((a) => ContainmentProbe.WasRefusedBeforeTraining(a)).length;
    return { Passed: refused === 2, Measured: { refused, columnModeError: a.ErrorMessage, asOfInputError: b.ErrorMessage, columnModeModel: a.ModelID, asOfInputModel: b.ModelID },
      Detail: `${refused} of 2 no-effect as-of variants refused before training` };
  });

  TruthGate.Define('W2 → S5.3', async (h) => {
    const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: 100 });
    const { Positives: positives, Negatives: negatives } = HarnessDatasets.LabelCounts(w2, 'Renewed');
    const out: Record<string, number | string | boolean | null> = {};
    let ok = 0;
    for (const [label, validation] of [['kfold', { Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0 }], ['holdout', { Strategy: 'holdout', LockedHoldoutFraction: 0 }]] as const) {
      const p = await h.CreatePipeline(spec(h, `G0.9 W2 s100 ${label}`, w2, { Algorithm: 'random_forest', Validation: validation }));
      const t = await h.Train(p);
      if (ContainmentProbe.WasRefusedBeforeTraining(t)) { ok += 1; out[`${label}Refused`] = true; continue; }
      const m = t.ModelID ? await h.ReadModel(t.ModelID) : null;
      const auc = m?.Metrics['auc'] ?? m?.Metrics['roc_auc'] ?? null;   // `??` on purpose: an AUC of 0 is a legitimate value
      if (auc === null) throw new Error(`${label}: trained but reported no validation AUC`);
      const ci = ConfidenceInterval.HanleyMcNeil(auc, positives, negatives);
      out[`${label}Auc`] = auc; out[`${label}Lower`] = ci.Lower; out[`${label}Upper`] = ci.Upper;
      if (ci.Lower <= 0.5 && 0.5 <= ci.Upper) ok += 1;
    }
    return { Passed: ok === 2, Measured: out, Detail: `${ok} of 2 strategies honest on noise (interval contains 0.5) or refused` };
  });

  TruthGate.Define('W1 → S5.4', async (h) => {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const records = HarnessDatasets.FirstRowIDs(w1, 500);
    const out: Record<string, number | string | boolean | null> = { threads: process.env.OMP_NUM_THREADS || null };
    let equal = 0;
    for (const algorithm of ['logistic_regression', 'xgboost', 'lightgbm'] as const) {
      const p = await h.CreatePipeline(spec(h, `G0.10 W1 ${algorithm}`, w1, { Algorithm: algorithm }));
      const scores: number[][] = [];
      for (let k = 0; k < 2; k++) {
        const t = await h.Train(p, { MaxRows: 1_000_000 });
        if (!t.ModelID) throw new Error(`${algorithm} training ${k + 1} failed: ${t.ErrorMessage}`);
        // Score a Validated model: Draft models are refused for scoring. The promote is the product's promote operation.
        const promoted = await h.Promote(t.ModelID, 'Validated', 'truth suite fixture: promote (G0.10)');
        if (!promoted.Promoted) throw new Error(`${algorithm}: could not promote model ${t.ModelID} to Validated (${promoted.Status})`);
        const s = await h.Score(t.ModelID, { scope: { records } });
        if (!s.Ok || s.Predictions.length !== records.length) throw new Error(`${algorithm}: scored ${s.Predictions.length} of ${records.length}`);
        // One map per scoring (O(n) instead of a scan per record); NormalizeUUID because SQL Server and the sidecar may
        // spell the same id in different case (coding standards §6).
        const byId = new Map(s.Predictions.map((x) => [NormalizeUUID(x.RecordID), x.Score] as const));
        scores.push(records.map((id) => byId.get(NormalizeUUID(id)) ?? Number.NaN));   // `??`: a score of 0 is legitimate
      }
      const maxDiff = Math.max(...scores[0]!.map((v, i) => Math.abs(v - scores[1]![i]!)));
      out[`${algorithm}MaxDiff`] = maxDiff;
      if (maxDiff <= 1e-9) equal += 1;
    }
    return { Passed: equal === 3, Measured: out, Detail: `${equal} of 3 algorithms reproduce predictions within 1e-9` };
  });

  TruthGate.Define('T4 → S6.5', async (h) => {
    let abovePoor = 0; let stored = 0; let declared = 0;
    const reasons: string[] = [];
    for (let origin = 1; origin <= 12; origin++) {
      const t4 = await h.EnsureLoaded({ Kind: 'series-origin', ID: 'T4', Seed: 2209, Origin: origin });
      const p = await h.CreatePipeline({
        Name: `PSTruth: G0.11 T4 origin ${origin} ${h.RunID}`, Dataset: t4, Target: 'Target', ProblemType: 'regression',
        Features: ['MonthIndex', 'Month'], Algorithm: 'lightgbm', AsOf: { Mode: 'none' },
        Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 }, DenyFields: ['ID', 'EntityKey', 'T', 'TruthScore'],
        TimeIndexColumn: 'MonthIndex',
      });
      if (p.ID && h.LastTimeIndexDeclared()) declared += 1;
      const t = await h.Train(p);
      if (!t.ModelID) continue;   // refused: stores no withheld verdict, so it counts against the 12 of 12
      const m = await h.ReadModel(t.ModelID);
      if (ContainmentProbe.GradedAbovePoorOrActionable(m)) abovePoor += 1;
      const v = ContainmentProbe.ReadStoredWithheldVerdict(m);
      if (v && !v.CanAct && /not evaluated as a forecast/i.test(v.Reason)) { stored += 1; reasons.push(v.Reason); }
    }
    return { Passed: abovePoor === 0 && stored === 12, Measured: { origins: 12, timeIndexDeclared: declared, gradedAbovePoorOrActionable: abovePoor, withheldVerdictsStored: stored },
      Detail: `${abovePoor} of 12 origins above Poor or actionable; ${stored} of 12 store the withheld verdict` };
  });

  TruthGate.Define('W7 → S4.2', async (h) => {
    let qualifying = 0; let violations = 0;
    const out: Record<string, number | string | boolean | null> = {};
    for (const seed of [42, 43, 44]) {
      const w7 = await h.EnsureLoaded({ Kind: 'world', ID: 'W7-small-imbalanced', Seed: seed });
      const name = `PSTruth: G0.12 W7 s${seed} ${h.RunID}`;
      const r = await h.RunBuilderAgent(AgentPlans.Build({ Name: name, Entity: w7.Entity, Target: 'Renewed', Features: W_FEATURES, Algorithms: ALGOS, DenyFields: DENY }));
      if (!r.BuildModelID) { out[`s${seed}`] = `no winner: ${r.BuildErrorMessage || r.AgentErrorMessage || 'unknown'}`; continue; }
      const m = await h.ReadModel(r.BuildModelID);
      const holdout = await h.Judge<{ n: number; positives: number }>('holdout_rebuild',
        ['--rows', path.join(w7.Dir, 'rows.csv'), '--model', await h.WriteArtifact(`g012-s${seed}-model`, m), '--label', 'Renewed']);
      const majority = Math.max(holdout.positives, holdout.n - holdout.positives) / holdout.n;
      const accuracy = m.HoldoutMetrics['accuracy'] ?? null;   // `??` on purpose: an accuracy of 0 is a legitimate value
      out[`s${seed}Accuracy`] = accuracy; out[`s${seed}Majority`] = majority; out[`s${seed}Grade`] = m.Trust.grade; out[`s${seed}CanAct`] = m.Trust.canAct;
      if (accuracy !== null && accuracy <= majority) {
        qualifying += 1;
        if (ContainmentProbe.GradedAbovePoorOrActionable(m)) violations += 1;
      }
    }
    out['qualifying'] = qualifying; out['violations'] = violations;
    return { Passed: violations === 0, Measured: out, Detail: `${violations} of ${qualifying} at-or-below-majority models graded above Poor or actionable` };
  });
});
```

  Supporting harness additions this file uses (implement them in M5.6's modules): `HarnessDatasets.LabelCounts(dataset, column): { Positives: number; Negatives: number }` and
  `HarnessDatasets.FirstRowIDs(dataset, n): string[]` read the dataset's cached `rows.csv` (not the truth file); `RunFixtures.TrainedModel(h, tag, dataset)`
  creates a logistic-regression pipeline on the dataset and trains it with `MaxRows: 1_000_000`, returning the model id;
  `h.LastTimeIndexDeclared()` returns what `ContainmentProbe.ApplyTimeIndexDeclaration` answered for the last `CreatePipeline` (add it to
  `TruthHarness`). `scripts/ui-fixture.mts` (C4.5) and `scripts/majority-rule-check.mts` (C5.8) import
  `W_WORLD_FEATURES`/`W_WORLD_DENY_FIELDS` from `src/harness/w-world.ts` instead of copying the lists.
- [ ] Step 3: Set the ten bodies' `Implementation` to `{ "Kind": "body" }` in `gates.json` (G0.1–G0.3, G0.6–G0.12; G0.2/G0.3 keep
  `OwnerPR: 4` and `expected-fail`); `pnpm run truth:registry` → `registry OK`. Unit tests:
  `pnpm --filter @memberjunction/predictive-studio-truth-suite exec vitest run src/gates/__tests__/causal-copy.test.ts src/harness/__tests__/containment-probe.test.ts`
  → `6 passed` (2 causal-copy, 4 containment-probe).
- [ ] Step 3b: Mutation checks (§6 shared notes): in `containment-probe.ts`, `ContainmentProbe.WasRefusedBeforeTraining`'s
  `a.ModelID === null` deleted → `counts a training refusal only when …` red; each conjunct of `ContainmentProbe.WasScoringRefused`
  deleted in turn → `counts a scoring refusal only when …` red; `ContainmentProbe.ReachedPublishedUnattended` → `Status !== 'Draft'` →
  `counts Published, and only Published …` red; either half of `ContainmentProbe.GradedAbovePoorOrActionable` deleted → `flags a
  verdict above Poor …` red; `CausalCopyScan.UserFacingText`'s string-literal branch made to return the raw line →
  `finds the shipped regression headline and ignores comments …` red. Gate-body thresholds (`Passed:` expressions)
  are exposed by Step 4's runs against the M6.3 baseline (each `xfail` of Step 4 must turn `xpass` when its threshold
  is replaced by `true`) — run that once per body on a scratch copy and record the ten outcomes.
- [ ] Step 4: Run each gate once (`pnpm run truth:run -- --mode nightly --gate "<name>"`) and record its outcome and
  measured values in §11. Expected on `next` before C1–C6 (the "today" column of §4.1): G0.1 `xfail` (training
  `13421 + 3355 = 16776` — #5295 — but filter scoring `1000`), G0.2 `xfail` or `xpass` (PR 4's; `xpass` only when no
  run publishes, because no stored outcome exists before PR 3/PR 4; the review saw 0 of 20 published; record
  `published` and `consistent` of 60), G0.3 `xfail` (PR 4's; 1 of 2, lr-first), G0.6 `not-run` in `nightly` (weekly + live model), G0.7
  `xfail` (Draft and Archived write rows; dry run writes rows), G0.8 `xfail` (both train), G0.9 `xfail` (AUC 1.000,
  interval excludes 0.5), G0.10 `xpass` (determinism holds today), G0.11 `xfail` (Excellent/Good, `canAct` true,
  `timeIndexDeclared: 0`), G0.12 `xfail` (s42 0.905 ≤ 0.921, Fair or better). Any `error` is a harness defect: fix it.

#### Task M5.10: Move pure At-Risk functions to `@memberjunction/predictive-studio-core` and define G0.4/G0.5 in TruthSuite (§9 D2-44)

**Files:** Create `packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts`; Modify
`packages/AI/PredictiveStudio/Core/src/index.ts`,
`packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts`,
`packages/Angular/Explorer/dashboards/src/PredictiveStudio/__tests__/at-risk.view-models.test.ts` (and dashboard callers),
`packages/AI/PredictiveStudio/TruthSuite/src/harness/containment-probe.ts`,
`packages/AI/PredictiveStudio/TruthSuite/gates/containment.gates.test.ts`,
`packages/AI/PredictiveStudio/TruthSuite/gates/gates.json` (G0.4, G0.5 → `Kind: "body"`)

- [ ] Step 1: Move the pure At-Risk functions and types out of `packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts` into `packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts` as static methods on `export class AtRiskRules` (with `AtRiskRules.ParseAtRiskRows`, `AtRiskRules.IsTargetPositiveOutcome`, `AtRiskRules.RiskScoreFromPayload`, `AtRiskRules.ExtractRecordLabel`, `AtRiskRules.ExtractRowDrivers`, `AtRiskRules.ComputeRunSummary`, `AtRiskRules.ToCsv`, `AtRiskRules.RiskBandFor`, `AtRiskRules.RiskTierAction`), and export `AtRiskRules` and its types (`AtRiskRow`, `AtRiskRunSummary`, `RowDriver`, `RunDetailLike`, `RiskBand`, `ParseAtRiskOptions`) from `packages/AI/PredictiveStudio/Core/src/index.ts`. In `packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts`, delete the deprecated camelCase aliases (`D-053` / `D2-46`) and import `AtRiskRules` and its types directly from `@memberjunction/predictive-studio-core` across the dashboard files (`ps-predictions-resource.component.ts`, `ps-predictions-grid.component.ts`, `ps-row-drivers.component.ts`, `at-risk.view-models.test.ts`; per `AGENTS.md` Rule 5, `at-risk.view-models.ts` does not re-export symbols from `@memberjunction/predictive-studio-core` — if `at-risk.view-models.ts` has no remaining dashboard-only code, delete `at-risk.view-models.ts` and import from `@memberjunction/predictive-studio-core` directly).
- [ ] Step 2: Add `TopDriverBadges` and `AtRiskListRecordIDs` to `ContainmentProbe` (`packages/AI/PredictiveStudio/TruthSuite/src/harness/containment-probe.ts`), importing `AtRiskRules` and `RunDetailLike` from `@memberjunction/predictive-studio-core`:

```ts
  /** The badge text of a driver before C4.2 removes the direction flip (replicates `ps-predictions-grid.component.html:368`). */
  public static BadgeText(up: boolean): string {
    return up ? 'Increases Risk' : 'Lowers Risk';
  }

  /** The badge each row shows for its top per-record driver, for rows whose top driver has `label`. */
  public static TopDriverBadges(details: RunDetailLike[], label: string): string[] {
    const badges: string[] = [];
    for (const row of AtRiskRules.ParseAtRiskRows(details)) {
      const top = row.drivers?.[0];
      if (top && top.label === label) badges.push(ContainmentProbe.BadgeText(top.up));
    }
    return badges;
  }

  /** The record ids "Send to a list" puts on the At-Risk list. */
  public static AtRiskListRecordIDs(details: RunDetailLike[]): string[] {
    return AtRiskRules.ParseAtRiskRows(details).filter((r) => r.band !== 'low').slice(0, 200).map((r) => r.recordId);
  }
```

- [ ] Step 3: Append G0.4 (`W1 → S9.4`) and G0.5 (`W1 → S9.5`) directly to `gates/containment.gates.test.ts` (sharing one memoised W1 s42 record-process scoring run in the process):

```ts
  let w1RecordProcessPromise: Promise<{ Details: Array<{ recordId: string; ResultPayload: string | null }>; TruthCsv: string }> | null = null;
  function w1RecordProcess(h: TruthHarness): Promise<{ Details: Array<{ recordId: string; ResultPayload: string | null }>; TruthCsv: string }> {
    w1RecordProcessPromise ||= (async () => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const model = await RunFixtures.W1S42ValidatedModel(h);
      const run = await h.ScoreViaRecordProcess(model.ModelID, w1, "Region = 'NA' AND [Year] = 2024");
      if (run.Status !== 'Completed') throw new Error(`record-process scoring ended ${run.Status}`);
      return {
        TruthCsv: path.join(w1.Dir, 'truth.csv'),
        Details: run.Details.map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload })),
      };
    })();
    return w1RecordProcessPromise;
  }

  /** TrueP by normalised MembershipYearID; throws when the truth file lacks either column (never keys rows by "undefined"). */
  function readTrueP(truthCsv: string): Map<string, number> {
    const [header, ...rows] = readFileSync(truthCsv, 'utf8').split('\n');
    const cols = (header || '').split(',');
    const id = cols.indexOf('MembershipYearID'); const p = cols.indexOf('TrueP');
    if (id < 0 || p < 0) throw new Error(`${truthCsv} has no MembershipYearID/TrueP columns`);
    const out = new Map<string, number>();
    for (const r of rows) {
      const c = r.split(',');
      const recordId = c[id];
      if (recordId) out.set(NormalizeUUID(recordId), Number(c[p]));
    }
    return out;
  }

  TruthGate.Define('W1 → S9.4', async (h) => {
    const { Details: details } = await w1RecordProcess(h);
    const badges = ContainmentProbe.TopDriverBadges(details, 'Auto Renew');
    const lowers = badges.filter((b) => b === 'Lowers Risk').length;
    return {
      Passed: badges.length > 0 && lowers === badges.length,
      Measured: { autoRenewTopDriverRows: badges.length, lowersRisk: lowers },
      Detail: `${lowers} of ${badges.length} AutoRenew top-driver rows render "Lowers Risk"`,
    };
  });

  TruthGate.Define('W1 → S9.5', async (h) => {
    const { Details: details, TruthCsv: truthCsv } = await w1RecordProcess(h);
    const truth = readTrueP(truthCsv);
    const all = details.map((d) => truth.get(NormalizeUUID(d.recordId))).filter((v): v is number => v !== undefined);
    const list = ContainmentProbe.AtRiskListRecordIDs(details).map((id) => truth.get(NormalizeUUID(id))).filter((v): v is number => v !== undefined);
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    return {
      Passed: list.length > 0 && mean(list) < mean(all),
      Measured: { listSize: list.length, listMeanTrueP: mean(list), populationMeanTrueP: mean(all) },
      Detail: `At-Risk list mean TrueP ${mean(list).toFixed(4)} vs population ${mean(all).toFixed(4)}`,
    };
  });
```

  (add `readFileSync` to the `node:fs` import at the top of `gates/containment.gates.test.ts`.)
- [ ] Step 4: Set G0.4 and G0.5 `Implementation` to `{ "Kind": "body" }` in `gates.json`; `pnpm run truth:registry` → `registry OK`.
- [ ] Step 5: Runtime: after a `pr` run, `cat results/<run>/gates/G0.4.json` → `Outcome: "xfail"`, `Measured.autoRenewTopDriverRows` ≈ 488,
  `lowersRisk: 0` (the review: 0 of 488); `G0.5.json` → `xfail`, `listMeanTrueP` ≈ 0.967 > `populationMeanTrueP`.
- [ ] Step 6: Mutation checks (§6 shared notes): `readTrueP`'s column guard deleted and `TruthCsv` pointed at `rows.csv` → `W1 → S9.5` keys
  every row by an absent column and reports `listSize` 0 instead of throwing (record it); `NormalizeUUID` dropped on
  either side of the S9.5 lookup → `listSize` 0 on SQL Server's upper-case ids (record the run).

**Exit tests (M5):** TruthSuite `pnpm test` (all unit files), `pnpm run test:python` → all passed (count as recorded in M5.5), `-m slow` → `20 passed`,
`mypy --strict -p truthsuite` → Success, `pnpm run build` → exit 0; Core and dashboards `pnpm test` and `pnpm build` → exit 0;
a full local `pnpm run truth:run -- --mode pr` → report line with `error 0`, Phase-0 outcomes as in M5.9 Step 4 and M5.10 Step 5.

**Checkpoint commit:** `feat(ps): PR 2 M5 — judges, reference pipeline (20/20 reproduced), harness and Phase-0 gate bodies`

### M6 — CI wiring and the first full run  ·  parallel-safe: no  ·  depends on: M5

**Outcome:** `.github/workflows/ps-truth-suite.yml` runs the suite in three lanes on throwaway SQL Server databases;
results are uploaded and summarised; the measured runtimes replace the estimates in §5.3; the Phase-0 baseline (what
fails today) is committed.

#### Task M6.1: The workflow

**Files:** Create `.github/workflows/ps-truth-suite.yml`

- [ ] Step 1: Write it (provisioning steps mirror `integration.yml`; keep them in sync when that file changes):

```yaml
name: Predictive Studio Truth Suite

# Planted-truth gates for Predictive Studio (packages/AI/PredictiveStudio/TruthSuite). Three lanes:
#   pr      — PRs touching PS or the suite: Phase-0 "pr" gates + every stub (≈ 10 min of gates)
#   nightly — 06:30 UTC on next: + "nightly" gates (G0.2's 60 agent runs; PR 1's four bridged gates, which need
#             bizapps-common, so this lane installs it at BIZAPPS_COMMON_REF and sets TRUTH_BIZAPPS_COMMON=1)
#   weekly  — Sunday 07:00 UTC + dispatch: + 400-seed gates, W8, live-model gates (G0.6; keys from
#             INTEGRATION_LIVE_MODEL_KEYS, else GEMINI_API_KEY); installs bizapps-common like nightly
# A gate fails the job only when it is "required" and misses its threshold, or when the harness errors.
# BIZAPPS_COMMON_REF pins MemberJunction/bizapps-common (public; no secret needed). A bump is kept only when a nightly
# dispatch on the bumping branch runs the bizapps-common step green at the new sha (PR 2 plan §9 D2-38).
# PR 1's companion (MemberJunction/bizapps-common#354, head 76809d340e450905f1c80730a62ad3485aabeca0) replaces the pre-companion pin in M-final.5.
on:
  pull_request:
    branches: [next]
    paths:
      - 'packages/AI/PredictiveStudio/**'
      - 'packages/AI/Knowledge/FeaturePipelines/**'
      - 'packages/AI/Knowledge/FeaturePipelinesEngine/**'
      - 'packages/RecordSetProcessor/**'
      - 'packages/Angular/Explorer/dashboards/src/PredictiveStudio/**'
      - 'metadata/agents/**'
      - 'metadata/actions/predictive-studio/**'
      - 'metadata/remote-operations/**'
      - '.github/workflows/ps-truth-suite.yml'
  schedule:
    - cron: '30 6 * * *'
    - cron: '0 7 * * 0'
  workflow_dispatch:
    inputs:
      mode:
        description: 'pr | nightly | weekly'
        type: choice
        options: [pr, nightly, weekly]
        default: nightly

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}${{ github.event_name == 'schedule' && format('-{0}', github.event.schedule) || '' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  truth:
    name: Truth suite (${{ github.event_name == 'pull_request' && 'pr' || github.event_name == 'workflow_dispatch' && inputs.mode || github.event.schedule == '0 7 * * 0' && 'weekly' || 'nightly' }})
    runs-on: ubuntu-latest
    timeout-minutes: 120
    env:
      TRUTH_MODE: ${{ github.event_name == 'pull_request' && 'pr' || github.event_name == 'workflow_dispatch' && inputs.mode || github.event.schedule == '0 7 * * 0' && 'weekly' || 'nightly' }}
      DB_HOST: localhost
      DB_PORT: '1433'
      DB_DATABASE: test
      DB_USERNAME: sa
      DB_PASSWORD: VeryStr0ngP@ssw0rd
      CODEGEN_DB_USERNAME: sa
      CODEGEN_DB_PASSWORD: VeryStr0ngP@ssw0rd
      DB_TRUST_SERVER_CERTIFICATE: 'true'
      GRAPHQL_PORT: '4000'
      MJ_API_KEY: mj-truth-ci-${{ github.run_id }}
      MJ_DISABLE_TASK_GRAPH_DISPATCHER: '1'
      RUN_AGENT_TESTS: '0'
      # bizapps-common for PR 1's bridged gates (nightly/weekly only). Pre-companion pin: bizapps-common `main` @ v5.52.0
      # (2026-10-11; contains the F-ENV-5 tags fix 8bba036a24; mj-app.json mjVersionRange ">=6.1.5 <7.0.0").
      BIZAPPS_COMMON_REPO: https://github.com/MemberJunction/bizapps-common.git
      BIZAPPS_COMMON_REF: 172b99a5fef78352dbfa54784eaa34149423f802
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - name: SQL Server
        run: |
          docker network create -d bridge local-net
          docker run --rm -d --network local-net --name sql -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=$DB_PASSWORD" -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
          for i in $(seq 1 30); do
            docker run --rm --network local-net mcr.microsoft.com/mssql-tools /opt/mssql-tools/bin/sqlcmd -S sql -U SA -P "$DB_PASSWORD" -Q "SELECT 1" >/dev/null 2>&1 && break
            sleep 2
          done
          docker run --rm --network local-net mcr.microsoft.com/mssql-tools /opt/mssql-tools/bin/sqlcmd -S sql -U SA -P "$DB_PASSWORD" -Q "CREATE DATABASE [test];"
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: 'pnpm' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: sudo apt-get update && sudo apt-get install -y libgomp1
      - run: pnpm install --frozen-lockfile
      - name: Build
        # integration-test-suite: its dist/ is mj.config.cjs testing.checkModules, which PR 1's `mj test` rows need (M-final.5)
        run: npx turbo build --filter=@memberjunction/cli --filter=mj_api --filter=@memberjunction/predictive-studio-truth-suite... --filter=@memberjunction/ng-dashboards --filter=@memberjunction/integration-test-suite
      - name: Provision (core migrations + metadata + pstruth)
        env: { MJ_MIGRATION_REQUEST_TIMEOUT: '120000' }
        run: |
          node packages/MJCLI/bin/run.js migrate
          node packages/MJCLI/bin/run.js sync push --dir=metadata --ci
          node packages/MJCLI/bin/run.js sync push --dir=metadata-optional/integration-test --ci
          node packages/AI/PredictiveStudio/TruthSuite/scripts/provision.mjs
      # PR 1 plan §2.4 "database-only install", after the core push and before
      # MJAPI boots (so MJAPI's metadata includes the __mj_BizAppsCommon entities).
      - name: bizapps-common (nightly / weekly)
        if: env.TRUTH_MODE != 'pr'
        env: { MJ_MIGRATION_REQUEST_TIMEOUT: '120000' }
        run: |
          set -euo pipefail
          BIZ="$RUNNER_TEMP/bizapps-common"
          git init -q "$BIZ"
          git -C "$BIZ" fetch -q --depth 1 "$BIZAPPS_COMMON_REPO" "$BIZAPPS_COMMON_REF"
          git -C "$BIZ" checkout -q FETCH_HEAD
          test "$(git -C "$BIZ" rev-parse HEAD)" = "$BIZAPPS_COMMON_REF"
          start=$(date +%s)
          node packages/MJCLI/bin/run.js migrate --verbose --schema __mj_BizAppsCommon --dir "$BIZ/migrations"
          node packages/MJCLI/bin/run.js sync push --dir "$BIZ/metadata" --ci
          q() { docker run --rm --network local-net mcr.microsoft.com/mssql-tools /opt/mssql-tools/bin/sqlcmd -S sql -U SA -P "$DB_PASSWORD" -d test -h -1 -W -Q "SET NOCOUNT ON; $1"; }
          test "$(q "SELECT COUNT(*) FROM __mj_BizAppsCommon.SeniorityLevel")" = "8"
          test "$(q "SELECT COUNT(*) FROM __mj.AIPromptModel WHERE PromptID='7C46041F-0412-4C2E-9B9E-3ED61D32210C'")" -ge 1
          test "$(q "SELECT COUNT(*) FROM __mj.RecordProcess WHERE ID='7E030001-A101-4B01-8C01-000000000001'")" = "1"
          echo "JobFunction rows: $(q "SELECT COUNT(*) FROM __mj_BizAppsCommon.JobFunction")"   # 12 at the pre-companion pin; 13 after PR 1's M6.4
          echo "bizapps-common $BIZAPPS_COMMON_REF installed in $(( $(date +%s) - start )) s" | tee -a "$GITHUB_STEP_SUMMARY"
          echo "TRUTH_BIZAPPS_COMMON=1" >> "$GITHUB_ENV"
      - name: Registry check against next
        run: |
          git fetch --no-tags --depth=1 origin next
          pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:registry -- --against origin/next
      - name: Python (sidecar + truth suite)
        run: |
          pnpm --filter @memberjunction/predictive-studio-sidecar run setup:python
          pnpm --filter @memberjunction/predictive-studio-truth-suite run setup:python
      - name: Loom + data caches
        uses: actions/cache@v4
        with:
          path: |
            packages/AI/PredictiveStudio/TruthSuite/.loom
            packages/AI/PredictiveStudio/TruthSuite/.data
          key: truth-${{ hashFiles('packages/AI/PredictiveStudio/TruthSuite/fixtures/**', 'packages/AI/PredictiveStudio/TruthSuite/generators/**') }}
      - run: pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:loom
      - name: Truth sidecar (single-threaded)
        working-directory: packages/AI/PredictiveStudio/TruthSuite
        run: |
          nohup pnpm run truth:sidecar > /tmp/truth-sidecar.log 2>&1 &
          for i in $(seq 1 60); do [ -s .run/sidecar.url ] && break; sleep 2; done
          cat .run/sidecar.url
      # Before MJAPI boots, so MJAPI and the agent-step child process both read the keys (§9 D2-33). The Model
      # Development Agent's prompts run on Gemini 3.8 Flash (driver GeminiLLM), so GEMINI_API_KEY alone measures G0.6.
      - name: Live-model keys (weekly only)
        if: env.TRUTH_MODE == 'weekly'
        env:
          LIVE_KEYS: '${{ secrets.INTEGRATION_LIVE_MODEL_KEYS }}'
          GEMINI_KEY: '${{ secrets.GEMINI_API_KEY }}'
        run: |
          if [ -n "$LIVE_KEYS" ]; then printf '%s\n' "$LIVE_KEYS" >> .env; src=INTEGRATION_LIVE_MODEL_KEYS
          elif [ -n "$GEMINI_KEY" ]; then printf 'AI_VENDOR_API_KEY__GeminiLLM=%s\n' "$GEMINI_KEY" >> .env; src=GEMINI_API_KEY
          else echo "::error::neither INTEGRATION_LIVE_MODEL_KEYS nor GEMINI_API_KEY is set — G0.6 cannot be measured" | tee -a "$GITHUB_STEP_SUMMARY"; exit 1; fi
          grep -q '^AI_VENDOR_API_KEY__GeminiLLM=' .env || { echo "::error::the live keys from $src carry no AI_VENDOR_API_KEY__GeminiLLM line" | tee -a "$GITHUB_STEP_SUMMARY"; exit 1; }
          echo "TRUTH_LIVE_MODEL=1" >> "$GITHUB_ENV"; echo "RUN_AGENT_TESTS=1" >> "$GITHUB_ENV"
          echo "live-model keys from $src" | tee -a "$GITHUB_STEP_SUMMARY"
      - name: Boot MJAPI on the truth sidecar
        run: |
          export PREDICTIVE_STUDIO_SIDECAR_URL=$(cat packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url)
          (cd packages/MJAPI && node dist/index.js > /tmp/mjapi.log 2>&1 &)
          for i in $(seq 1 36); do curl -fsS http://localhost:4000/healthcheck >/dev/null 2>&1 && exit 0; sleep 5; done
          tail -200 /tmp/mjapi.log; exit 1
      - name: Run the truth suite
        working-directory: packages/AI/PredictiveStudio/TruthSuite
        run: |
          set -o pipefail
          node scripts/run-truth.mjs --mode "$TRUTH_MODE" 2>&1 | tee /tmp/truth.log
      - name: Summary
        if: always()
        run: cat packages/AI/PredictiveStudio/TruthSuite/results/*/summary.md >> "$GITHUB_STEP_SUMMARY" || echo "no summary" >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: truth-results-${{ env.TRUTH_MODE }}-${{ github.run_id }}
          path: |
            packages/AI/PredictiveStudio/TruthSuite/results/
            /tmp/mjapi.log
            /tmp/truth-sidecar.log
          retention-days: 30
```

  The `bizapps-common` step replicates PR 1 plan §2.4 ("Install bizapps-common into the private database
  (database-only install)": `mj migrate --verbose --schema __mj_BizAppsCommon --dir <clone>/migrations`, then
  `mj sync push --dir <clone>/metadata --ci`, then §2.4's expected checks) with the CLI invoked as the other
  provisioning steps invoke it (`node packages/MJCLI/bin/run.js`). Its facts (§9 D2-32):
  - **Credentials:** none. `MemberJunction/bizapps-common` is public (`gh repo view` → `"visibility":"PUBLIC"`) and is
    fetched anonymously over HTTPS; the database is the job's own SQL Server container (`DB_*` above). No secret is
    added.
  - **Pin:** `BIZAPPS_COMMON_REF`, a full sha, fetched with `--depth 1` and checked equal after checkout. Before M-final.5
    bumps it to PR 1's companion (`76809d340e450905f1c80730a62ad3485aabeca0`, `MemberJunction/bizapps-common#354`), it is bizapps-common `main` @ `172b99a5fe` (v5.52.0, 2026-10-11).
  - **Time:** the assessment measured this install at 38 s for 31 migrations (`df6bfc2363`) and 41 s for the metadata
    push (29 s + 12 s, `ps-review/evidence/02-install.md` rows "dep bizapps-common" and "bizapps-common metadata");
    the pin has 41 migration files. The step writes its own wall time to the job summary; M6.4 records it per lane.
    The `pr` lane skips it (`if: env.TRUTH_MODE != 'pr'`; none of its gates needs bizapps-common).
  - **Caching:** none. The clone is one shallow commit (seconds); the migrations and push run against a database that
    is created fresh in every job, so there is nothing reusable to cache.
- [ ] Step 2: Validate the YAML locally: `brew install actionlint` (once), `actionlint .github/workflows/ps-truth-suite.yml`
  → no output (exit 0).
- [ ] Step 3: Push the branch and trigger `workflow_dispatch` with `mode: pr` (`gh workflow run ps-truth-suite.yml --ref
  ps/pr-2-truth-suite-containment -f mode=pr`); watch it (`gh run watch`). Expected: green job (no `required` gate yet,
  no `error`), summary line `pass 0 · fail 0 · xfail ≥ 9 · xpass ≥ 1 · not-implemented 99 · not-run ≥ 1 · error 0`.

#### Task M6.2: Nightly and weekly dry runs

- [ ] Step 1: `gh workflow run ps-truth-suite.yml --ref ps/pr-2-truth-suite-containment -f mode=nightly` → green; G0.2
  (PR 4's, `expected-fail`) measured (`published` and `consistent` of 60 recorded); the `bizapps-common (nightly / weekly)` step green with its
  summary line `bizapps-common 172b99a5fef78352dbfa54784eaa34149423f802 installed in <n> s` (PR 1's gates are
  still stubs here until M-final.5, so they report `not-implemented` like every stub). A failing install step is diagnosed and fixed in
  this task (§2.4's notes in PR 1's plan: a `tags` failure is F-ENV-5, a `prompts` failure F-ENV-6), never skipped.
- [ ] Step 2: `-f mode=weekly` → green; the `Live-model keys` step's summary line names its source
  (`GEMINI_API_KEY` as of 2026-10-12: `gh secret list -R MemberJunction/MJ` lists it and not
  `INTEGRATION_LIVE_MODEL_KEYS`, §9 D2-33) and G0.6 is measured (`xfail` before C4, its `measured` recorded in §11;
  a red `Live-model keys` step is fixed in this task, never skipped); the W8 and 400-seed
  stubs `not-implemented` (a stub reports `not-implemented` in every lane; `runMode`/`requires` apply once its owner PR
  writes its body).

#### Task M6.3: Commit the Phase-0 baseline

**Files:** Create `packages/AI/PredictiveStudio/TruthSuite/baselines/containment-<YYYY-MM-DD>.json`

- [ ] Step 1: From the nightly artifact, copy the Phase-0 result objects (outcome + measured + detail) into the
  baseline file — PR 2's ten and PR 4's G0.2/G0.3, whose baseline PR 4 is judged against; add `{ "mjCommit": "<sha>",
  "runId": "<run id>", "lane": "nightly" }`.
- [ ] Step 2: Write the same lines (gate, outcome, measured headline; G0.2/G0.3 marked "PR 4") into this plan's §11
  handoff entry. This is the "fails today" record the containment milestones are judged against.

#### Task M6.4: Measured runtime

- [ ] Step 1: From the three runs' logs, record per lane: provisioning minutes, bizapps-common install seconds
  (nightly, weekly: the step's summary line), data minutes, gate minutes (vitest),
  report seconds, total; the slowest five gates with their durations (`durationMs` in the
  result files).
- [ ] Step 2: Replace the estimate column of §5.3 with the measured numbers and add a §12 note. If the `pr` lane's gate
  time exceeds 15 min, move the slowest `pr` gate to `nightly` (registry edit + §9 entry) — the PR lane must stay fast
  enough to run on every PS PR.

#### Task M6.5: Document the suite

**Files:** Create `packages/AI/PredictiveStudio/TruthSuite/README.md` (full); Modify `guides/PREDICTIVE_STUDIO_GUIDE.md`
(a "Planted-truth suite" subsection under its testing section; per §9 `D2-48`, `guides/INTEGRATION_TESTING_QUICKSTART.md` is not modified so general MJ testing docs stay free of domain-specific Predictive Studio content)

- [ ] Step 1: README sections: what the suite proves; the registry and outcomes (§5.2 text); lanes; local loop
  (M5.7 Step 3 commands); adding a gate body (stub → body → status flip, with the `--against origin/next` rule); data
  and Loom pin (how to re-pin, the regeneration check); Python venv; troubleshooting (`error` outcomes; MJAPI not on
  the truth sidecar; `pstruth` entities missing → `truth:provision` then restart MJAPI). Authoring rule the
  walkthrough (Step 3) enforces: every command a reader runs, from an empty database to a `pr` run, sits in a fence
  whose info string is `bash readme-step`, in the order a reader runs them; those blocks contain no `<placeholder>`
  (they read `DB_DATABASE`, `GRAPHQL_PORT`, `MJ_API_KEY` and the other `DB_*` values from the `.env` the reader
  copied, as §2.3 does); the first step creates the database (`sqlcmd … -Q "CREATE DATABASE [$DB_DATABASE]"`) and
  the last is `pnpm run truth:run -- --mode pr`. Other fences (explanations, output samples) use plain `bash`.
- [ ] Step 2: `npm run check:claude-md` → passes (no CLAUDE.md change is made; the check also validates guide links).
- [ ] Step 3: The README walkthrough (§9 D2-35) — a script runs the README in a fresh checkout instead of a person
  reading it. **Files:** Create `src/readme/steps.ts`, `src/readme/__tests__/steps.test.ts`,
  `scripts/readme-walkthrough.mts`; Modify `package.json` (`"truth:readme": "tsx scripts/readme-walkthrough.mts"`).

```ts
// src/readme/steps.ts — the README's runnable steps (the README is verified by executing it).
export interface ReadmeStep {
  /** 1-based order of the step in the README. */
  Index: number;
  /** 1-based README line of the opening fence. */
  Line: number;
  /** The block's text, run as one `bash -euo pipefail` script. */
  Script: string;
}

/** The README's runnable steps: the `bash readme-step` fences, in order. */
export class ReadmeSteps {
  private static readonly fenceOpen = /^```bash readme-step\s*$/;
  private static readonly placeholder = /<[a-z][a-z0-9 _-]*>/i;

  /** Every `bash readme-step` block, in order. Throws on an unclosed block or a `<placeholder>` a script cannot run. */
  public static Extract(markdown: string): ReadmeStep[] {
    const lines = markdown.split('\n');
    const steps: ReadmeStep[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!ReadmeSteps.fenceOpen.test(lines[i] || '')) continue;
      const start = i;
      const body: string[] = [];
      for (i += 1; i < lines.length && (lines[i] || '') !== '```'; i++) body.push(lines[i] || '');
      if (i >= lines.length) throw new Error(`README line ${start + 1}: readme-step block is not closed`);
      const script = body.join('\n');
      const hole = ReadmeSteps.placeholder.exec(script);
      if (hole) throw new Error(`README line ${start + 1}: readme-step block contains the placeholder ${hole[0]}; read it from .env`);
      steps.push({ Index: steps.length + 1, Line: start + 1, Script: script });
    }
    return steps;
  }
}
```

```ts
// src/readme/__tests__/steps.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ReadmeSteps } from '../steps';
import { TruthSuite } from '../../registry/load';

describe('ReadmeSteps.Extract', () => {
  it('returns the readme-step blocks in order and skips other fences', () => {
    const md = ['# T', '```bash readme-step', 'echo one', '```', '```bash', 'echo sample', '```', '```bash readme-step', 'echo two', 'echo three', '```'].join('\n');
    expect(ReadmeSteps.Extract(md)).toEqual([
      { Index: 1, Line: 2, Script: 'echo one' },
      { Index: 2, Line: 8, Script: 'echo two\necho three' },
    ]);
  });
  it('refuses a placeholder', () => {
    expect(() => ReadmeSteps.Extract('```bash readme-step\nsqlcmd -d <your-db>\n```')).toThrow(/placeholder <your-db>/);
  });
  it('refuses an unclosed block', () => {
    expect(() => ReadmeSteps.Extract('```bash readme-step\necho x')).toThrow(/not closed/);
  });
  it('the committed README starts by creating the database and ends with a pr run', () => {
    const steps = ReadmeSteps.Extract(readFileSync(path.join(TruthSuite.Root(), 'README.md'), 'utf8'));
    expect(steps[0]?.Script).toMatch(/CREATE DATABASE \[\$DB_DATABASE\]/);
    expect(steps[steps.length - 1]?.Script).toMatch(/truth:run -- --mode pr/);
  });
});
```

```ts
/**
 * scripts/readme-walkthrough.mts — the README walkthrough. Runs every `bash readme-step` block of
 * TruthSuite/README.md, in order, in a fresh git worktree of HEAD (what a `git clone` of the branch contains) against
 * a new private database `<your DB_DATABASE>_readme` on GRAPHQL_PORT + 10, stops at the first non-zero exit, writes
 * results/readme-walkthrough.json, then stops the servers the README started, drops the database and removes the
 * worktree. Usage: pnpm run truth:readme -- --env "$MJ/.env.MJ_PS_PR2_<agent>"
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReadmeSteps } from '../src/readme/steps';
import { TruthSuite } from '../src/registry/load';

interface StepResult { Index: number; Line: number; ExitCode: number; Seconds: number }

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`missing ${name} <value>`);
  return value;
}

function envValue(envText: string, key: string): string {
  const prefix = `${key}=`;
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(prefix));
  const value = line ? line.slice(prefix.length).trim() : '';
  if (!value) throw new Error(`the env file has no ${key} line`);
  return value;
}

/** Bash run inside the worktree with its .env loaded; never throws (cleanup must finish). */
function bash(tree: string, script: string): number {
  // `??` on purpose: exit status 0 is the success value; null (killed by a signal) counts as failure.
  return spawnSync('bash', ['-euo', 'pipefail', '-c', `set -a; source .env; set +a\n${script}`], { cwd: tree, stdio: 'inherit' }).status ?? 1;
}

function main(): number {
  const suite = TruthSuite.Root();
  const mjRoot = path.resolve(suite, '../../../..');
  const steps = ReadmeSteps.Extract(readFileSync(path.join(suite, 'README.md'), 'utf8'));
  const baseEnv = readFileSync(path.resolve(arg('--env')), 'utf8');
  const database = `${envValue(baseEnv, 'DB_DATABASE')}_readme`;
  const port = String(Number(envValue(baseEnv, 'GRAPHQL_PORT')) + 10);
  const tree = path.join(mkdtempSync(path.join(tmpdir(), 'truth-readme-')), 'mj');
  execFileSync('git', ['-C', mjRoot, 'worktree', 'add', '--detach', tree, 'HEAD'], { stdio: 'inherit' });
  writeFileSync(path.join(tree, '.env'), baseEnv
    .replace(/^DB_DATABASE=.*$/m, `DB_DATABASE=${database}`)
    .replace(/^GRAPHQL_PORT=.*$/m, `GRAPHQL_PORT=${port}`));
  const results: StepResult[] = [];
  try {
    for (const s of steps) {
      const t0 = Date.now();
      const exitCode = bash(tree, s.Script);
      results.push({ Index: s.Index, Line: s.Line, ExitCode: exitCode, Seconds: Math.round((Date.now() - t0) / 1000) });
      if (exitCode !== 0) break;
    }
  } finally {
    const out = path.join(suite, 'results', 'readme-walkthrough.json');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ database, port, steps: steps.length, results }, null, 2));
    const sidecarUrl = path.join(tree, 'packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url');
    const sidecarPort = existsSync(sidecarUrl) ? new URL(readFileSync(sidecarUrl, 'utf8').trim()).port : '';
    for (const p of [port, sidecarPort].filter((x) => x.length > 0)) {
      bash(tree, `pids=$(lsof -ti tcp:${p} || true); if [ -n "$pids" ]; then kill $pids; fi`);
    }
    bash(tree, `sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -Q "IF DB_ID(N'$DB_DATABASE') IS NOT NULL BEGIN ALTER DATABASE [$DB_DATABASE] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DB_DATABASE]; END"`);
    execFileSync('git', ['-C', mjRoot, 'worktree', 'remove', '--force', tree], { stdio: 'inherit' });
  }
  const passed = results.filter((r) => r.ExitCode === 0).length;
  console.log(`readme walkthrough: ${passed} of ${steps.length} steps passed (database ${database})`);
  return passed === steps.length ? 0 : 1;
}

process.exitCode = main();
```

  Run: `pnpm --filter @memberjunction/predictive-studio-truth-suite exec vitest run src/readme` → `4 passed`;
  `(cd $TS && pnpm run truth:readme -- --env "$MJ/.env.MJ_PS_PR2_<agent>")` → `readme walkthrough: <n> of <n> steps
  passed`. A failing step names its README line in `results/readme-walkthrough.json`; fix the README (or the code it
  documents) and re-run until every step passes. The database name ends in `_readme`, so it is yours by the §2.3 naming
  rule and no other session uses it. Mutation checks (§6 shared notes): the placeholder check deleted → `refuses a
  placeholder` red; the unclosed-block throw deleted → `refuses an unclosed block` red; `if (exitCode !== 0) break;`
  deleted → not exposed by a unit test — run the walkthrough once with a README copy whose second step is `false`
  and record that every later step still ran (and none does once restored).

**Exit tests (M6):** the three workflow runs green; baseline committed; `src/readme` tests `4 passed`; the README
walkthrough (M6.5 Step 3) `<n> of <n> steps passed`, its JSON summary copied into §11.

**Checkpoint commit:** `ci(ps): PR 2 M6 — truth-suite workflow (pr / nightly / weekly), Phase-0 baseline, measured runtime`

### Containment milestones C1–C6 (shared notes)

The containment milestones change product code so that the ten Phase-0 gates PR 2 owns pass. They run after M6: the
gate bodies exist from M5.9/M5.10 and report `xfail` until the product change lands, and M6.3's committed baseline is
the "fails today" record each milestone is judged against. M-final flips the ten gates to `required`. G0.2 and G0.3
are PR 4's (program D-030): no C milestone changes the automated publish path they measure, and they stay
`expected-fail` (`xfail`, or `xpass` when no run publishes) in every PR 2 run. Each C milestone
ends with its gates reporting `xpass` through the truth-suite runner (M5.7); none of them edits a `status` in
`gates/gates.json` (M-final.1 does).

| Milestone | Depends on | Gates it makes pass (body) | Parallel-safe |
|---|---|---|---|
| C1 Remaining row caps | M6 (runner M5.7, body M5.9, baseline M6.3) | G0.1 `W1 → S7.5` (M5.9) | with C3 only (sub-branches `…--c1`, `…--c3`) |
| C2 Publication: guide text only (D-030) | M6 | none (G0.2/G0.3 are PR 4's) | no |
| C3 Scoring refusals | M6 | G0.7 `W1 → S7.3` (M5.9) | with C1 only |
| C4 UI semantics and copy | M6; after C2 (sequential order) | G0.4 `W1 → S9.4`, G0.5 `W1 → S9.5` (M5.10), G0.6 `W1 → S9.3` (M5.9) | no |
| C5 Training containment | M6, C4 (`Core/src/trust.ts`, the Predictions resource) | G0.8–G0.12 (M5.9) | no |
| C6 Hide what doesn't run | C5 (agent prompt and metadata) | none (re-runs the `pr` lane) | no |

No C milestone is parallel-safe with an M milestone: every C milestone's last task runs gates through the M5 runner
and compares against the M6.3 baseline. C1 and C3 touch disjoint files (C1: feature assembly, the scoring runner's
scope resolution, maintenance tests; C3: the inference processor, `model-readiness.ts`, the ScoreRecordSet operation)
and may run in parallel on sub-branches (program/conventions.md §3); the next sequential milestone's agent (C2) merges
both. C2 → C4 → C5 → C6 run in that order: C2, C5 and C6 edit `guides/PREDICTIVE_STUDIO_GUIDE.md`; C4 and C6 edit the
Model Development Agent prompt; C4 and C5 both edit `Core/src/trust.ts` and the Predictions resource component.

#### Shared runtime block (RV-0)

Every "Runtime verification" step below starts with this block (it restates §2.3/§2.5 and the M5.7 local loop).
`$MJ` is the PR branch checkout; `<agent>` is your database suffix.

```bash
cd $MJ && set -a; source .env.MJ_PS_PR2_<agent>; set +a
TS=$MJ/packages/AI/PredictiveStudio/TruthSuite
# 1. The single-threaded truth sidecar (M5.7). Start it when it does not answer /health. After any change under
#    Sidecar/src/python (C5.2), stop it first so the new sources load: pkill -f "scripts/sidecar.mts"; rm -f $TS/.run/sidecar.url
if ! { [ -s $TS/.run/sidecar.url ] && curl -fsS --max-time 3 "$(cat $TS/.run/sidecar.url)/health" > /dev/null; }; then
  rm -f $TS/.run/sidecar.url
  (cd $TS && pnpm run truth:sidecar > /tmp/truth-sidecar.log 2>&1 &)
  until [ -s $TS/.run/sidecar.url ]; do sleep 1; done
fi
# 2. (Re)start MJAPI on your port, pointed at that sidecar, then wait for a real connection
PIDS=$(lsof -ti tcp:"$GRAPHQL_PORT"); [ -n "$PIDS" ] && kill $PIDS
(cd packages/MJAPI && PREDICTIVE_STUDIO_SIDECAR_URL=$(cat $TS/.run/sidecar.url) pnpm start > /tmp/mjapi-pr2.log 2>&1 &)
until curl -s -o /dev/null --max-time 3 "http://localhost:$GRAPHQL_PORT/"; do sleep 5; done; echo UP
# SQL helper used by every check below (no row-count chatter, no headers)
sq() { sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -d "$DB_DATABASE" -C -h -1 -W -Q "SET NOCOUNT ON; $1"; }
# Run one gate through the M5.7 runner: gate <pr|nightly|weekly> "<testName>". run-truth.mjs creates
# $TS/results/<mode>-<UTC timestamp>/ (TRUTH_RESULTS_DIR), runs the gate vitest file filtered to that test (for G0.4/G0.5:
# the artifact producer, then the dashboards UI test), writes report.mjs's summary and exits with the report's code.
gate() { (cd $TS && pnpm run truth:run -- --mode "$1" --gate "$2"); echo "truth:run exit=$?"; }
# Read one gate's result from the newest results directory: outcome <GateID>  → "<Outcome> <Measured JSON>"
outcome() { node -e '
const fs = require("fs"), path = require("path");
const root = path.join(process.argv[1], "results");
const newest = fs.readdirSync(root).map((n) => path.join(root, n)).filter((d) => fs.statSync(d).isDirectory())
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const r = JSON.parse(fs.readFileSync(path.join(newest, "gates", process.argv[2] + ".json"), "utf8"));
console.log(r.Outcome, JSON.stringify(r.Measured));' "$TS" "$1"; }
```

Expected: `UP`. `truth:run exit=0` while the gates are `expected-fail` (an `xfail` or `xpass` never fails the run; a
`fail` cannot occur before M-final.1; an `error` exits 1 and is a harness defect to fix). A build is always the
package's own build (`cd packages/<Pkg> && pnpm run build; echo "exit=$?"` → `exit=0`), never turbo from the root,
except where a task says otherwise. The Pipeline Builder (G0.12; PR 4's G0.2, G0.3) runs in the harness's own server-provider
child process (`src/harness/agent-step.ts`, M5.6), which imports the built Engine `dist/`: rebuilding Engine is what
makes a builder change visible to those gates; the MJAPI restart covers the GraphQL operations (train, score, promote).

### C1 — Remaining row caps  ·  parallel-safe: with C3 only (no M milestone)  ·  depends on: M6 (runner M5.7, G0.1 body M5.9, baseline M6.3)

**Outcome:** every Predictive Studio read that feeds training, scoring or maintenance re-scoring returns every matching
row, or fails with a message that names the cap and the true match count. Gate `W1 → S7.5` (G0.1) reports `xpass`.

**What `next` already does (verified at `c92d4a47f9`) and what is left:**

| Read | Code | State on `next` | This milestone |
|---|---|---|---|
| Training target rows | `training-engine.ts:236` → `feature-assembly-executor.ts:244-249` → `data-access.ts:113-127` | Uncapped when no `maxRows` (#5295, `IgnoreMaxRows: params.MaxRows == null`). An explicit `maxRows` (Train action param `MaxRows`, operation `maxRows`) still truncates **silently**. | Explicit cap smaller than the match count → assembly throws, naming both numbers (C1.1). |
| Dated-source rows (as-of aggregates) | `feature-assembly-executor.ts:648` | `fetchRows({ EntityName })` with no `MaxRows` → uncapped since #5295 (F-PIT-4's cap half). | Pinned by a test (C1.3). |
| Filter-scope scoring | `score-record-set.runner.ts:219-241` | `MaxRows: maxRows`, no `IgnoreMaxRows` → stops at the entity's `UserViewMaxRows` (1,000) and reports success (F-L3-2). | Uncapped; explicit cap smaller than the match → refused (C1.2). |
| List-scope scoring | `score-record-set.runner.ts:200` (calls `resolveFilter(..., undefined, ...)`) | Same 1,000 cap on the member rows. | Fixed by C1.2. |
| View-scope scoring | `score-record-set.runner.ts:244-258` | `{ ViewID, ResultType }` only → the entity cap applies. | `IgnoreMaxRows: true` (C1.2). |
| Maintenance re-score | `maintenance/seams.ts:159-173` → runner filter scope with `maxRows: request.maxRows` (undefined) | Capped at 1,000 through the filter scope (F-MNT-6's read half). Retrain goes through `TrainingEngine` without `maxRows` → uncapped. | Fixed by C1.2; pinned by a test (C1.3). |

**Findings this milestone closes or contains** (evidence copied from `reference/findings.json` and the digests):

| ID | Sev | Defect (evidence) | Fix here | Test |
|---|---|---|---|---|
| F-L3-1 (+ F-MC-7) | S0 | Every default training run used at most 1,000 rows (`UserViewMaxRows`): fit on 800, graded on 200 with no interval; W1-signal s42 read 1,000 of 16,776; MoreCheese's shipped pipelines dropped 6,714 and 3,276 real rows (850 + 150 of 7,714 and 4,276). | Default path fixed by #5295; this milestone makes an explicit cap fail naming the cap instead of truncating. | C1.1 unit; G0.1 training half |
| F-L3-2 | S1 | `ScoreRecordSet` with a filter scope silently scores only 1,000 rows and reports success (Exp 104: "0.813 above the oracle: silent 1,000-row cap"). | Filter, list and view scopes read every row; an explicit `maxRows` smaller than the match is refused. | C1.2 unit; G0.1 scoring half |
| F-PIT-4 (cap half; owner PR 3) | S2 | The only as-of aggregates read at most 1,000 child rows. | Already uncapped on `next`; pinned so it cannot regress. | C1.3 unit |
| F-MNT-6 (read half; owner PR 4) | S2 | Maintenance re-scores at most 1,000 records and retrains on at most 1,000 rows. | Re-score inherits C1.2; retrain already uncapped. | C1.3 unit |

**Decision taken here (recorded in §9):** *D2-C1 — an explicit `maxRows`/`MaxRows` smaller than the number of matching rows is
an error on every training and scoring path, not a sample.* Reason: G0.1 demands "reads every row or ends Failed
naming the cap"; a silent sample is the defect. A caller that wants a sample narrows the population with a filter.
Rejected: keep explicit caps as silent samples (re-creates F-L3-1 for any caller that passes `MaxRows`).

#### Task C1.1: Assembly reads report the true match count; a truncating explicit cap fails

**Files:** Create `packages/AI/PredictiveStudio/Engine/src/feature-assembly/read-cap-error.ts` (exported through
`feature-assembly/index.ts`) · Modify `packages/AI/PredictiveStudio/Engine/src/feature-assembly/data-access.ts` ·
Modify `packages/AI/PredictiveStudio/Engine/src/feature-assembly/feature-assembly-executor.ts` ·
Test: Modify `packages/AI/PredictiveStudio/Engine/src/feature-assembly/__tests__/data-access.test.ts`,
Create `packages/AI/PredictiveStudio/Engine/src/feature-assembly/__tests__/read-completeness.test.ts`

**Interfaces:** Consumes `RunViewResult.TotalRowCount` (`@memberjunction/core`; filled by
`GenericDatabaseProvider` with a `COUNT(*)` whenever a read is capped and the cap was reached). Produces
`FetchRowsResult.TotalRowCount?: number`, `class ReadCapExceededError extends Error` (structured fields `EntityName`,
`MaxRows`, `RowsRead`, `RowsMatched`; `static IsTruncated(maxRows, rowsRead, rowsMatched)` — the one truncation rule
training and scoring share (C1.2); `static ForTraining(…)`, `static ForScoring(…)`) and the assembly error text
`FeatureAssembly read <n> of <m> rows of '<entity>' because MaxRows=<cap>.`

- [ ] Step 1: Write the failing tests. Append to `data-access.test.ts`:

```ts
describe('RunViewDataAccess.fetchRows — match count', () => {
  it('returns the database match count alongside the rows', async () => {
    class CountingProvider {
      async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], RowCount: 0, TotalRowCount: 1734, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
      }
    }
    // Test double: RunViewDataAccess calls only RunView on its provider.
    const res = await new RunViewDataAccess(USER, new CountingProvider() as unknown as IMetadataProvider).fetchRows({
      EntityName: 'Members',
      MaxRows: 1000,
    });
    expect(res.TotalRowCount).toBe(1734);
  });
});
```

Create `read-completeness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FeatureStepGraph, LeakageGuard } from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type DatedSourceSpec } from '../feature-assembly-executor';
import { ReadCapExceededError } from '../read-cap-error';
import type { IFeatureDataAccess, FetchRowsParams, FetchRowsResult, SourceRow } from '../data-access';

/**
 * Read completeness (gate W1 → S7.5, findings F-L3-1 / F-PIT-4). The data-access fake behaves like RunView:
 * it serves at most MaxRows rows and reports the database match count in TotalRowCount.
 */
class CappedDataAccess implements IFeatureDataAccess {
  public readonly Params: FetchRowsParams[] = [];
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    this.Params.push(params);
    const all = this.rowsByEntity[params.EntityName] || [];
    const served = params.MaxRows !== undefined ? all.slice(0, params.MaxRows) : all;
    return { Success: true, Rows: served, TotalRowCount: all.length };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

const STEPS: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure'] }] };
const GUARD: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 };

function members(n: number): SourceRow[] {
  return Array.from({ length: n }, (_v, i) => ({ ID: `m${i}`, tenure: i, Renewed: i % 2 }));
}

function assemble(dataAccess: IFeatureDataAccess, maxRows: number | undefined, datedSources?: DatedSourceSpec[]) {
  return new FeatureAssemblyExecutor().assemble({
    targetEntityName: 'Members',
    recordSet: { EntityName: 'Members', MaxRows: maxRows },
    sources: [{ Kind: 'Entity', Ref: 'Members' }],
    steps: STEPS,
    asOf: { Mode: 'none' },
    leakageGuard: GUARD,
    datedSources,
    targetVariable: 'Renewed',
    context: 'train',
    dataAccess,
  });
}

describe('FeatureAssembly — read every labelled row or fail naming the cap', () => {
  it('assembles every row when no MaxRows is set (16,776 of 16,776)', async () => {
    const access = new CappedDataAccess({ Members: members(16776) });
    const result = await assemble(access, undefined);
    expect(result.matrix.rows).toHaveLength(16776);
    expect(access.Params[0].MaxRows).toBeUndefined();
  });

  it('fails naming the cap when an explicit MaxRows cuts the read short', async () => {
    const access = new CappedDataAccess({ Members: members(1200) });
    await expect(assemble(access, 1000)).rejects.toThrow("FeatureAssembly read 1000 of 1200 rows of 'Members' because MaxRows=1000.");
    await expect(assemble(access, 1000)).rejects.toMatchObject({ EntityName: 'Members', MaxRows: 1000, RowsRead: 1000, RowsMatched: 1200 });
    await expect(assemble(access, 1000)).rejects.toBeInstanceOf(ReadCapExceededError);
  });

  it('accepts an explicit MaxRows that covers every matching row', async () => {
    const access = new CappedDataAccess({ Members: members(800) });
    const result = await assemble(access, 1000);
    expect(result.matrix.rows).toHaveLength(800);
  });
});
```

- [ ] Step 2: Run them; expected failure.

```bash
cd $MJ/packages/AI/PredictiveStudio/Engine
pnpm vitest run src/feature-assembly/__tests__/read-completeness.test.ts src/feature-assembly/__tests__/data-access.test.ts
```

Expected: `Tests  2 failed | 4 passed (6)` — `fails naming the cap…` ("promise resolved … instead of rejecting") and
`returns the database match count…` (`expected undefined to be 1734`).

- [ ] Step 3: Implement. `feature-assembly/read-cap-error.ts`:

```ts
/**
 * An explicit row cap (`maxRows` / `MaxRows`) smaller than the rows the read matches (decision D2-C1): training and
 * scoring refuse instead of silently working on a sample. One class, so both paths share one truncation rule and
 * callers branch on `instanceof` and the structured fields, never on the message.
 */
export class ReadCapExceededError extends Error {
  constructor(
    message: string,
    public readonly EntityName: string,
    public readonly MaxRows: number,
    public readonly RowsRead: number,
    public readonly RowsMatched: number,
  ) {
    super(message);
    this.name = 'ReadCapExceededError';
  }

  /**
   * True when an explicit cap cut the read short. No cap means the read was uncapped (`IgnoreMaxRows`), so it can
   * never truncate; an unknown match count cannot prove truncation.
   */
  public static IsTruncated(maxRows: number | undefined, rowsRead: number, rowsMatched: number | undefined): rowsMatched is number {
    return maxRows !== undefined && rowsMatched !== undefined && rowsMatched > rowsRead;
  }

  /** The training refusal (feature assembly). */
  public static ForTraining(entityName: string, maxRows: number, rowsRead: number, rowsMatched: number): ReadCapExceededError {
    return new ReadCapExceededError(
      `FeatureAssembly read ${rowsRead} of ${rowsMatched} rows of '${entityName}' because MaxRows=${maxRows}. ` +
        'Training reads every labelled row: remove maxRows, or narrow the population with a filter, and train again.',
      entityName, maxRows, rowsRead, rowsMatched,
    );
  }

  /** The scoring refusal (Score Record Set scope resolution). */
  public static ForScoring(entityName: string, maxRows: number, rowsRead: number, rowsMatched: number): ReadCapExceededError {
    return new ReadCapExceededError(
      `Score Record Set: the scope matches ${rowsMatched} rows of '${entityName}' but maxRows=${maxRows} would score only ${rowsRead}. ` +
        'Remove maxRows to score every matching row, or narrow the filter.',
      entityName, maxRows, rowsRead, rowsMatched,
    );
  }
}
```

Add `export * from './read-cap-error';` to `feature-assembly/index.ts`. In `data-access.ts` extend the result type and fill it:

```ts
export interface FetchRowsResult {
  /** Whether the read succeeded. */
  Success: boolean;
  /** The fetched rows (empty when `Success` is false). */
  Rows: SourceRow[];
  /**
   * Rows matching the read's filter as counted by the database, whatever cap applied. Equals `Rows.length` for an
   * uncapped read and is larger when `MaxRows` cut the read short. Optional so in-memory fixtures may omit it.
   */
  TotalRowCount?: number;
  /** Error detail when `Success` is false. */
  ErrorMessage?: string;
}
```

and in `RunViewDataAccess.fetchRows` replace `return { Success: true, Rows: result.Results ?? [] };` with:

```ts
    return { Success: true, Rows: result.Results || [], TotalRowCount: result.TotalRowCount };
```

In `feature-assembly-executor.ts` import `ReadCapExceededError` from `'./read-cap-error'` and, in `resolveRecords`,
replace the final `return res.Rows;` with:

```ts
    const cap = params.recordSet.MaxRows;
    // `??` on purpose: a match count of 0 is legitimate; an in-memory fixture without a count means "what it served".
    const matched = res.TotalRowCount ?? res.Rows.length;
    if (cap !== undefined && ReadCapExceededError.IsTruncated(cap, res.Rows.length, matched)) {
      throw ReadCapExceededError.ForTraining(params.recordSet.EntityName, cap, res.Rows.length, matched);
    }
    return res.Rows;
```

- [ ] Step 4: Run the Step 2 command; expected `Tests  6 passed (6)`. Then the package suite:
  `pnpm test` → `0 failed` (record the pass count; it is the start-of-milestone count + 4).

#### Task C1.2: Scoring scopes read every row; a truncating explicit `maxRows` is refused

**Files:** Modify `packages/AI/PredictiveStudio/Engine/src/actions/score-record-set.runner.ts` ·
Test: Create `packages/AI/PredictiveStudio/Engine/src/actions/__tests__/score-record-set.scope-caps.test.ts`

**Interfaces:** Consumes `ReadCapExceededError` (C1.1). Produces the refusal text
`Score Record Set: the scope matches <m> rows of '<entity>' but maxRows=<cap> would score only <n>.` thrown as a
`ReadCapExceededError` from `ProductionScoreRecordSetRunner.resolveScope` (so the Action returns `SCORING_FAILED` and
the Remote Operation fails with that message before any record is scored). Signatures of `resolveFilter` /
`resolveView` are unchanged.

- [ ] Step 1: Write the failing test:

```ts
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import type { ScoringScope } from '../score-record-set.action';

/** A loaded row as the runner reads it (PrimaryKey + EntityInfo only). */
interface FakeLoadedRow {
  PrimaryKey: { ToString(): string };
  EntityInfo: { ID: string };
}

/** Provider fake: behaves like RunView — serves `matched` rows, or at most MaxRows / the 1,000 entity cap. */
class ScopeProvider {
  public readonly Params: RunViewParams[] = [];
  constructor(private readonly matched: number) {}
  public EntityByName(name: string): { ID: string; Name: string } {
    return { ID: `${name}-id`, Name: name };
  }
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Params.push(params);
    const cap = params.IgnoreMaxRows === true ? this.matched : (params.MaxRows || 1000);   // no MaxRows → the entity's 1,000 cap
    const served = Math.min(this.matched, cap);
    const rows: FakeLoadedRow[] = Array.from({ length: served }, (_v, i) => ({
      PrimaryKey: { ToString: () => `r${i}` },
      EntityInfo: { ID: 'Members-id' },
    }));
    return {
      // Test double: the runner reads only PrimaryKey and EntityInfo from each loaded row.
      Success: true, Results: rows as unknown as T[], RowCount: served, TotalRowCount: this.matched, ExecutionTime: 0, ErrorMessage: '',
    } as RunViewResult<T>;
  }
}

class TestableRunner extends ProductionScoreRecordSetRunner {
  public Resolve(scope: ScoringScope, provider: ScopeProvider): Promise<RecordRef[]> {
    // Test doubles: resolveScope reads only the user's ID and the provider's RunView/EntityByName.
    return this.resolveScope(scope, { ID: 'u1' } as unknown as UserInfo, provider as unknown as IMetadataProvider);
  }
}

describe('ProductionScoreRecordSetRunner — scope reads are complete (W1 → S7.5, F-L3-2)', () => {
  it('a filter scope with no maxRows reads every matching row (16,776 of 16,776)', async () => {
    const provider = new ScopeProvider(16776);
    const refs = await new TestableRunner().Resolve({ filter: { entityName: 'Members', extraFilter: '1=1' } }, provider);
    expect(refs).toHaveLength(16776);
    expect(provider.Params[0].IgnoreMaxRows).toBe(true);
  });

  it('a view scope reads every row of the view', async () => {
    const provider = new ScopeProvider(1500);
    const refs = await new TestableRunner().Resolve({ viewId: 'view-1' }, provider);
    expect(refs).toHaveLength(1500);
    expect(provider.Params[0].IgnoreMaxRows).toBe(true);
  });

  it('refuses a filter scope whose explicit maxRows would score only part of the match', async () => {
    const provider = new ScopeProvider(16776);
    const refusal = new TestableRunner().Resolve({ filter: { entityName: 'Members', maxRows: 1000 } }, provider);
    await expect(refusal).rejects.toBeInstanceOf(ReadCapExceededError);
    await expect(refusal).rejects.toThrow("Score Record Set: the scope matches 16776 rows of 'Members' but maxRows=1000 would score only 1000.");
  });

  it('accepts an explicit maxRows that covers the whole match', async () => {
    const provider = new ScopeProvider(40);
    const refs = await new TestableRunner().Resolve({ filter: { entityName: 'Members', maxRows: 100 } }, provider);
    expect(refs).toHaveLength(40);
    expect(provider.Params[0].IgnoreMaxRows).toBe(false);
  });
});
```

- [ ] Step 2: Run it; expected failure.

```bash
cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm vitest run src/actions/__tests__/score-record-set.scope-caps.test.ts
```

Expected: `Tests  4 failed (4)` — the first two get 1000 refs instead of 16776 / 1500; the third resolves instead of
rejecting; the fourth reads `IgnoreMaxRows` `undefined` instead of `false`.

- [ ] Step 3: Implement in `score-record-set.runner.ts`. Replace the body of `resolveFilter`'s `RunView` call and add
  the completeness check:

```ts
  protected async resolveFilter(
    entityName: string,
    extraFilter: string | undefined,
    maxRows: number | undefined,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RecordRef[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView(); // global-provider-ok: fallback when no scoped provider is passed
    const result = await rv.RunView<BaseEntity>(
      {
        EntityName: entityName,
        ExtraFilter: extraFilter,
        MaxRows: maxRows,
        // No explicit cap means every matching row. Without this RunView silently stops at the entity's
        // UserViewMaxRows (1,000 by default) and the run reports success on a fraction of the scope (F-L3-2).
        IgnoreMaxRows: maxRows === undefined,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!result.Success) {
      throw new Error(`Score Record Set: failed to resolve scope for '${entityName}': ${result.ErrorMessage}`);
    }
    // Refuse a scope an explicit cap cut short: scoring a fraction and reporting success is F-L3-2 (decision D2-C1).
    if (maxRows !== undefined && ReadCapExceededError.IsTruncated(maxRows, result.Results.length, result.TotalRowCount)) {
      throw ReadCapExceededError.ForScoring(entityName, maxRows, result.Results.length, result.TotalRowCount);
    }
    const entityId = this.resolveEntityId(entityName, provider);
    return result.Results.map((row) => this.entityToRecordRef(row, entityId));
  }
```

(import `ReadCapExceededError` from `'../feature-assembly/read-cap-error'`), in `resolveView` change the params
literal to `{ ViewID: params.ViewID, IgnoreMaxRows: true, ResultType: 'entity_object' }` (with `// global-provider-ok:` on the fallback `new RunView()`), and in `resolveList` pass `IgnoreMaxRows: true` on the `MJ: List Details` query and batch the `IN (...)` target-entity queries into chunks of `100` (`ID_CHUNK_SIZE = 100`) via `rv.RunViews<BaseEntity>(...)` so lists larger than 100 or 1,000 rows neither truncate nor build an unbounded `IN (...)` clause (`coding_standards.md` §7).

- [ ] Step 4: Run the Step 2 command; expected `Tests  4 passed (4)`. Then
  `pnpm vitest run src/actions/__tests__` → `0 failed` (the primary-key and write-back suites stay green).

#### Task C1.3: Pin the dated-source and maintenance re-score reads

**Files:** Test: Modify `packages/AI/PredictiveStudio/Engine/src/feature-assembly/__tests__/read-completeness.test.ts`,
Create `packages/AI/PredictiveStudio/Engine/src/maintenance/__tests__/rescore-read.test.ts`

**Interfaces:** Consumes `ProductionRescoreRunner.rescore(request: RescoreRequest)` and
`ProductionScoreRecordSetRunner.prototype.run` (unchanged). No production change: both reads are already complete on
`next` (dated sources) or become complete through C1.2 (re-score). These tests stop either from regressing.

- [ ] Step 1: Write the tests. Append to `read-completeness.test.ts`:

```ts
describe('FeatureAssembly — dated sources are read in full (F-PIT-4 cap half)', () => {
  it('reads every row of a dated source (no MaxRows on the dated-source read)', async () => {
    const activities: SourceRow[] = Array.from({ length: 2500 }, (_v, i) => ({
      ID: `a${i}`, MemberID: `m${i % 10}`, ActivityDate: '2024-01-15T00:00:00Z',
    }));
    const access = new CappedDataAccess({ Members: members(10), Activities: activities });
    await assemble(access, undefined, [
      { EntityName: 'Activities', ForeignKeyField: 'MemberID', DateField: 'ActivityDate', Features: [{ OutputColumn: 'activity_count_asof', Aggregate: 'activity_count' }] },
    ]);
    const datedRead = access.Params.find((p) => p.EntityName === 'Activities');
    expect(datedRead).toBeDefined();
    expect(datedRead?.MaxRows).toBeUndefined();
  });
});
```

Create `maintenance/__tests__/rescore-read.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

import { ProductionRescoreRunner } from '../seams';
import { ProductionScoreRecordSetRunner } from '../../actions/score-record-set.runner';
import type { ScoreRecordSetRequest } from '../../actions/score-record-set.action';

afterEach(() => vi.restoreAllMocks());

describe('ProductionRescoreRunner — re-scores the whole population (F-MNT-6 read half)', () => {
  it('asks the scoring runner for a filter scope with no maxRows', async () => {
    const requests: ScoreRecordSetRequest[] = [];
    vi.spyOn(ProductionScoreRecordSetRunner.prototype, 'run').mockImplementation(async (request: ScoreRecordSetRequest) => {
      requests.push(request);
      return { scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false };
    });
    await new ProductionRescoreRunner().rescore({ modelId: 'm1', targetEntityName: 'Members' });
    expect(requests).toHaveLength(1);
    expect(requests[0].scope.filter).toEqual({ entityName: 'Members', extraFilter: undefined, maxRows: undefined });
  });
});
```

- [ ] Step 2: Run them:
  `pnpm vitest run src/feature-assembly/__tests__/read-completeness.test.ts src/maintenance/__tests__/rescore-read.test.ts`
  → expected `Tests  5 passed (5)` (they pin behaviour that C1.1/C1.2 and #5295 already deliver; if either fails,
  the dated-source or re-score read changed meaning — stop and re-read `feature-assembly-executor.ts:640-670` and
  `maintenance/seams.ts:158-174` before continuing).
- [ ] Step 3: No implementation. Build: `cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm run build; echo "exit=$?"`
  → `exit=0`.

#### Task C1.4: Runtime verification and gate `W1 → S7.5`

**Files:** none (verification only).

**Interfaces:** Consumes the M5.7 runner (`pnpm run truth:run -- --mode pr --gate "W1 → S7.5"`, wrapped by RV-0's
`gate`; result `results/<run id>/gates/G0.1.json`, read by RV-0's `outcome`), the G0.1 body (M5.9, unchanged; its
scoring half uses `W1S42ValidatedModel`, a full-row model promoted to Validated through the product's promote operation,
M5.6) and the test data of M4 (`pstruth.W1_MembershipYear`, entity `PS Truth: W1_MembershipYear`, 16,776 rows,
nullable `TruthScore FLOAT`; pipelines named `PSTruth: …`). The registry status stays `expected-fail` (M2.2).

- [ ] Step 1: Build Engine (`cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm run build; echo "exit=$?"` → `exit=0`), then
  run RV-0 so MJAPI loads the new code.
- [ ] Step 2: Run the gate:

```bash
gate pr "W1 → S7.5"      # → truth:run exit=0
outcome G0.1
```

Expected: `xpass {"labelledRows":16776,"trainingRows":13421,"holdoutRows":3355,"trainError":null,"filterScored":16776,"scoreError":null}`
(M6.3 baseline before C1: `xfail` with `filterScored` 1000; the training half already read 13421 + 3355 = 16776
because #5295 lifted the training cap).

- [ ] Step 3: Database checks (expected values in comments):

```bash
sq "SELECT TOP 1 m.TrainingRowCount + CAST(JSON_VALUE(m.Lineage,'$.lockedHoldoutRowCount') AS INT)
    FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth:%' ORDER BY m.__mj_CreatedAt DESC"            # → 16776
sq "SELECT COUNT(*) FROM pstruth.W1_MembershipYear"                          # → 16776
sq "SELECT COUNT(*) FROM pstruth.W1_MembershipYear WHERE TruthScore IS NOT NULL"  # → 0 (the G0.1 body scores without a write-back mapping)
```

- [ ] Step 4: Refusal of a truncating explicit cap, through MJAPI's generic Remote Operation mutation
  (`ExecuteRemoteOperation`, GraphQL root `/`, header `x-mj-api-key: $MJ_API_KEY`). The runner resolves the scope
  before it loads the model, so any W1 model id works:

```bash
export MODEL=$(sq "SELECT TOP 1 m.ID FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID WHERE p.Name LIKE 'PSTruth:%' ORDER BY m.__mj_CreatedAt DESC")
node --input-type=module -e '
const input = { modelId: process.env.MODEL, dryRun: true, scope: { filter: { entityName: "PS Truth: W1_MembershipYear", maxRows: 1000 } } };
const body = { query: "mutation($i: ExecuteRemoteOperationInput!){ ExecuteRemoteOperation(input: $i){ success errorMessage } }",
  variables: { i: { operationKey: "PredictiveStudio.ScoreRecordSet", invokeMode: "attached", inputJSON: JSON.stringify(input) } } };
const res = await fetch("http://localhost:" + process.env.GRAPHQL_PORT + "/", { method: "POST",
  headers: { "Content-Type": "application/json", "x-mj-api-key": process.env.MJ_API_KEY }, body: JSON.stringify(body) });
console.log(JSON.stringify((await res.json()).data.ExecuteRemoteOperation));
'
```

  Expected: `{"success":false,"errorMessage":"Score Record Set: the scope matches 16776 rows of 'PS Truth: W1_MembershipYear' but maxRows=1000 would score only 1000. Remove maxRows to score every matching row, or narrow the filter."}`
  and `sq "SELECT COUNT(*) FROM pstruth.W1_MembershipYear WHERE TruthScore IS NOT NULL"` → `0`.

- [ ] Step 5: Mutation checks (§6 shared notes):

| Guard | Mutation | Must go red |
|---|---|---|
| `IsTruncated` strict comparison | `rowsMatched > rowsRead` → `>=` | `accepts an explicit MaxRows that covers every matching row` |
| assembly refusal | delete the `throw ReadCapExceededError.ForTraining(…)` | `fails naming the cap when an explicit MaxRows cuts the read short` |
| assembly match count | `res.TotalRowCount ?? res.Rows.length` → `res.Rows.length` | `fails naming the cap …` |
| `fetchRows` passes the count on | drop `TotalRowCount: result.TotalRowCount` | `returns the database match count alongside the rows` |
| filter scope uncapped when no cap | `IgnoreMaxRows: maxRows === undefined` → `false` | `a filter scope with no maxRows reads every matching row` |
| view scope uncapped | drop `IgnoreMaxRows: true` in `resolveView` | `a view scope reads every row of the view` |
| scoring refusal | delete the `throw ReadCapExceededError.ForScoring(…)` | `refuses a filter scope whose explicit maxRows …` |
| `IsTruncated`'s `maxRows !== undefined` | delete it | not exposed: an uncapped read always returns every matching row, so no test can make `matched > read` without a cap (equivalent mutation) — record it |

  **Release note (conventions §5a):** an explicit `maxRows`/`MaxRows` smaller than the match count now fails training
  and refuses scoring instead of returning a sample (D2-C1, R-d); no MJ code passes one (open question 5). Listed in
  §10.

**Exit tests:**
- `cd packages/AI/PredictiveStudio/Engine && pnpm test` → start-of-milestone count + 10 new tests, `0 failed`
  (4 in `read-completeness`, 1 in `data-access`, 4 in `scope-caps`, 1 in `rescore-read`).
- `pnpm run build` in Engine → `exit=0`.
- Truth-suite runner (RV-0 `gate pr "W1 → S7.5"`): `outcome G0.1` → `xpass`.
- Keep-list: `pnpm --filter @memberjunction/predictive-studio run test:integration` → `3 passed`.

**Checkpoint commit:** `fix(ps): PR 2 C1 — every training, scoring and re-score read is complete or fails naming the cap`

### C2 — Publication: the guide states what the automated path does  ·  parallel-safe: no  ·  depends on: M6 (baseline M6.3); merges C1 and C3 if they ran on sub-branches

**Outcome:** no product behaviour changes. Models keep reaching `Published` without a human, as on `next`: the agent's
Pipeline Builder publishes a winner its trust verdict clears, and the opt-in auto-train publishes through the promotion
gate with `signOff: false` (program D-029, D-030). PR 4 replaces that path with gated automatic publishing and owns
G0.2 `W2 → C1.1` and G0.3 `W3 → C1.1`; their bodies are written in M5.9 and stay `expected-fail` in this PR (§4.1).
C2 corrects the guide sentences that say the automated path never publishes a coin-flip model, that the promotion gate
is the only status writer, and that every published model gets a per-model Action.

**What `next` does today:**
- `Engine/src/agent/pipeline-builder.ts:464-484` `maybePublish()` sets `model.Status = 'Published'` (`:479`) and
  saves directly when `trust.canAct` is true and training was not leakage-flagged: Draft → Published in one save,
  bypassing `ProductionModelPromotionGate` (its state machine, its artifact check `promote-model.gate.ts:211-212` and its
  per-model scoring Action sync). `canAct` comes from the point-estimate trust grade (`Core/src/trust.ts:215`), not an
  interval.
- `Engine/src/scoring/auto-train.ts:123-135` `trainAndPublish()` promotes Draft → Validated → Published with
  `signOff: false` and never reads the trust verdict; only the promotion gate's leakage refusal stops it.
- The guide says the opposite in three places: §12.4 "a coin-flip model is **never auto-published into the business
  catalog**", §13 item 4 "the single place that … transitions status", §15.3 "every published model becomes a
  first-class, discoverable Action".

**Findings closed or contained:**

| ID | Sev | Defect (evidence) | Closed / contained here | Test |
|---|---|---|---|---|
| F-DOC-19 (owned here) | S0 | Guide says a coin-flip model is never auto-published; the agent published two models whose holdout AUC interval contains 0.5. | §12.4 states that the bar is the point-estimate trust grade and that a model whose holdout AUC interval contains 0.5 can clear it and be published; §6.x states that auto-train publishes without reading the trust verdict (C2.1). | C2.1 grep + M-final.4 quote check |
| F-DOC-6, F-DOC-37 (owner PR 4; guide text contained here) | S3 | Guide says the promotion gate is the single place status changes and every published model gets a per-model Action; the agent sets the status directly and its models get none. | §12.4, §13 item 4 and §15.3 state that the Pipeline Builder sets `Published` directly, bypassing the gate, and that the models it publishes get no per-model Action (C2.1). PR 4 (E1) makes the gate the only status writer and re-corrects the text. | C2.1 grep + quote check |

**Not contained in PR 2 (D-030):** F-TR-9 (owner PR 4), F-L4-1 (+ F-SC-9), F-LK-1, F-SEL-2 and F-L3-3 (merged into
F-SEL-1) (owner PR 3). Their assessment containment (B6) was to remove automatic publishing, which D-029 reverses:
until PR 3's leakage audit (D7) and three-outcome gate (D11) and PR 4's gated publish (E1) land, the automated path can
publish a leaky or no-signal model. G0.2 and G0.3 measure exactly that and stay `expected-fail` until PR 4 (§9 R-g).

**Decision taken here (recorded in §9):** *D2-C2 — PR 2 leaves the automated publish path as `next` has it (D-030) and
corrects only the guide.* `pipeline-builder.ts`, `pipeline-builder-agent.ts`'s publish outcome, `auto-train.ts`, the
Model Development Agent's `Promote ML Model` link and its prompt's promote instructions are not changed by any PR 2
task. Rejected: stop the agent and auto-train at Validated until PR 4 (the earlier D-012/B6 reading; superseded by
D-029/D-030).

#### Task C2.1: Guide corrections for publication

**Files:** Modify `guides/PREDICTIVE_STUDIO_GUIDE.md` (§6.x auto-train bullet, §12.4 builder bullet, §13 item 4, §15.3
"What it is")

**Interfaces:** none. C2 owns the wording of these four guide passages; M-final.4 quote-checks them and does not
rewrite them (§9 D2-30). Closes F-DOC-19 ("a coin-flip model is never auto-published"; S0) and contains F-DOC-6 and
F-DOC-37 for these passages. Every sentence describes `next`'s code (D-030); PR 4 re-corrects them when it gates the
path.

- [ ] Step 1: In §6.x, in the sentence that contains `or **trains** the pipeline through the real \`TrainingEngine\` and
  publishes it through the promotion gate`, replace `a leakage-flagged model is refused and stays Draft for a human).`
  with `a leakage-flagged model is refused and stays Draft; the gate promotes it only on a request that records a
  sign-off with a reason).` (the gate's rule, `promote-model.gate.ts:55-64`: `signOff` plus a non-empty `reason`, from
  any caller), and after it insert:

```markdown
 Auto-train does not read the trust verdict: only the promotion gate's leakage refusal stops it, so a trained model
that is no better than chance is published when training did not flag leakage.
```

- [ ] Step 2: In §12.4, in the `PredictiveStudioPipelineBuilder` bullet, replace
  `So a coin-flip model is **never auto-published into the business catalog**.` with:

```markdown
The bar is the trust grade of one holdout number, not an interval, so a model whose holdout AUC interval contains 0.5
can clear it and be published (the assessment's agent runs published two). The builder sets `Status = 'Published'`
itself, without the promotion gate: the model skips the gate's state machine and artifact check and gets no per-model
scoring Action (§15.3).
```

- [ ] Step 3: In §13 item 4, append after the sentence ending `…and transitions status.`:
  ` One path bypasses it: the agent's Pipeline Builder sets \`Published\` directly (§12.4).`
- [ ] Step 4: In §15.3 "What it is", replace `so every published model becomes a first-class, discoverable Action` with
  `so every model published through the gate becomes a first-class, discoverable Action (a model the Pipeline Builder
  publishes directly gets none, §12.4)`.
- [ ] Step 5: Checks:
  `grep -n "never auto-published\|so every published model becomes\|stays Draft for a human" guides/PREDICTIVE_STUDIO_GUIDE.md` → no output;
  `grep -c "One path bypasses it\|Auto-train does not read the trust verdict\|can clear it and be published\|published through the gate becomes" guides/PREDICTIVE_STUDIO_GUIDE.md`
  → `4`. Each new sentence is true of the code (quote check, recorded in §11):
  `grep -n "model.Status = 'Published';" packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder.ts` → one hit
  in `maybePublish`; `grep -c "canAct\|TrustVerdicts.DeriveTrustVerdict" packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts`
  → `0`; `grep -c "for (const targetStatus of \['Validated', 'Published'\] as const)" packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts` → `1`.

**Exit tests:**
- Step 5's checks.
- D-030 — the automated publish path is unchanged:
  `git diff --stat origin/next...HEAD -- packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder.ts`
  → no output; `cd packages/AI/PredictiveStudio/Engine && pnpm vitest run src/scoring/__tests__/model-readiness.test.ts
  src/agent` → `0 failed` (the auto-train and builder tests of `next`, unmodified).
- Engine `pnpm test` → start-of-milestone count, `0 failed` (C2 adds no test).

**Checkpoint commit:** `docs(ps): PR 2 C2 — the guide states what the automated publish path does (D-030)`

### C3 — Scoring refusals  ·  parallel-safe: with C1 only (no M milestone)  ·  depends on: M6 (runner M5.7, G0.7 body M5.9, baseline M6.3)

**Outcome:** a Draft or Archived model is refused before any record is scored or written (Record Process runs, the
Score action and `PredictiveStudio.ScoreRecordSet` alike), and `ScoreRecordSet` with `dryRun: true` writes nothing.
Gate `W1 → S7.3` (G0.7) reports `xpass`.

**What `next` does today:**
- `MLModelInferenceProcessor.loadModel` (`scoring/ml-model-inference-processor.ts:247-263`) loads the model by id
  (`scoring/seams.ts:25-46` filters on `ID` only) and checks only that an artifact exists; `Preflight` (`:132-160`,
  added by #5295) refuses only "needs training". Status is never read.
- `PredictiveStudioScoreRecordSetServerOperation.InternalExecute`
  (`operations/score-record-set.operation.ts:66-75`) builds the runner request from `modelId`, `scope`, `writeBack`,
  user and provider — `input.dryRun` is dropped, although the runner honours `request.dryRun`
  (`actions/score-record-set.runner.ts:395`) and the contract promises "Compute the predictions WITHOUT writing them
  back (preview) when true" (`MJCoreEntities/src/generated/remote_operations.ts:254-255`).

**Findings closed:**

| ID | Sev | Defect (evidence) | Fix | Test |
|---|---|---|---|---|
| F-SCO-1 | S1 | Scoring has no status gate: Draft and Archived models both score records and write scores into the member table (Exp 56: v12 Draft `5703FDE9-…` and v11 Archived `DAE03635-…`, rows 1–5 and 6–10 each `{"scored":5,"wroteBack":true}`, 10 `MJ: Record Changes` rows). | Refuse `Draft` and `Archived` in `loadModel`, i.e. in `Preflight` before the first batch. | C3.1 unit; G0.7 |
| F-SCO-2 | S1 | `ScoreRecordSet` ignores `dryRun`: a "preview" call writes its scores (Exp 56: rows 11–15 with `dryRun=true` → `wroteBack:true`, 5 Record Changes). | The operation forwards `dryRun`. | C3.2 unit; G0.7 |
| F-DOC-23 (S1, guide) | S1 | Guide says dry runs (incl. `ScoreRecordSet` `dryRun`) compute without mutating; both wrote. | `ScoreRecordSet` half becomes true; guide states it (C3.3). The Feature Pipeline dry-run half is PR 1's (A-steps). | quote check |

**Decision taken here (recorded in §9):** *D2-C3 — only `Validated` and `Published` models score.* `Validated` stays
scoreable so any caller (a Studio user, the agent, a test) can preview a candidate (with `dryRun`) before publishing it; G0.7 names Draft and Archived.
The status check runs **after** the artifact checks, so a seeded model with no artifact still raises
`ModelNeedsTrainingError` and the opt-in auto-train path (unchanged by PR 2, D-030) still sees "needs training". Rejected: refuse
`Validated` too (blocks the preview-before-publish; PR 4's lifecycle gate decides the final rule, F1).

#### Task C3.1: Draft and Archived models are refused before the processor scores anything

**Files:** Modify `packages/AI/PredictiveStudio/Engine/src/scoring/model-readiness.ts` ·
Modify `packages/AI/PredictiveStudio/Engine/src/scoring/ml-model-inference-processor.ts` ·
Test: Modify `packages/AI/PredictiveStudio/Engine/src/scoring/__tests__/ml-model-inference-processor.test.ts`,
Create `packages/AI/PredictiveStudio/Engine/src/actions/__tests__/score-record-set.status.test.ts`

**Interfaces:** Produces `class ModelNotScorableError extends Error` with structured fields `ModelID`, `Status` and the
statics `CanScore(status: MJMLModelEntity['Status']): boolean` (an allow-list of `Validated` and `Published`: a
status it does not know fails closed) and `Message(modelId, status): string` (all in `scoring/model-readiness.ts`,
exported through `scoring/index.ts`'s existing `export *`; the rule lives on the class that reports it, coding
standards §2). The error is not a `ModelNeedsTrainingError`, so `Preflight` rethrows it without trying auto-train.

- [ ] Step 1: Write the failing tests. In `ml-model-inference-processor.test.ts` add a status member to `FakeMLModel`:

```ts
  public Status: 'Archived' | 'Draft' | 'Published' | 'Validated' = 'Published';
```

import `ModelNotScorableError` and `ModelNeedsTrainingError` from `'../model-readiness'`, and append:

```ts
describe('MLModelInferenceProcessor — lifecycle status gate (W1 → S7.3, F-SCO-1)', () => {
  for (const status of ['Draft', 'Archived'] as const) {
    it(`refuses a ${status} model in Preflight before any record is scored`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps, sidecar } = buildDeps(model);
      const processor = buildProcessor(deps);
      await expect(processor.Preflight(CTX)).rejects.toBeInstanceOf(ModelNotScorableError);
      await expect(processor.Preflight(CTX)).rejects.toThrow(`is ${status} and cannot score records`);
      expect(sidecar.Requests).toHaveLength(0);
    });

    it(`fails every record of a ${status} model without calling the sidecar`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps, sidecar } = buildDeps(model);
      const results = await buildProcessor(deps).ProcessBatch([memberRecord('a', 3, 1, 'NYC'), memberRecord('b', 5, 2, 'LA')], CTX);
      expect(results.map((r) => r.Status)).toEqual(['Failed', 'Failed']);
      expect(results[0].ErrorMessage).toContain('cannot score records');
      expect(sidecar.Requests).toHaveLength(0);
    });
  }

  for (const status of ['Validated', 'Published'] as const) {
    it(`scores a ${status} model`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps } = buildDeps(model);
      const processor = buildProcessor(deps);
      await processor.Preflight(CTX);
      const results = await processor.ProcessBatch([memberRecord('a', 3, 1, 'NYC')], CTX);
      expect(results[0].Status).toBe('Succeeded');
    });
  }

  it('a Draft model with no artifact still reports "needs training" (the status check runs after the artifact checks, D2-C3)', async () => {
    const model = new FakeMLModel();
    model.Status = 'Draft';
    model.ArtifactFileID = null;
    const { deps } = buildDeps(model);
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toBeInstanceOf(ModelNeedsTrainingError);
  });
});
```

Create `actions/__tests__/score-record-set.status.test.ts` (the whole runner: a refused model writes nothing even
when write-back is requested):

```ts
import { describe, it, expect } from 'vitest';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../../scoring/types';

/** The model fields loadModel reads before the status check. */
class StatusModel {
  constructor(public readonly Status: 'Draft' | 'Archived', public readonly ID = 'm1', public readonly ArtifactFileID = 'file-1') {}
}

class Loader implements IMLModelLoader {
  constructor(private readonly model: StatusModel) {}
  async loadModel(): Promise<MJMLModelEntity | null> {
    // Test double: loadModel's callers read only ID, ArtifactFileID and Status before the status refusal.
    return this.model as unknown as MJMLModelEntity;
  }
}

class CountingSidecar implements ISidecarPredictor {
  public Calls = 0;
  async predict(_req: PredictRequest): Promise<PredictResponse> {
    this.Calls++;
    return { predictions: [] };
  }
}

/** Counts Save() calls on the write-back target. */
class SaveCounter {
  public Saves = 0;
  public get EntityInfo() {
    return { Name: 'Members', Fields: [{ Name: 'TruthScore' }] };
  }
  public Set(_field: string, _value: number | string | null): void {}
  public async Save(): Promise<boolean> {
    this.Saves++;
    return true;
  }
}

class TestRunner extends ProductionScoreRecordSetRunner {
  constructor(deps: MLInferenceDeps, public readonly Target: SaveCounter) {
    super({ deps });
  }
  protected override async resolveTargetEntity(_record: RecordRef): Promise<BaseEntity> {
    return this.Target as unknown as BaseEntity;   // test double: write-back reads EntityInfo and calls Set/Save only
  }
}

describe('ProductionScoreRecordSetRunner — refused models write nothing (W1 → S7.3)', () => {
  for (const status of ['Draft', 'Archived'] as const) {
    it(`a ${status} model with write-back throws before scoring and saves 0 rows`, async () => {
      const artifacts = new InMemoryArtifactLoader();
      artifacts.set('file-1', new TextEncoder().encode('bytes'));
      const sidecar = new CountingSidecar();
      const runner = new TestRunner({ modelLoader: new Loader(new StatusModel(status)), artifactLoader: artifacts, sidecar }, new SaveCounter());
      await expect(
        runner.run({
          modelId: 'm1',
          scope: { records: [{ ID: 'r1' }, { ID: 'r2' }] },
          writeBack: { OutputMapping: { fields: { TruthScore: '$.score' } } },
          contextUser: { ID: 'u1' } as unknown as UserInfo,          // test doubles: the refusal happens before either is used
          provider: {} as unknown as IMetadataProvider,
        }),
      ).rejects.toThrow(`is ${status} and cannot score records`);
      expect(sidecar.Calls).toBe(0);
      expect(runner.Target.Saves).toBe(0);
    });
  }
});
```

- [ ] Step 2: Run them; expected failure.

```bash
cd $MJ/packages/AI/PredictiveStudio/Engine
pnpm vitest run src/scoring/__tests__/ml-model-inference-processor.test.ts src/actions/__tests__/score-record-set.status.test.ts
```

Expected: `6 failed` — the four Draft/Archived processor tests (Preflight resolves; records succeed) and both runner
tests (`run()` resolves instead of rejecting); the two Validated/Published tests and the no-artifact Draft test pass.

- [ ] Step 3: Implement. Append to `model-readiness.ts`:

```ts
/**
 * Thrown when a model's lifecycle status forbids scoring. Distinct from "needs training" so auto-train never reacts
 * to it. Only Validated (preview) and Published models score (containment of F-SCO-1; the lifecycle gate's
 * publish rules own the final rule).
 */
export class ModelNotScorableError extends Error {
  constructor(public readonly ModelID: string, public readonly Status: MJMLModelEntity['Status']) {
    super(`MLModelInferenceProcessor: ${ModelNotScorableError.Message(ModelID, Status)}`);
    this.name = 'ModelNotScorableError';
  }

  /**
   * Whether a model in this lifecycle status may score. An allow-list, so a status this rule does not know (a value
   * CodeGen adds later) fails closed: a Draft has not passed the promotion gate and an Archived model is retired.
   */
  public static CanScore(status: MJMLModelEntity['Status']): boolean {
    return status === 'Validated' || status === 'Published';
  }

  /** The refusal message for a model whose status may not score. */
  public static Message(modelId: string, status: MJMLModelEntity['Status']): string {
    const next =
      status === 'Draft'
        ? 'Move it to Validated through the promotion gate first.'
        : 'Score with a Published version of the pipeline, or un-archive this model through the promotion gate.';
    return `ML Model '${modelId}' is ${status} and cannot score records: only Validated or Published models score. ${next}`;
  }
}
```

(add `import type { MJMLModelEntity } from '@memberjunction/core-entities';` to `model-readiness.ts` if it is not
imported there yet). In `ml-model-inference-processor.ts` import `ModelNotScorableError` from `'./model-readiness'` and
in `loadModel`, between the artifact-bytes check and `return this.buildLoadedModel(model, bytes, context);`, add:

```ts
    if (!ModelNotScorableError.CanScore(model.Status)) {
      throw new ModelNotScorableError(this.modelId, model.Status);
    }
```

- [ ] Step 4: Run the Step 2 command → `0 failed`; then `pnpm vitest run src/scoring src/actions` → `0 failed`
  (the existing processor tests now use `Status = 'Published'` by default).

#### Task C3.2: `ScoreRecordSet` honours `dryRun`

**Files:** Modify `packages/AI/PredictiveStudio/Engine/src/operations/score-record-set.operation.ts` ·
Test: Modify `packages/AI/PredictiveStudio/Engine/src/operations/__tests__/score-record-set.operation.test.ts`

**Interfaces:** Consumes `PredictiveStudioScoreRecordSetInput.dryRun?: boolean` (generated) and
`ScoreRecordSetRequest.dryRun?: boolean` (`actions/score-record-set.action.ts:69`). The Score **Action** has no
`DryRun` parameter in `metadata/actions/predictive-studio/.predictive-studio-actions.json`; it is unchanged (no gate
uses it; adding a parameter is PR 4's F-step on the new scoring path).

- [ ] Step 1: Append the failing tests:

```ts
describe('PredictiveStudioScoreRecordSetServerOperation — dry run (W1 → S7.3, F-SCO-2)', () => {
  it('forwards dryRun to the runner so a preview writes nothing', async () => {
    const runner = new MockRunner({ scoredCount: 5, failedCount: 0, skippedCount: 0, wroteBack: false });
    await new TestableScoreOp(runner).ExecuteServer(
      { modelId: 'm1', scope: { records: ['r1'] }, dryRun: true, writeBack: { OutputMapping: { fields: { TruthScore: '$.score' } } } },
      new CapturingContext(),
    );
    expect(runner.LastRequest?.dryRun).toBe(true);
  });

  it('treats an omitted dryRun as a real run', async () => {
    const runner = new MockRunner({ scoredCount: 1, failedCount: 0, skippedCount: 0, wroteBack: true });
    await new TestableScoreOp(runner).ExecuteServer({ modelId: 'm1', scope: { records: ['r1'] }, writeBack: true }, new CapturingContext());
    expect(runner.LastRequest?.dryRun).toBe(false);
  });
});
```

- [ ] Step 2: Run `pnpm vitest run src/operations/__tests__/score-record-set.operation.test.ts` → `2 failed`
  (`expected undefined to be true`, `expected undefined to be false`).
- [ ] Step 3: Implement — in `InternalExecute`'s request literal add `dryRun: input.dryRun === true,` after the
  `writeBack` line.
- [ ] Step 4: Re-run → `0 failed`.

#### Task C3.3: Guide corrections for scoring

**Files:** Modify `guides/PREDICTIVE_STUDIO_GUIDE.md` (§6.3)

**Interfaces:** none. This milestone owns the wording of these guide sections; M-final.4 quote-checks them and does not
rewrite them (§9 D2-30). Closes F-DOC-23's `ScoreRecordSet` half.

- [ ] Step 1: Append to §6.3 (after the paragraph that starts `**Ephemeral by default; write-back when an \`OutputMapping\` is present.**`):

```markdown
**Who may score.** Only `Validated` and `Published` models score. A `Draft` or `Archived` model is refused once, before
the first record (`ModelNotScorableError` from `Preflight`), and nothing is written. **Dry runs:**
`PredictiveStudio.ScoreRecordSet` with `dryRun: true` computes the predictions and returns them without writing back,
even when a write-back mapping is supplied. The Score Record Set *Action* has no dry-run parameter.
```

- [ ] Step 2: `grep -n "Who may score" guides/PREDICTIVE_STUDIO_GUIDE.md` → one line.

#### Task C3.4: Runtime verification and gate `W1 → S7.3`

**Files:** none.

**Interfaces:** Consumes the M5.7 runner (RV-0 `gate`/`outcome`), the G0.7 body (M5.9, unchanged: Draft fixture
`W1S42Model`, an Archived fixture moved Draft → Validated → Archived through the product's promote operation, and a dry run
on `W1S42ValidatedModel`; scope `Region = 'NA' AND [Year] = 2024` with `maxRows: 5000`, which covers the 1,625 matching
rows so C1.2 does not refuse it), `WasScoringRefused` (§5.8, unchanged) and the M4 test data
(`pstruth.W1_MembershipYear.TruthScore`, the write-back target).

- [ ] Step 1: Build Engine (`pnpm run build; echo "exit=$?"` → `exit=0`); run RV-0.
- [ ] Step 2: `gate pr "W1 → S7.3"`; `outcome G0.7` → `xpass` with `draftWritten` 0, `archivedWritten` 0, `dryRunWritten` 0,
  `draftError` containing `is Draft and cannot score records` and `archivedError` containing `is Archived and cannot
  score records` (M6.3 baseline: `xfail`, all three wrote rows).
- [ ] Step 3: Database checks:

```bash
sq "SELECT COUNT(*) FROM pstruth.W1_MembershipYear WHERE TruthScore IS NOT NULL"                    # → 0
sq "SELECT COUNT(*) FROM __mj.RecordChange rc JOIN __mj.Entity e ON e.ID = rc.EntityID
    WHERE e.Name = 'PS Truth: W1_MembershipYear' AND rc.ChangedAt >= DATEADD(hour, -1, GETUTCDATE())" # → 0
```

(`PS Truth:` entities have `TrackRecordChanges` off (§5.5), so the second query is 0 by construction; the `TruthScore`
count is the check that matters.)

- [ ] Step 4: Mutation checks (§6 shared notes): `CanScore` → `status !== 'Archived'` → `refuses a Draft model in
  Preflight …` and `fails every record of a Draft model …` red; the status check moved before the artifact checks →
  `a Draft model with no artifact still reports "needs training" …` red; the `throw` deleted → all four Draft/Archived
  processor tests and both runner tests red; `dryRun: input.dryRun === true` → `dryRun: false` → `forwards dryRun to
  the runner …` red.

  **Release notes and remediation (conventions §5a):** after deploy, any Record Process or scheduled scoring job bound
  to a Draft or Archived model fails before its first record (one `ModelNotScorableError` per run) instead of writing
  scores; operators re-point it to a Validated/Published model. The fix prevents new writes and does not heal old
  ones: scores already written by Draft/Archived models stay in the target columns, and earlier `dryRun` calls of
  `PredictiveStudio.ScoreRecordSet` did write. Remediation: find the `ML Model` work-type Record Processes whose
  configured model is now `Draft` or `Archived` (the same model id the inference processor loads), re-point them, and
  re-score their scopes with a Published model; the first post-deploy run of each such process is the one that fails.
  Both go to §10.

**Exit tests:**
- `cd packages/AI/PredictiveStudio/Engine && pnpm test` → start-of-milestone count + 11 (7 processor, 2 runner, 2
  operation), `0 failed`; Engine `pnpm run build` → `exit=0`.
- Truth-suite runner: `gate pr "W1 → S7.3"` → G0.7 `xpass`.
- Keep-list: `pnpm vitest run src/scoring/__tests__/model-readiness.test.ts` → `0 failed` (#5295's `Preflight`
  "needs training" refusal and auto-train still behave).

**Checkpoint commit:** `fix(ps): PR 2 C3 — Draft and Archived models never score; ScoreRecordSet honours dryRun`

### C4 — UI semantics and copy  ·  parallel-safe: no  ·  depends on: C2 (sequential order of the shared notes), M6 (G0.4/G0.5 bodies M5.10, G0.6 body and story generator M5.6/M5.9)

**Outcome:** a per-member driver badge says "Increases Risk" / "Lowers Risk" relative to the adverse outcome the
screen shows; the At-Risk list (Send to a list, Share / export, the agent context) is ranked by the same inverted risk
the grid uses; global driver lists are shown only for models whose stored importance is a coefficient magnitude
(logistic and ridge regression) and are hidden for split/impurity importance (trees, boosting) and for models with
none (MLP); no Predictive Studio screen, report or story prompt uses causal or "lever" language. Gates `W1 → S9.4`
(G0.4), `W1 → S9.5` (G0.5) and `W1 → S9.3` (G0.6) report `xpass`.

**What `next` does today (all verified at `c92d4a47f9`):**
- `at-risk.view-models.ts:69` `ParseRowDrivers` sets `up: value > 0` from the raw contribution. For a model whose
  score is P(good outcome) a positive contribution *lowers* risk, but the drawer shows "Increases Risk"
  (`ps-predictions-grid.component.html:368`). The grid passes `InvertedRisk` to `ParseAtRiskRows` (`:787-791`), which
  inverts the risk number but not the drivers.
- `ps-predictions-resource.component.ts:678` calls `ParseAtRiskRows(...)` with **no options**, so `AtRiskRows` is
  sorted by P(renew) descending; `SendToList` (`:843`) takes the top 200 non-`low` rows and `ExportList` (`:885-895`)
  writes them as "Likelihood %" into `…-at-risk.csv`.
- `TopGlobalDrivers(model.FeatureImportance)` (`:662`) feeds "What's driving this:" (`:126`) for every algorithm; the
  model story (`ps-model-detail.component.ts:306-312`), the record form's prediction panel
  (`model-prediction.panel.ts:453`) and the agent's results report (`pipeline-builder-agent.ts:253-260`, with an
  **invented** descending list from `CandidateFeatures` when importance is empty) do the same. Tree importances are
  impurity or split counts (`Sidecar/src/python/app/main.py:445-460`).
- Causal copy: `Core/src/trust.ts:152` "Explains about X% of what drives the outcome."; the report's
  "## Top Influential Features" and "Trained with honest holdout evaluation to safeguard against out-of-sample error."
  (`pipeline-builder-agent.ts:186`, `:190`); the drawer's "Key Decision Drivers (Explainability)" (grid html `:355`);
  "What's driving this:" (resource `:126`); the agent's report instruction "which features mattered most" (template
  `:59`).

**Findings closed or contained:**

| ID | Sev | Defect (evidence) | Fix here | Test |
|---|---|---|---|---|
| F-UI-3 | S0 | The per-member "why" says "Increases Risk" for every factor that makes renewal more likely (Exp 70, W1-signal s42: AutoRenew top driver on 488 rows, value +1.135756 each, badge "Increases Risk" 488/488; all 722 AutoRenew-driver rows the same). | `ParseRowDrivers` takes the risk direction; the badge text comes from one function. | C4.2 unit + DOM; G0.4 |
| F-UI-4 | S0 | "Send to a list" builds the "At-Risk" list from the members most likely to renew; "Share / export" sorts and labels the file the same way (Exp 71: list of 200 of 1,625, mean TrueP 0.9675 vs grid top-200 0.5435, overlap 0; 188 of 200 among the 199 safest). | The resource builds `AtRiskRows` with the grid's polarity; the list takes the highest-risk rows; the CSV header says "Risk %". | C4.2 unit; G0.5 |
| F-SC-11 (owner PR 3) | S1 | RandomForest impurity importance ranks a pure-noise continuous feature above the real binary driver. | Global driver lists hidden for split/impurity importance (as shown to users). | C4.1/C4.3 unit |
| F-SC-9b (owner PR 3) | S1 | LightGBM's default "split" importance hides a leaked categorical even from an aggregated check. | Same. | C4.1/C4.3 unit |
| F-UI-1 | S2 | The regression trust headline uses causal language: "Explains about 31% of what drives the outcome." (`TrustVerdicts.DeriveTrustVerdict({ProblemType:'regression', HoldoutMetrics:'{"r2":0.31}'})`). | Associative wording. | C4.4 unit; G0.6 |
| F-UI-2 (copy; owner PR 4) | S1 | Every agent report says "Trained with honest holdout evaluation…" whatever happened. | Canned sentence removed; the report says how the score was measured. (The "CV" column and the 0.85 fallback stay for PR 3/PR 4: D3 and E7.) | C4.4 unit; G0.6 |
| F-L3-3 (copy) | S1 | Report copy vouches for a holdout the builder also selected on. | Replaced by a factual line. | C4.4 unit |

**Decision taken here (recorded in §9):** *D2-C4 — show a global driver list only when the algorithm's stored importance is
a coefficient magnitude (`logistic_regression`, `ridge`).* Rejected: hide all global lists (removes the one honest
list a business user gets today); show all with a caveat (users act on the ranking, not on the caveat). PR 3's D8
(held-out permutation importance) re-enables the list for every algorithm.

#### Task C4.1: Core — which importances may be shown, and the causal-phrase list

**Files:** Create `packages/AI/PredictiveStudio/Core/src/importance-display.ts`,
Create `packages/AI/PredictiveStudio/Core/src/causal-copy.ts` · Modify `packages/AI/PredictiveStudio/Core/src/index.ts` ·
Test: Create `packages/AI/PredictiveStudio/Core/src/__tests__/importance-display.test.ts`,
Create `packages/AI/PredictiveStudio/Core/src/__tests__/causal-copy.test.ts`

**Interfaces:** Produces `ImportanceDisplay.GlobalDriversShowable(algorithm: string | null | undefined): boolean`,
`ImportanceDisplay.HiddenNote: string`, `CausalCopy.Patterns: ReadonlyArray<CausalCopyPattern>`,
`CausalCopy.FindPhrases(text: string): string[]` (static members of the two new classes that own the rules, coding
standards §2). Consumed by the Engine report (C4.3), the dashboards (C4.2/C4.3), core-entity-forms (C4.3), the scan
test (C4.4) and, from C4.5, the truth suite's G0.6 scan and story check (`TruthSuite/src/gates/causal-copy.ts`
derives `CausalCopyScan.Patterns` from `CausalCopy.Patterns`, §9 D2-25).

- [ ] Step 1: Write the failing tests.

```ts
// importance-display.test.ts
import { describe, it, expect } from 'vitest';
import { ImportanceDisplay } from '../importance-display';

describe('ImportanceDisplay.GlobalDriversShowable', () => {
  it('shows coefficient importance (display names and driver keys)', () => {
    for (const name of ['Logistic Regression', 'logistic_regression', 'Ridge Regression', 'ridge']) {
      expect(ImportanceDisplay.GlobalDriversShowable(name)).toBe(true);
    }
  });
  it('hides split / impurity importance and models with none', () => {
    for (const name of ['Random Forest', 'random_forest', 'LightGBM', 'lightgbm', 'XGBoost', 'xgboost', 'Multilayer Perceptron', 'mlp', '', null, undefined]) {
      expect(ImportanceDisplay.GlobalDriversShowable(name)).toBe(false);
    }
  });
  it('explains why a list is hidden without causal words', () => {
    expect(ImportanceDisplay.HiddenNote).toMatch(/split or impurity counts/);
  });
});
```

```ts
// causal-copy.test.ts
import { describe, it, expect } from 'vitest';
import { CausalCopy } from '../causal-copy';

describe('CausalCopy.FindPhrases', () => {
  it('finds the phrases the assessment flagged', () => {
    expect(CausalCopy.FindPhrases('Explains about 31% of what drives the outcome.')).toEqual(['what drives', 'drives the outcome', 'explains about']);
    expect(CausalCopy.FindPhrases('Pull these levers to reduce churn')).toEqual(['lever']);
    expect(CausalCopy.FindPhrases("What's driving this: Tenure")).toEqual(["what's driving"]);
    expect(CausalCopy.FindPhrases('Key Decision Drivers (Explainability)')).toEqual(['decision drivers']);
    expect(CausalCopy.FindPhrases('## Top Influential Features')).toEqual(['influential']);
    expect(CausalCopy.FindPhrases('Trained with honest holdout evaluation to safeguard')).toEqual(['honest holdout evaluation']);
  });
  it('accepts associative wording and unrelated words', () => {
    expect(CausalCopy.FindPhrases('Accounts for about 31% of the variation in the outcome — an association, not a cause.')).toEqual([]);
    expect(CausalCopy.FindPhrases('Drivers: features associated with a lower renewal score. Leverage approved queries.')).toEqual([]);
  });
});
```

- [ ] Step 2: `cd $MJ/packages/AI/PredictiveStudio/Core && pnpm vitest run src/__tests__/importance-display.test.ts src/__tests__/causal-copy.test.ts`
  → fails to resolve both modules (`Failed to load url ../importance-display`).

- [ ] Step 3: Implement.

```ts
// importance-display.ts
/**
 * @module importance-display
 *
 * Which stored feature importances may be shown to people as a global "drivers" list. The sidecar stores
 * `feature_importances_` for tree models (impurity for random forest, split counts for LightGBM, gain for XGBoost) and
 * |coefficient| for linear models (`Sidecar/src/python/app/main.py` `_extract_importance`). Split and impurity counts
 * favour noisy continuous and many-valued columns (findings F-SC-11, F-SC-9b), so those lists are hidden until
 * held-out permutation importance exists (held-out permutation importance is planned). Pure; no dependencies.
 */

/** Which global feature-importance lists people may see (decision D2-C4). */
export class ImportanceDisplay {
  /** Algorithm keys (normalised: lower case, letters and digits only) whose stored importance is a coefficient magnitude. */
  private static readonly coefficientAlgorithms: ReadonlySet<string> = new Set(['logisticregression', 'ridgeregression', 'ridge']);

  /** Plain note shown where a hidden global list used to be. */
  public static readonly HiddenNote =
    "This model's feature weights are the algorithm's own split or impurity counts, which favour noisy and many-valued " +
    'columns, so they are hidden until held-out importance is available.';

  /**
   * Whether a model's global feature-importance list may be shown, given its algorithm's display name
   * (`MJ: ML Models.Algorithm`, e.g. "Logistic Regression") or sidecar driver key (e.g. `logistic_regression`).
   * Unknown or missing algorithms are hidden (fail closed).
   */
  public static GlobalDriversShowable(algorithm: string | null | undefined): boolean {
    const key = (algorithm || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return ImportanceDisplay.coefficientAlgorithms.has(key);
  }
}
```

```ts
// causal-copy.ts
/**
 * @module causal-copy
 *
 * Phrases Predictive Studio must not show people: attributions are "drivers" (associations), never levers or causes
 * (criterion S9.3, findings F-UI-1, F-UI-2). One list, used by the copy-scan unit test and the truth-suite story scan.
 */

/** One forbidden phrase: a short label (reported) and the pattern that finds it. */
export interface CausalCopyPattern {
  Label: string;
  Pattern: RegExp;
}

/** The one list of causal or "lever" phrases, and the scan over it. */
export class CausalCopy {
  public static readonly Patterns: ReadonlyArray<CausalCopyPattern> = [
    { Label: 'lever', Pattern: /\blevers?\b/i },
    { Label: 'what drives', Pattern: /\bwhat drives\b/i },
    { Label: 'drives the outcome', Pattern: /\bdrives? the outcome\b/i },
    { Label: "what's driving", Pattern: /\bwhat(?:'|’)?s driving\b/i },
    { Label: 'explains about', Pattern: /\bexplains about\b/i },
    { Label: 'decision drivers', Pattern: /\bdecision drivers\b/i },
    { Label: 'influential', Pattern: /\binfluential\b/i },
    { Label: 'honest holdout evaluation', Pattern: /\bhonest holdout evaluation\b/i },
  ];

  /** The labels of every forbidden phrase found in `text`, in list order; empty when the text is clean. */
  public static FindPhrases(text: string): string[] {
    return CausalCopy.Patterns.filter((p) => p.Pattern.test(text)).map((p) => p.Label);
  }
}
```

Append to `Core/src/index.ts`:

```ts
export * from './importance-display';
export * from './causal-copy';
```

- [ ] Step 4: Re-run Step 2's command → `5 passed`; `pnpm run build; echo "exit=$?"` → `exit=0`.

#### Task C4.2: Core + Dashboards — driver direction, the At-Risk list and the badge component

**Files:** Modify `packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts`,
`packages/Angular/Explorer/dashboards/src/PredictiveStudio/at-risk.view-models.ts` ·
Create `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-row-drivers.component.ts`,
`ps-row-drivers.component.css` · Modify `components/ps-predictions-grid.component.ts`, `.html`, `.css`,
`predictive-studio-score-history.service.ts` · Modify `resources/ps-predictions-resource.component.ts` · Modify `packages/AI/PredictiveStudio/TruthSuite/src/harness/containment-probe.ts` and two call sites in
`packages/AI/PredictiveStudio/TruthSuite/gates/containment.gates.test.ts` (both M5.10; §5.8, D2-44) ·
Test: Modify `packages/Angular/Explorer/dashboards/src/__tests__/at-risk.test.ts`,
Create `components/ps-row-drivers.component.dom.test.ts`

**Interfaces:** Produces in `Core/src/at-risk-rules.ts`: `AtRiskRules.DriverRaisesRisk(contribution: number, invertedRisk: boolean): boolean`,
`type DriverBadge = 'Increases Risk' | 'Lowers Risk'`, `AtRiskRules.DriverBadgeText(raisesRisk: boolean): DriverBadge`,
`AtRiskRules.ParseRowDrivers(raw: unknown, invertedRisk: boolean)` (required — no compatibility default, program D-042, ruling
SR-5: a call site that drops it is a compile error), `LoadScoreHistoryParams.InvertedRisk: boolean` (required; the
predictions grid passes the polarity it renders with, and the score-history service passes it to `AtRiskRules.ParseRowDrivers`),
`AtRiskRules.BuildAtRiskOptions(payloads: ReadonlyArray<string | null | undefined>, targetVariable: string | null | undefined, outcomeConfig?: OutcomeConfig): ParseAtRiskOptions`,
`AT_RISK_LIST_MIN_RISK_PCT = 40`, `AtRiskRules.SelectAtRiskListMembers(rows: ReadonlyArray<AtRiskRow>, limit: number): AtRiskRow[]`;
the standalone L1 widget `<ps-row-drivers [Drivers]="…">` (`PSRowDriversComponent`, no router, design tokens only).

- [ ] Step 1: Write the failing tests. Append to `src/__tests__/at-risk.test.ts` (extend its import from
  `'@memberjunction/predictive-studio-core'` with `AtRiskRules, AT_RISK_LIST_MIN_RISK_PCT,
  type AtRiskRow`):

```ts
describe('driver direction follows the displayed risk (W1 → S9.4, F-UI-3)', () => {
  it('a positive contribution to P(renew) lowers risk', () => {
    expect(AtRiskRules.DriverRaisesRisk(1.135756, true)).toBe(false);
    expect(AtRiskRules.DriverBadgeText(AtRiskRules.DriverRaisesRisk(1.135756, true))).toBe('Lowers Risk');
  });
  it('a positive contribution to P(lapse) raises risk', () => {
    expect(AtRiskRules.DriverRaisesRisk(0.42, false)).toBe(true);
    expect(AtRiskRules.DriverBadgeText(true)).toBe('Increases Risk');
  });
  it('AtRiskRules.ParseAtRiskRows signs drivers relative to the inverted risk', () => {
    const rows = AtRiskRules.ParseAtRiskRows(
      [{ recordId: 'm1', ResultPayload: JSON.stringify({ score: 0.91, class: '1', drivers: [{ feature: 'AutoRenew', value: 1.135756 }, { feature: 'Plan=Basic', value: -0.301 }] }) }],
      { InvertedRisk: true },
    );
    expect(rows[0].drivers?.map((d) => [d.label, d.up])).toEqual([['Auto Renew', false], ['Plan = Basic', true]]);
  });
});

describe('the At-Risk list is the highest-risk rows (W1 → S9.5, F-UI-4)', () => {
  // W1-shaped payloads: target "Renewed", classes "0"/"1", score = P("1") = P(renew).
  const truth: Record<string, number> = { a: 0.95, b: 0.9, c: 0.85, d: 0.6, e: 0.4, f: 0.3, g: 0.2 };
  const scores: Record<string, number> = { a: 0.96, b: 0.92, c: 0.88, d: 0.62, e: 0.41, f: 0.33, g: 0.18 };
  const details = Object.keys(scores).map((id) => ({ recordId: id, ResultPayload: JSON.stringify({ score: scores[id], class: scores[id] >= 0.5 ? '1' : '0' }) }));

  it('AtRiskRules.BuildAtRiskOptions inverts a P(renew) model', () => {
    expect(AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), 'Renewed').InvertedRisk).toBe(true);
    expect(AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), 'IsSLABreached').InvertedRisk).toBe(false);
  });

  it('selects the highest-risk rows, at or above the minimum risk, up to the limit', () => {
    const rows = AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), 'Renewed'));
    const list = AtRiskRules.SelectAtRiskListMembers(rows, 3);
    expect(list.map((r) => r.recordId)).toEqual(['g', 'f', 'e']);
    expect(list.every((r) => r.riskPct >= AT_RISK_LIST_MIN_RISK_PCT)).toBe(true);
    const mean = (ids: string[]): number => ids.reduce((s, id) => s + truth[id], 0) / ids.length;
    expect(mean(list.map((r) => r.recordId))).toBeLessThan(mean(Object.keys(truth)));
  });

  it('never pads the list with low-risk rows', () => {
    const rows: AtRiskRow[] = [10, 20, 39].map((riskPct, i) => ({ recordId: `r${i}`, label: null, score: 1 - riskPct / 100, riskPct, class: null, band: 'low', drivers: null }));
    expect(AtRiskRules.SelectAtRiskListMembers(rows, 200)).toEqual([]);
  });
});
```

Create `components/ps-row-drivers.component.dom.test.ts`:

```ts
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { AtRiskRules } from '@memberjunction/predictive-studio-core';
import { PSRowDriversComponent } from './ps-row-drivers.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const render = (inputs: Pick<PSRowDriversComponent, 'Drivers'>) => renderComponentFixture(PSRowDriversComponent, { inputs });

describe('PSRowDriversComponent (DOM) — W1 → S9.4', () => {
  it('renders "Lowers Risk" for AutoRenew on a P(renew) model', () => {
    const drivers = AtRiskRules.ParseRowDrivers([{ feature: 'AutoRenew', value: 1.135756 }], true) || [];
    const fixture = render({ Drivers: drivers });
    expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Lowers Risk');
    expect(query(fixture, '.ps-badge.green')).not.toBeNull();
  });

  it('renders "Increases Risk" for a contribution that raises the adverse score', () => {
    const drivers = AtRiskRules.ParseRowDrivers([{ feature: 'DaysLate', value: 0.7 }], false) || [];
    const fixture = render({ Drivers: drivers });
    expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Increases Risk');
  });

  it('shows the empty message when no per-row breakdown exists', () => {
    const fixture = render({ Drivers: [] });
    expect(query(fixture, '[data-testid="ps-row-drivers-empty"]')).not.toBeNull();
    expect(queryAll(fixture, '[data-testid="ps-row-driver-badge"]')).toHaveLength(0);
  });
});
```

- [ ] Step 2: Run them; expected failure.

```bash
cd $MJ/packages/Angular/Explorer/dashboards
pnpm vitest run src/__tests__/at-risk.test.ts src/PredictiveStudio/components/ps-row-drivers.component.dom.test.ts
```

Expected: the at-risk file fails on the missing exports (`AtRiskRules.DriverRaisesRisk is not a function` …) and the DOM file
cannot resolve `./ps-row-drivers.component`.

- [ ] Step 3: Implement. In `packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts` (moved from `at-risk.view-models.ts` in M5.10 per D2-44):

```ts
/** The badge a person sees for a driver. */
export type DriverBadge = 'Increases Risk' | 'Lowers Risk';

/** Rows below this displayed risk never go on an "At-Risk" list. */
export const AT_RISK_LIST_MIN_RISK_PCT = 40;

/** The At-Risk rules the drawer, the resource, the gate probe and the tests share. */
export class AtRiskRules {
  /**
   * Whether a signed per-row contribution raises the risk the screen shows. Contributions are on the model's own score
   * (`value > 0` pushed the score up). When that score is the probability of the good outcome (`invertedRisk`, e.g.
   * P(renew)), pushing it up LOWERS risk.
   */
  public static DriverRaisesRisk(contribution: number, invertedRisk: boolean): boolean {
    return invertedRisk ? contribution < 0 : contribution > 0;
  }

  /** The one place the badge text is decided (the drawer, the gate probe and tests all call it). */
  public static DriverBadgeText(raisesRisk: boolean): DriverBadge {
    return raisesRisk ? 'Increases Risk' : 'Lowers Risk';
  }

  /**
   * The At-Risk options for a model's scored rows: the same polarity rule the grid uses (`ResolveRenewalPolarity`), so the
   * resource's list, the export and the grid agree on what "risk" is.
   */
  public static BuildAtRiskOptions(
    payloads: ReadonlyArray<string | null | undefined>,
    targetVariable: string | null | undefined,
    outcomeConfig?: OutcomeConfig,
  ): ParseAtRiskOptions {
    const polarity = AtRiskRules.ResolveRenewalPolarity([...payloads], targetVariable);
    return { InvertedRisk: polarity.IsRenewalModel && !polarity.ScoreIsLapseRisk, OutcomeConfig: outcomeConfig };
  }

  /** The members of an "At-Risk" list: highest displayed risk first, at least {@link AT_RISK_LIST_MIN_RISK_PCT}, at most `limit`. */
  public static SelectAtRiskListMembers(rows: ReadonlyArray<AtRiskRow>, limit: number): AtRiskRow[] {
    return [...rows]
      .sort((a, b) => b.riskPct - a.riskPct)
      .filter((r) => r.riskPct >= AT_RISK_LIST_MIN_RISK_PCT)
      .slice(0, limit);
  }
}
```

In `AtRiskRules` (`Core/src/at-risk-rules.ts`), change the `ParseRowDrivers`
signature to `public static ParseRowDrivers(raw: unknown, invertedRisk: boolean): RowDriver[] | null` and its
push to `out.push({ label: AtRiskRules.HumanizeFeatureName(feature), value, up: AtRiskRules.DriverRaisesRisk(value, invertedRisk) });`
(no default: every caller passes the polarity — `AtRiskRules.ParseAtRiskRows` below, and `predictive-studio-score-history.service.ts:125`,
which passes the new required `LoadScoreHistoryParams.InvertedRisk` that `ps-predictions-grid.component.ts` fills with the
polarity it renders the selected row with; delete any remaining deprecated `parseRowDrivers` alias, program D-042);
update the `RowDriver.up` doc to "Whether this pushed
the displayed risk UP"; in `AtRiskRules.ParseAtRiskRows` change `drivers: AtRiskRules.ParseRowDrivers(p.drivers),` to
`drivers: AtRiskRules.ParseRowDrivers(p.drivers, isInverted),` (the `AtRiskRules` class above holds `BuildAtRiskOptions` and
`SelectAtRiskListMembers` too).

Also rewrite the module header line "…into plain-language "what's driving this" drivers." as "…into the features the
model weighted most (shown only for coefficient models — see `ImportanceDisplay.GlobalDriversShowable`)." and the `TopGlobalDrivers`
doc phrase "so a business user sees "what's driving this", not raw weights" as "so a business user sees feature names,
not raw weights".

Create `components/ps-row-drivers.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AtRiskRules, type DriverBadge, type RowDriver } from '@memberjunction/predictive-studio-core';

/**
 * L1 widget: one scored row's signed drivers with their risk badge. The badge text comes from
 * {@link AtRiskRules.DriverBadgeText}, so the drawer, the truth-suite probe and the tests share one rule (gate W1 → S9.4).
 */
@Component({
  standalone: true,
  selector: 'ps-row-drivers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../predictive-studio.shared.css', './ps-row-drivers.component.css'],
  template: `
    @if (!Drivers || Drivers.length === 0) {
      <div class="ps-small ps-muted" data-testid="ps-row-drivers-empty">No per-row breakdown was recorded for this row.</div>
    } @else {
      <div class="pg-detail-drivers-list" data-testid="ps-row-drivers">
        @for (d of Drivers; track d.label) {
          <div class="pg-detail-driver-item">
            <div class="pg-detail-driver-label" data-testid="ps-row-driver-label">
              <i class="fa-solid" [class.fa-arrow-up]="d.up" [class.fa-arrow-down]="!d.up"
                 [style.color]="d.up ? 'var(--mj-status-error)' : 'var(--mj-status-success)'"></i>
              {{ d.label }}
            </div>
            <span class="ps-badge" [class.red]="d.up" [class.green]="!d.up" data-testid="ps-row-driver-badge">{{ Badge(d) }}</span>
          </div>
        }
      </div>
    }
  `,
})
export class PSRowDriversComponent {
  /** The row's drivers, already signed relative to the displayed risk (`AtRiskRules.ParseRowDrivers(raw, invertedRisk)`). */
  @Input() Drivers: readonly RowDriver[] | null | undefined = [];

  /** Badge text for one driver. */
  public Badge(d: RowDriver): DriverBadge {
    return AtRiskRules.DriverBadgeText(d.up);
  }
}
```

Move the `.pg-detail-drivers-list`, `.pg-detail-driver-item` and `.pg-detail-driver-label` rules (grid css
`:656-680`) unchanged into `ps-row-drivers.component.css` and delete them from `ps-predictions-grid.component.css`.
In the grid component add `PSRowDriversComponent` to `imports`; in the grid template replace the block from
`@if (!selectedRow.drivers || selectedRow.drivers.length === 0) {` to its closing `}` (`:357-372`) with
`<ps-row-drivers [Drivers]="selectedRow.drivers"></ps-row-drivers>` and the section title text
`Key Decision Drivers (Explainability)` with `Factors behind this score (associations, not causes)`.

In `ps-predictions-resource.component.ts` (add `AtRiskRules` and
`resolveOutcomeConfig` to the `@memberjunction/predictive-studio-core` import):

```ts
        if (res.Success && this.Selected?.modelId === c.modelId) {
          const details = (res.Results || []).map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload }));
          const options = AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), model?.TargetVariable, resolveOutcomeConfig(model || undefined));
          this.AtRiskRows = AtRiskRules.ParseAtRiskRows(details, options);
          await this.resolveAtRiskLabels(model);
        }
```

in `SendToList` replace `const members = this.AtRiskRows.filter((r) => r.band !== 'low').slice(0, 200);` with
`const members = AtRiskRules.SelectAtRiskListMembers(this.AtRiskRows, 200);`, and in `ExportList` change the header
`'Record,Likelihood %,Predicted'` to `'Record,Risk %,Predicted'`.

Update `TopDriverBadges` and `AtRiskListRecordIDs` in `packages/AI/PredictiveStudio/TruthSuite/src/harness/containment-probe.ts`
(M5.10; C4 owns these methods and their two call sites in `gates/containment.gates.test.ts`, §5.8, D2-44) so they call
the shared functions in `@memberjunction/predictive-studio-core` instead of replicating the three template/resource lines:

```ts
  /** The badge each row shows for its top per-record driver, for rows whose top driver has `label`. */
  public static TopDriverBadges(details: RunDetailLike[], label: string, targetVariable: string): DriverBadge[] {
    const badges: DriverBadge[] = [];
    for (const row of ContainmentProbe.resourceRows(details, targetVariable)) {
      const top = row.drivers?.[0];
      if (top && top.label === label) badges.push(AtRiskRules.DriverBadgeText(top.up));
    }
    return badges;
  }

  /** The record ids "Send to a list" puts on the At-Risk list. */
  public static AtRiskListRecordIDs(details: RunDetailLike[], targetVariable: string): string[] {
    return AtRiskRules.SelectAtRiskListMembers(ContainmentProbe.resourceRows(details, targetVariable), 200).map((r) => r.recordId);
  }

  /** The rows the Predictions resource builds for a model's scored details (same options as `loadAtRisk`). */
  private static resourceRows(details: RunDetailLike[], targetVariable: string): AtRiskRow[] {
    return AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), targetVariable));
  }
```

In `gates/containment.gates.test.ts` pass the pipeline's target variable (`'Renewed'`):
`ContainmentProbe.TopDriverBadges(details, 'Auto Renew', 'Renewed')` and
`ContainmentProbe.AtRiskListRecordIDs(details, 'Renewed')`. These are the only lines C4 changes in that file; the gate
logic (`TruthGate.Define`, thresholds, result writing) is untouched.

- [ ] Step 4: Build `@memberjunction/predictive-studio-core` first (`pnpm --filter @memberjunction/predictive-studio-core run build`), then re-run Step 2's command → `0 failed` (6 new at-risk tests, 3 DOM tests). Then
  `pnpm test` in dashboards → `0 failed`; `pnpm run build; echo "exit=$?"` → `exit=0`; `cd $MJ && npm run check:ui`
  → passes (only token colours in the new css).

#### Task C4.3: Hide global driver lists built from split or impurity importance

**Files:** Modify `packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts` ·
Modify `packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts` ·
Modify `packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels/ml-model-view-models.ts`,
`ps-model-detail.component.ts`, `ps-model-detail.component.html` ·
Modify `packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions/model-prediction.logic.ts`,
`model-prediction.panel.ts` ·
Test: Modify `packages/AI/PredictiveStudio/Engine/src/agent/__tests__/pipeline-builder-agent.test.ts`,
`packages/Angular/Explorer/core-entity-forms/src/__tests__/ml-model-view-models.test.ts`,
`packages/Angular/Explorer/core-entity-forms/src/__tests__/model-prediction.logic.test.ts`

**Interfaces:** Consumes `ImportanceDisplay.GlobalDriversShowable`, `ImportanceDisplay.HiddenNote` (C4.1). Produces
`ModelImportanceView.DisplayedFeatureImportance(algorithm: string | null | undefined, raw: string | null | undefined, topN?: number): PSFeatureBar[]`
(ml-model-view-models), `PredictionDrivers.DriversForModel(algorithm: string | null | undefined, featureImportanceJson: string | null): PredictionDriver[]`
(model-prediction.logic), and `GenerateMarkdownReport` printing `ImportanceDisplay.HiddenNote` when `features` is empty.

- [ ] Step 1: Write the failing tests.

```ts
// ml-model-view-models.test.ts — add ModelImportanceView to the import
describe('ModelImportanceView.DisplayedFeatureImportance', () => {
  const raw = JSON.stringify({ AutoRenew: 1.13, IncomeK: 0.01, Noise1: 0.002 });
  it('shows coefficient importance for logistic regression', () => {
    expect(ModelImportanceView.DisplayedFeatureImportance('Logistic Regression', raw).map((b) => b.name)).toEqual(['AutoRenew', 'IncomeK', 'Noise1']);
  });
  it('hides split / impurity importance', () => {
    expect(ModelImportanceView.DisplayedFeatureImportance('Random Forest', raw)).toEqual([]);
    expect(ModelImportanceView.DisplayedFeatureImportance('LightGBM', raw)).toEqual([]);
  });
});
```

```ts
// model-prediction.logic.test.ts — add PredictionDrivers to the import
describe('PredictionDrivers.DriversForModel', () => {
  const json = JSON.stringify({ tenure_years: 0.8, nondues_lines_y: 1.7 });
  it('returns drivers for coefficient models only', () => {
    expect(PredictionDrivers.DriversForModel('Logistic Regression', json).length).toBeGreaterThan(0);
    expect(PredictionDrivers.DriversForModel('XGBoost', json)).toEqual([]);
  });
});
```

```ts
// pipeline-builder-agent.test.ts — add GenerateMarkdownReport to the import, and CausalCopy from core
describe('GenerateMarkdownReport — copy (W1 → S9.3)', () => {
  const report = (features: Array<{ feature: string; importance: number }>) =>
    GenerateMarkdownReport('Renewal', 'Predict renewal', 'Renewed', 'AUC', 0.72, 'Good', 'Right about 8 out of 10 times.', true, features, []);
  it('prints the hidden-list note instead of inventing a ranking', () => {
    const md = report([]);
    expect(md).toContain('split or impurity counts');
    expect(md).not.toMatch(/Features analyzed from source entity/);
  });
  it('contains no causal phrase and no canned "honest holdout" sentence', () => {
    expect(CausalCopy.FindPhrases(report([{ feature: 'AutoRenew', importance: 0.6 }]))).toEqual([]);
  });
});
```

- [ ] Step 2: Run each package's file:
  `cd $MJ/packages/Angular/Explorer/core-entity-forms && pnpm vitest run src/__tests__/ml-model-view-models.test.ts src/__tests__/model-prediction.logic.test.ts`
  and `cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm vitest run src/agent/__tests__/pipeline-builder-agent.test.ts`
  → the new tests fail (`ModelImportanceView is not defined`, `PredictionDrivers is not defined`; the report
  has "Features analyzed from source entity", "Influential" and "honest holdout evaluation").

- [ ] Step 3: Implement.

`ml-model-view-models.ts` (add `import { ImportanceDisplay } from '@memberjunction/predictive-studio-core';`):

```ts
/** The importance a model view may show. */
export class ModelImportanceView {
  /** The importance bars a person may see: coefficient models only (split / impurity counts are hidden, C4 / F-SC-11). */
  public static DisplayedFeatureImportance(algorithm: string | null | undefined, raw: string | null | undefined, topN: number = 6): PSFeatureBar[] {
    return ImportanceDisplay.GlobalDriversShowable(algorithm) ? ParseFeatureImportance(raw, topN) : [];
  }
}
```

`ps-model-detail.component.ts`: import `ModelImportanceView` and `ImportanceDisplay`
(`@memberjunction/predictive-studio-core`) and add (the existing `Importance` getter stays: the leakage callout reads
it):

```ts
  /** Bars of the last (algorithm, importance JSON) pair; the template reads `DisplayedImportance` every change-detection pass. */
  private displayedImportanceCache: { key: string; bars: PSFeatureBar[] } | null = null;

  /**
   * The importance bars shown in the Feature Importance card (empty for split / impurity importance). Cached on the
   * algorithm and importance JSON, so the parse runs once per model and again whenever either value changes
   * (coding standards §7: getters Angular bindings hit).
   */
  public get DisplayedImportance(): PSFeatureBar[] {
    if (!this.Model) return [];
    const key = `${this.Model.Algorithm}\u0000${this.Model.FeatureImportance}`;
    if (this.displayedImportanceCache?.key !== key) {
      const bars = ModelImportanceView.DisplayedFeatureImportance(this.Model.Algorithm, this.Model.FeatureImportance, 6).map((b) => ({ ...b, name: HumanizeFeatureName(b.name) }));
      this.displayedImportanceCache = { key, bars };
    }
    return this.displayedImportanceCache.bars;
  }

  /** True when the model has importance data that is hidden because of its kind. */
  public get ImportanceHidden(): boolean {
    return this.Importance.length > 0 && this.DisplayedImportance.length === 0;
  }

  /** The note shown in place of hidden importance. */
  public readonly ImportanceHiddenNote = ImportanceDisplay.HiddenNote;
```

In `ps-model-detail.component.html`, in card "4. Feature Importance", change `@if (importance.length > 0) {` and
`@for (f of importance; track f.name)` to use `DisplayedImportance`, and replace the `@else` body with:

```html
          @if (ImportanceHidden) {
            <div class="ps-small ps-muted" data-testid="ps-importance-hidden">{{ ImportanceHiddenNote }}</div>
          } @else {
            <div class="ps-small ps-muted">No feature-importance data was recorded for this model.</div>
          }
```

(card "5. Leakage Sign-Off Gate" keeps `@if (importance.length > 0)`: the leakage check still uses the raw shares).

`model-prediction.logic.ts` (add `ImportanceDisplay` to its existing `@memberjunction/predictive-studio-core` import):

```ts
/** The global drivers a prediction card may show. */
export class PredictionDrivers {
  /** Global drivers for a model's card: coefficient models only (split / impurity counts are hidden, C4 / F-SC-11). */
  public static DriversForModel(algorithm: string | null | undefined, featureImportanceJson: string | null): PredictionDriver[] {
    return ImportanceDisplay.GlobalDriversShowable(algorithm) ? ParseDrivers(featureImportanceJson) : [];
  }
}
```

and in `model-prediction.panel.ts` replace `Drivers: ParseDrivers(model.FeatureImportance),` with
`Drivers: PredictionDrivers.DriversForModel(model.Algorithm, model.FeatureImportance),` (import `PredictionDrivers`).

`ps-predictions-resource.component.ts`: `this.Drivers = ImportanceDisplay.GlobalDriversShowable(model?.Algorithm) ? TopGlobalDrivers(model?.FeatureImportance || null, 3) : [];`
(import `ImportanceDisplay` from core) and in the template replace
`<i class="fa-solid fa-lightbulb"></i> <strong>What's driving this:</strong>` with
`<i class="fa-solid fa-lightbulb"></i> <strong>Weighted most by this model:</strong>`; change the `Drivers` doc comment
to "The features the model weighted most for the open prediction (coefficient models only)." Also change the doc
comment `/** Plain-language "what's driving this" drivers for the selection (bounded). */` in
`predictive-studio-agent-context.ts:122` to `/** The features the model weighted most for the selection (coefficient models only; bounded). */`.

`pipeline-builder-agent.ts` (import `ImportanceDisplay` from core): in
`executeAgentInternal` replace the block from `let featureBars = ParseFeatureImportance(result.model?.FeatureImportance);`
through `featureBars.sort((a, b) => b.importance - a.importance);` with

```ts
      const winnerAlgorithm = (result.leaderboard || []).find((r) => r.isWinner)?.algorithm || payload.ProposedExperiments?.[0]?.AlgorithmName || null;
      const featureBars = ImportanceDisplay.GlobalDriversShowable(winnerAlgorithm)
        ? ParseFeatureImportance(result.model?.FeatureImportance).sort((a, b) => b.importance - a.importance)
        : [];
```

(the invented `CandidateFeatures` list is deleted) and in `GenerateMarkdownReport` replace the `topFeatures` line and
the two trailing sections with:

```ts
  const topFeatures = features.length > 0
    ? features.slice(0, 8).map((f) => `- **${f.feature}**: ${(f.importance * 100).toFixed(1)}% of the model's weight`).join('\n')
    : `- ${ImportanceDisplay.HiddenNote}`;
```

```ts
## Features the model weighted most (associations, not causes)
${topFeatures}

## How this was measured
- The score comes from the rows held back from training; the winner was picked on those same rows, so the score is optimistic.
- Registered in the Predictive Studio Models catalog; the Trust Grade line above says whether it was published.
```

- [ ] Step 4: Re-run Step 2's commands → `0 failed`. Build core-entity-forms, dashboards and Engine
  (`pnpm run build; echo "exit=$?"` in each → `exit=0`).

#### Task C4.4: Causal copy removed from the UI, the trust copy and the story prompt; scan test

**Files:** Modify `packages/AI/PredictiveStudio/Core/src/trust.ts` (regression one-liner) ·
Modify `metadata/prompts/templates/model-development-agent/model-development-agent.template.md` (section 4) ·
Test: Modify `packages/AI/PredictiveStudio/Core/src/__tests__/trust.test.ts`,
Create `packages/AI/PredictiveStudio/Engine/src/__tests__/causal-copy-scan.test.ts`

**Interfaces:** Consumes `CausalCopy.FindPhrases` (C4.1). The scan covers every user-facing PS string source: Core
`trust.ts`; Engine `agent/pipeline-builder-agent.ts`; dashboards `src/PredictiveStudio/**/*.{ts,html}`;
core-entity-forms `custom/MLModels/**` and `panels/model-predictions/**`; the artifacts viewer
`ml-experiment-results-viewer.component.{ts,html}`; the four Model Development Agent prompt templates. Test files are
excluded.

- [ ] Step 1: Write the failing tests. In `trust.test.ts` append:

```ts
  it('words the regression headline as an association, never as a cause (F-UI-1)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ r2: 0.31 }), ProblemType: 'regression' });
    expect(v.oneLiner).toBe('Accounts for about 31% of the variation in the outcome — an association, not a cause.');
  });
```

Create `Engine/src/__tests__/causal-copy-scan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CausalCopy } from '@memberjunction/predictive-studio-core';

/** Gate W1 → S9.3, static half: no PS UI string, report template or story prompt uses causal or "lever" language. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const SCAN_FILES = [
  'packages/AI/PredictiveStudio/Core/src/trust.ts',
  'packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder-agent.ts',
  'packages/Angular/Generic/artifacts/src/lib/components/plugins/ml-experiment-results-viewer.component.ts',
  'packages/Angular/Generic/artifacts/src/lib/components/plugins/ml-experiment-results-viewer.component.html',
];
const SCAN_DIRS = [
  'packages/Angular/Explorer/dashboards/src/PredictiveStudio',
  'packages/Angular/Explorer/core-entity-forms/src/lib/custom/MLModels',
  'packages/Angular/Explorer/core-entity-forms/src/lib/panels/model-predictions',
  'metadata/prompts/templates/model-development-agent',
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...filesUnder(full));
    } else if (/\.(ts|html|md)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('causal copy scan (W1 → S9.3, static half)', () => {
  const files = [...SCAN_FILES.map((f) => path.join(repoRoot, f)), ...SCAN_DIRS.flatMap((d) => filesUnder(path.join(repoRoot, d)))];

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('finds 0 causal or "lever" phrases', () => {
    const hits = files.flatMap((f) => CausalCopy.FindPhrases(readFileSync(f, 'utf8')).map((label) => `${path.relative(repoRoot, f)}: ${label}`));
    expect(hits).toEqual([]);
  });
});
```

- [ ] Step 2: Run: `cd $MJ/packages/AI/PredictiveStudio/Core && pnpm vitest run src/__tests__/trust.test.ts` → 1 failed;
  `cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm vitest run src/__tests__/causal-copy-scan.test.ts` → 1 failed,
  listing `Core/src/trust.ts: what drives`, `…: drives the outcome`, `…: explains about` plus any file C4.2/C4.3 did not
  yet clean (after C4.2/C4.3 only `trust.ts` and the prompt template remain).

- [ ] Step 3: Implement. In `trust.ts` `buildOneLiner`, replace
  ``: `Explains about ${Math.round(clamp01(metrics.R2) * 100)}% of what drives the outcome.`;`` with

```ts
        : `Accounts for about ${Math.round(clamp01(metrics.R2) * 100)}% of the variation in the outcome — an association, not a cause.`;
```

In the template, section "### 4. Report", replace the first bullet with:

```markdown
- When the session finishes, author a clear summary: what won, how good it is (with the metric explained, and that it
  was measured on rows the model did not train on but the winner was picked on), which features the model weighted
  most, and what it cost. Describe every feature as *associated with* the outcome — never as something that makes the
  outcome happen or that the user can pull to change it. If the results show no feature weights, say they are hidden
  for this kind of model; do not list features from the plan instead.
```

and leave "### 5." and the rest unchanged.

- [ ] Step 4: Re-run both Step 2 commands → `0 failed`. `pnpm mj sync push --dir=metadata/prompts --ci` → exit 0;
  `sq "SELECT COUNT(*) FROM __mj.TemplateContent WHERE TemplateText LIKE '%never as something that makes the outcome happen%'"`
  → `1`; `sq "SELECT COUNT(*) FROM __mj.TemplateContent WHERE TemplateText LIKE '%which features mattered most%'"` → `0`.

#### Task C4.5: Runtime verification and gates `W1 → S9.4`, `W1 → S9.5`, `W1 → S9.3`

**Files:** Modify `packages/AI/PredictiveStudio/TruthSuite/src/gates/causal-copy.ts` (M5.9) ·
Test: Modify `packages/AI/PredictiveStudio/TruthSuite/src/gates/__tests__/causal-copy.test.ts`

**Interfaces:** Consumes the M5.7 runner (RV-0 `gate`/`outcome`); the G0.4/G0.5 bodies in `gates/containment.gates.test.ts` (M5.10, call sites updated in
C4.2) and `ContainmentProbe.TopDriverBadges`/`AtRiskListRecordIDs`; the G0.6 body (M5.9, unchanged), which scans the
dashboards' PredictiveStudio sources, Core `src/`, and `ContainmentProbe.StoryPromptFiles(MJ_ROOT)` (the Model Development Agent prompt
templates), and generates 10 stories through `ContainmentProbe.GenerateModelStory` → `TruthHarness.GenerateStory` (M5.6, §9 D2-24) with
`Requires: ["live-model"]` in the `weekly` lane; `CausalCopy.FindPhrases` / `CausalCopy.Patterns` (C4.1).

- [ ] Step 1: One phrase list (§9 D2-25). M5.9 shipped the same eight patterns locally so G0.6 could measure before
  C4; now the truth suite takes them from Core, and the scan skips the file that defines them (its labels are the
  phrases). Append to `causal-copy.test.ts`:

```ts
import { CausalCopy } from '@memberjunction/predictive-studio-core';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('causal copy scan — one list (C4.5)', () => {
  it('uses exactly the Core list', () => {
    expect(CausalCopyScan.Patterns.map((re) => re.source)).toEqual(CausalCopy.Patterns.map((p) => p.Pattern.source));
  });
  it('skips the file that defines the list', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'causal-'));
    const list = path.join(dir, 'causal-copy.ts');
    writeFileSync(list, "export const L = ['what drives', 'lever'];\n");
    const ui = path.join(dir, 'panel.ts');
    writeFileSync(ui, "const t = 'Pull these levers';\n");
    expect(CausalCopyScan.Scan([list, ui])).toEqual([`${ui}:1: Pull these levers`]);
  });
});
```

  (`CausalCopyScan` is already imported at the top of the file, M5.9.)
  `pnpm --filter @memberjunction/predictive-studio-truth-suite exec vitest run src/gates/__tests__/causal-copy.test.ts`
  → `skips the file that defines the list` fails (the list file is reported). Then change `causal-copy.ts`: import
  `path` from `node:path` and `CausalCopy` from `@memberjunction/predictive-studio-core`, replace the literal list with

```ts
  // The phrase list is Core's: one list for the product's own scan test and this gate.
  public static readonly Patterns: readonly RegExp[] = CausalCopy.Patterns.map((p) => p.Pattern);

  /** The file that defines the list; its labels are the forbidden phrases themselves. */
  private static readonly listFile = 'causal-copy.ts';
```

  keep `UserFacingText` unchanged, and make `Scan` start its loop with
  `if (path.basename(file) === CausalCopyScan.listFile) continue;`. Re-run → `0 failed`; `pnpm --filter
  @memberjunction/predictive-studio-truth-suite run build` → `exit=0`.
- [ ] Step 2: Build Core, Engine, dashboards, core-entity-forms (`pnpm run build; echo "exit=$?"` in each → `exit=0`);
  run RV-0.
- [ ] Step 3: Gates:

```bash
gate pr "W1 → S9.4"
outcome G0.4     # → xpass {"autoRenewTopDriverRows":488,"lowersRisk":488}   (M6.3 baseline: lowersRisk 0)
gate pr "W1 → S9.5"
outcome G0.5     # → xpass with listMeanTrueP < populationMeanTrueP           (M6.3 baseline: listMeanTrueP ≈ 0.967)
# G0.6 needs a live model (§9 D2-33). The Model Development Agent's prompts run on Gemini 3.8 Flash (driver GeminiLLM),
# and the env file copied from $MJ/.env carries its key:
grep -c '^AI_VENDOR_API_KEY__GeminiLLM=' "$MJ/.env.MJ_PS_PR2_<agent>"    # → 1: measure here
TRUTH_LIVE_MODEL=1 gate weekly "W1 → S9.3"
outcome G0.6     # → xpass {"filesScanned":<n>,"causalHits":0,"firstHit":null,"storiesGenerated":10,"causalStories":0}
# → 0: measure in CI instead (the weekly lane supplies the key from GEMINI_API_KEY, M6.1) and record the run id in §11:
#   gh workflow run ps-truth-suite.yml --ref ps/pr-2-truth-suite-containment -f mode=weekly && gh run watch
```

- [ ] Step 4: UI check, automated (§9 D2-34; the only UI step in PR 2; run it before C5, which grades the W1
  logistic model Poor under the default majority-baseline rule and blocks its card, §9 risk R-b). Two tiers run the
  same assertions; the tier is chosen by a command's output, never by a person.
  **Files:** Create `packages/AI/PredictiveStudio/TruthSuite/scripts/ui-fixture.mts` (+ `"truth:ui-fixture": "tsx
  scripts/ui-fixture.mts"` in the TruthSuite `package.json`), `e2e/specs/ps-containment.spec.ts`,
  `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-row-drivers.truth.dom.test.ts`.

  (a) The fixture — two Published, scored W1 models made through the product operations (the promote is the
  product's promote operation, the call the Studio's promote button makes):

```ts
/**
 * UI fixture: two W1-signal s42 models the UI check opens — a coefficient model (logistic regression)
 * and a split-importance model — each promoted Draft → Validated → Published through the product's promote operation
 * and scored through the record process, so the Predictions catalog lists them with predictions. Writes
 * $TRUTH_RESULTS_DIR/artifacts/ui-fixture.json and prints its path. `pnpm run truth:ui-fixture`.
 */
import { RunFixtures } from '../src/harness/run-fixtures';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from '../src/harness/w-world';
import type { AlgorithmKey, LoadedDataset, PipelineSpec, TruthHarness } from '../src/harness/types';

/** Split / impurity importance models, tried in this order; the first that publishes is the fixture's tree model. */
const TREE_ALGORITHMS: ReadonlyArray<AlgorithmKey> = ['lightgbm', 'xgboost', 'random_forest'];

interface UIFixtureModel { algorithm: AlgorithmKey; pipelineName: string; modelId: string; grade: string; canAct: boolean }

/** A Published, record-process-scored model, or the reason it could not be made. */
async function publishedScoredModel(h: TruthHarness, w1: LoadedDataset, algorithm: AlgorithmKey): Promise<UIFixtureModel | string> {
  const pipelineName = `PSTruth: UI W1 ${algorithm} ${h.RunID}`;
  const spec: PipelineSpec = {
    Name: pipelineName, Dataset: w1, Target: 'Renewed', ProblemType: 'classification', Features: [...W_WORLD_FEATURES], Algorithm: algorithm,
    AsOf: { Mode: 'none' }, Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 }, DenyFields: [...W_WORLD_DENY_FIELDS],
  };
  const trained = await h.Train(await h.CreatePipeline(spec), { MaxRows: 1000000 });
  if (!trained.ModelID) return `${algorithm}: training failed: ${trained.ErrorMessage || 'no message'}`;
  for (const target of ['Validated', 'Published'] as const) {
    const promoted = await h.Promote(trained.ModelID, target, `truth suite UI fixture: ${target}`);
    if (!promoted.Promoted) return `${algorithm}: promote to ${target} refused (status ${promoted.Status})`;
  }
  const run = await h.ScoreViaRecordProcess(trained.ModelID, w1, "Region = 'NA' AND [Year] = 2024");
  if (run.Status !== 'Completed') return `${algorithm}: record-process scoring ended ${run.Status}`;
  const m = await h.ReadModel(trained.ModelID);
  return { algorithm, pipelineName, modelId: trained.ModelID, grade: m.Trust.grade, canAct: m.Trust.canAct };
}

async function main(): Promise<void> {
  const h = await RunFixtures.GetRunHarness();
  const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
  const coefficient = await publishedScoredModel(h, w1, 'logistic_regression');
  if (typeof coefficient === 'string') throw new Error(coefficient);
  const treeRefusals: string[] = [];
  let tree: UIFixtureModel | null = null;
  for (const algorithm of TREE_ALGORITHMS) {
    const attempt = await publishedScoredModel(h, w1, algorithm);
    if (typeof attempt !== 'string') { tree = attempt; break; }
    treeRefusals.push(attempt);
  }
  if (!tree) throw new Error(`no split-importance model could be published: ${treeRefusals.join('; ')}`);
  console.log(await h.WriteArtifact('ui-fixture', { coefficient, tree, treeRefusals }));
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
}
```

  (b) The browser tier — `e2e/specs/ps-containment.spec.ts`, on MJ's Playwright harness (`e2e/playwright.config.ts`,
  the signed-in persistent profile of `e2e/fixtures.ts`). Card titles are pipeline names
  (`PredictiveStudioEngine.ModelDisplayName`), the grid's search filters on driver labels and each row's "Key Factors"
  cell shows its top driver first as a `.ps-why-chip` whose `title` is the label (`ps-predictions-grid.component.ts`),
  and Escape closes the drawer (`mj-slide-panel`):

```ts
/**
 * Predictive Studio containment — browser checks against a running Explorer.
 * Data: the truth suite's UI fixture (`pnpm run truth:ui-fixture`), whose JSON path is PS_UI_FIXTURE.
 * Prerequisites as e2e/README.md (Explorer + MJAPI running, a profile primed by e2e/overlay/prime-auth.mjs).
 */
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { SafeJSONParse } from '@memberjunction/global';
import { test, expect } from '../fixtures';

// The JSON scripts/ui-fixture.mts writes (TruthSuite). Restated here: e2e/ does not depend on the private TruthSuite.
interface UIFixtureModel { algorithm: string; pipelineName: string; modelId: string; grade: string; canAct: boolean }
interface UIFixture { coefficient: UIFixtureModel; tree: UIFixtureModel; treeRefusals: string[] }

/** How many Auto Renew top-driver rows the badge check opens. */
const ROWS_TO_CHECK = 5;

function loadFixture(): UIFixture | null {
  const file = process.env.PS_UI_FIXTURE;
  return file ? SafeJSONParse<UIFixture>(readFileSync(file, 'utf8')) : null;
}

const FIXTURE = loadFixture();

function fixture(): UIFixture {
  if (!FIXTURE) throw new Error('PS_UI_FIXTURE is not set');
  return FIXTURE;
}

async function openCatalog(page: Page): Promise<void> {
  await page.goto('/app/predictive-studio/Predictions', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ps-predictions-grid')).toBeVisible({ timeout: 60_000 });
}

function card(page: Page, pipelineName: string): Locator {
  return page.getByTestId('ps-prediction-card').filter({ hasText: pipelineName });
}

test.describe('Predictive Studio containment — drivers, global drivers, At-Risk list', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(FIXTURE === null, 'PS_UI_FIXTURE is not set (the UI fixture step sets it)');

  test('coefficient model: "Weighted most by this model:", Auto Renew rows read Lowers Risk, list ≤ 200', async ({ page }) => {
    await openCatalog(page);
    const coefficientCard = card(page, fixture().coefficient.pipelineName);
    await expect(coefficientCard).toHaveCount(1);
    await coefficientCard.getByTestId('ps-open-prediction').click();
    await expect(page.getByTestId('ps-drivers')).toContainText('Weighted most by this model:');
    await expect(page.getByTestId('ps-drivers')).not.toContainText("What's driving this");

    const grid = page.getByTestId('ps-atrisk-list');
    await grid.locator('.pg-search-input').fill('Auto Renew');
    const rows = grid.locator('.ag-center-cols-container .ag-row');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    let checked = 0;
    const rendered = await rows.count();
    for (let i = 0; i < rendered && checked < ROWS_TO_CHECK; i++) {
      const row = rows.nth(i);
      if ((await row.locator('.ps-why-chip').first().getAttribute('title')) !== 'Auto Renew') continue;
      await row.click();
      await expect(page.getByTestId('ps-row-driver-label').first()).toContainText('Auto Renew');
      await expect(page.getByTestId('ps-row-driver-badge').first()).toHaveText('Lowers Risk');
      await expect(page.getByTestId('ps-row-driver-badge').first()).toHaveClass(/\bgreen\b/);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('ps-row-drivers')).toHaveCount(0);
      checked += 1;
    }
    expect(checked, 'Auto Renew top-driver rows checked').toBeGreaterThan(0);

    await page.getByTestId('ps-act-list').click();
    await expect(page.getByTestId('ps-list-result')).toBeVisible({ timeout: 60_000 });
  });

  test('split-importance model: no global driver line', async ({ page }) => {
    await openCatalog(page);
    const treeCard = card(page, fixture().tree.pipelineName);
    await expect(treeCard).toHaveCount(1);
    if ((await treeCard.getByTestId('ps-open-prediction').count()) === 0) {
      // Not openable (trust not cleared): the card itself must not carry a driver list either.
      await expect(treeCard.getByTestId('ps-improve-prediction')).toBeVisible();
      test.info().annotations.push({ type: 'tree-card-blocked', description: fixture().tree.grade });
      return;
    }
    await treeCard.getByTestId('ps-open-prediction').click();
    await expect(page.getByTestId('ps-workspace-body')).toBeVisible();
    await expect(page.getByTestId('ps-drivers')).toHaveCount(0);
  });
});
```

  (c) The component tier — `ps-row-drivers.truth.dom.test.ts` renders the real `PSRowDriversComponent` for every
  Auto Renew top-driver row of the real W1 s42 scores (written to `$TRUTH_RESULTS_DIR/artifacts/w1-s42-recordprocess.json` by `W1 → S9.4` in `containment.gates.test.ts`) and checks the list cut; it returns early
  without `TRUTH_RESULTS_DIR`, so the package's normal `pnpm test` is unaffected:

```ts
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { SafeJSONParse } from '@memberjunction/global';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { AtRiskRules, type RunDetailLike } from '@memberjunction/predictive-studio-core';
import { PSRowDriversComponent } from './ps-row-drivers.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

interface Artifact { targetVariable: string; details: Array<{ recordId: string; resultPayload: string | null }> }

const FILE = process.env.TRUTH_RESULTS_DIR ? path.join(process.env.TRUTH_RESULTS_DIR, 'artifacts', 'w1-s42-recordprocess.json') : null;
const ARTIFACT: Artifact | null = FILE && existsSync(FILE) ? SafeJSONParse<Artifact>(readFileSync(FILE, 'utf8')) : null;

function rows() {
  const details: RunDetailLike[] = (ARTIFACT?.details || []).map((d) => ({ recordId: d.recordId, ResultPayload: d.resultPayload }));
  return AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), ARTIFACT?.targetVariable));
}

describe.skipIf(ARTIFACT === null)('component tier on the real W1 s42 scores', () => {
  it('every Auto Renew top-driver row renders "Lowers Risk" in green', () => {
    const autoRenew = rows().filter((r) => r.drivers?.[0]?.label === 'Auto Renew');
    expect(autoRenew.length).toBeGreaterThan(0);
    for (const r of autoRenew) {
      const fixture = renderComponentFixture(PSRowDriversComponent, { inputs: { Drivers: r.drivers || [] } });
      expect(text(fixture, '[data-testid="ps-row-driver-label"]')).toContain('Auto Renew');
      expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Lowers Risk');
      expect(query(fixture, '[data-testid="ps-row-driver-badge"].green')).not.toBeNull();
      fixture.destroy();
    }
  });

  it('"Send to a list" takes between 1 and 200 members', () => {
    const members = AtRiskRules.SelectAtRiskListMembers(rows(), 200);
    expect(members.length).toBeGreaterThan(0);
    expect(members.length).toBeLessThanOrEqual(200);
  });
});
```

  (d) Run (RV-0 up; Explorer started as §2.5):

```bash
gate pr "W1 → S9.4"                                   # its run directory receives the M5.10 artifact
export TRUTH_RESULTS_DIR=$(ls -td $TS/results/*/ | head -1)
ls $TRUTH_RESULTS_DIR/artifacts/w1-s42-recordprocess.json                     # → the path
(cd $TS && TRUTH_RESULTS_DIR=$TRUTH_RESULTS_DIR pnpm run truth:ui-fixture)    # → …/artifacts/ui-fixture.json
# component tier — always runs:
(cd $MJ/packages/Angular/Explorer/dashboards && TRUTH_RESULTS_DIR=$TRUTH_RESULTS_DIR pnpm vitest run src/PredictiveStudio/components/ps-row-drivers.truth.dom.test.ts)   # → 2 passed
# browser tier — chosen by the sign-in result:
cd $MJ
if [ ! -f packages/MJAPI/.env ]; then TIER="component only: packages/MJAPI/.env absent (prime-auth.mjs reads it)"
else
  AUTH=$(PW_PROFILE_DIR=$MJ/.playwright-cli/profile-pr2 MJ_EXPLORER_URL=http://localhost:4221 node e2e/overlay/prime-auth.mjs 2>&1)
  case "$AUTH" in
    *LOGIN_OK*) TIER=browser ;;
    *MISSING_CREDS*) TIER="component only: no HEADLESS_AUTH0_TEST_UID/_PWD (or MJ_TEST_USER/_PWD) for prime-auth.mjs" ;;
    *) TIER="component only: sign-in did not complete ($(printf '%s' "$AUTH" | tail -1))" ;;
  esac
fi
echo "C4.5 UI tier: $TIER"
if [ "$TIER" = browser ]; then
  PW_BASE_URL=http://localhost:4221 PW_USER_DATA_DIR=$MJ/.playwright-cli/profile-pr2 \
  PS_UI_FIXTURE=$TRUTH_RESULTS_DIR/artifacts/ui-fixture.json \
    npx playwright test --config e2e/playwright.config.ts e2e/specs/ps-containment.spec.ts   # → 2 passed
  sq "SELECT COUNT(*) FROM __mj.ListDetail ld JOIN __mj.List l ON l.ID = ld.ListID WHERE l.Name LIKE 'At-Risk: %' AND l.__mj_CreatedAt >= DATEADD(minute,-30,GETUTCDATE())"   # → > 0 and ≤ 200
fi
```

  Record the `C4.5 UI tier:` line, both tiers' counts and the list count in §11. A failing assertion in either tier
  is a C4 defect: fix the product code and re-run Step 4. `.playwright-cli/` is git-ignored (never committed).
- [ ] Step 5: Mutation checks (§6 shared notes):

| Guard | Mutation | Must go red |
|---|---|---|
| driver direction follows the displayed risk | `AtRiskRules.DriverRaisesRisk` returns `contribution > 0` | `a positive contribution to P(renew) lowers risk`, `AtRiskRules.ParseAtRiskRows signs drivers relative to the inverted risk`, the DOM test `renders "Lowers Risk" …` |
| At-Risk polarity | `AtRiskRules.BuildAtRiskOptions` returns `InvertedRisk: false` | `AtRiskRules.BuildAtRiskOptions inverts a P(renew) model`, `selects the highest-risk rows …` |
| list never padded | delete the `riskPct >= AT_RISK_LIST_MIN_RISK_PCT` filter | `never pads the list with low-risk rows` |
| list ranked by risk | delete the `.sort(…)` | `selects the highest-risk rows …` |
| coefficient-only global lists | `ImportanceDisplay.GlobalDriversShowable` returns `true` | `hides split / impurity importance …`, `ModelImportanceView.DisplayedFeatureImportance … hides split / impurity importance`, `PredictionDrivers.DriversForModel … coefficient models only` |
| one phrase list, no causal copy | drop one entry of `CausalCopy.Patterns` | `finds the phrases the assessment flagged`; restore, then revert the `trust.ts` one-liner → `causal copy scan … finds 0 causal …` |
| the list file is skipped | delete the `listFile` skip in `CausalCopyScan.Scan` | `skips the file that defines the list` |
| `DisplayedImportance` cache key | key on the model only (not the JSON) | not exposed by a unit test (the component has no test that edits a model in place) — record it as unverified by mutation |

  **Release notes and remediation (conventions §5a):** on deploy every renewal-type model's per-member badges flip
  (a factor that raises P(renew) now reads "Lowers Risk"); "Send to a list" and "Share / export" now take the
  highest-risk rows, and the export's header reads `Risk %` instead of `Likelihood %` (a script that parses the CSV by
  header must follow); tree-model cards and reports no longer show a global driver list. The fix prevents new wrong
  lists and does not heal existing ones: `MJ: Lists` named `At-Risk: …` created before the deploy hold the members
  most likely to renew — list them with
  `SELECT ID, Name, __mj_CreatedAt FROM __mj.List WHERE Name LIKE 'At-Risk: %' AND __mj_CreatedAt < '<deploy time>'`
  and re-create them from the Predictions screen. Both go to §10.

**Exit tests:**
- Core `pnpm test` → +6 (3 importance-display, 2 causal-copy, 1 trust), `0 failed`.
- Engine `pnpm test` → +4 (2 report, 2 scan), `0 failed`.
- dashboards `pnpm test` → +9 (6 at-risk node tests, 3 DOM tests), `0 failed`, +2 skipped (the C4.5 component tier
  without `TRUTH_RESULTS_DIR`); with it (Step 4) → `2 passed`.
- core-entity-forms `pnpm test` → +3, `0 failed`.
- Builds `exit=0` (Core, Engine, dashboards, core-entity-forms); `npm run check:ui` passes.
- TruthSuite `pnpm test` → +2 (causal-copy), `0 failed`; `pnpm run build` → `exit=0` (`scripts/ui-fixture.mts`).
- UI check (Step 4): component tier `2 passed`; browser tier `2 passed` and the list count in (0, 200] when the
  `C4.5 UI tier:` line reads `browser`; the line recorded in §11 either way.
- Truth-suite runner: G0.4 `xpass`, G0.5 `xpass`, G0.6 `xpass` (measured locally with the GeminiLLM key, or by the
  weekly CI lane whose run id is recorded in §11, Step 3).

**Checkpoint commit:** `fix(ps): PR 2 C4 — drivers and At-Risk follow the displayed risk; biased importance hidden; no causal copy`

### C5 — Training containment  ·  parallel-safe: no  ·  depends on: C4 (shares `Core/src/trust.ts` and the Predictions resource), M6 (G0.8–G0.12 bodies M5.9, containment probe M5.6)

**Outcome:** (a) a pipeline whose as-of setting cannot change any feature is refused before training, and so is the
Train operation's `asOf` input; (b) `kfold` and `holdout` report out-of-sample validation metrics (and training with
fewer than 4 rows is refused instead of scoring in-sample), and the trust verdict accepts validation metrics only when
they are recorded as out-of-sample; (c) seeded single-threaded training of logistic regression, XGBoost and LightGBM
stays bit-for-bit repeatable; (d) a pipeline that declares a time index but was not tested on later periods is graded
Poor with `canAct` false and the stored reason "not evaluated as a forecast", and a classifier at or below the
always-majority rate, or predicting one class, is graded Poor under the pipeline's majority-baseline rule
(`ValidationStrategy.MajorityBaselineRule`, default `enforce`; `warn` keeps the finding and its numbers on the verdict
but leaves grade and `canAct` to the AUC bands; the rule in force is recorded in the model's `Lineage.evaluation`).
Gates `W4 → S2.1` (G0.8), `W2 → S5.3` (G0.9),
`W1 → S5.4` (G0.10), `T4 → S6.5` (G0.11), `W7 → S4.2` (G0.12) report `xpass`.

**What `next` does today (verified at `c92d4a47f9`):**
- As-of: `TrainingEngine.assemble` (`training-engine.ts:233-248`) passes `asOf` but **no `datedSources`**; `select`
  columns are read as they stand today (`feature-assembly-executor.ts:737-738`), and as-of filtering only applies to
  dated-source aggregates (`:754-765`). So `column`/`offset` change nothing. The Train operation drops `input.asOf`
  (`train-model.operation.ts:85-103`; input type `metadata/remote-operations/types/predictive-studio-train-model.input.ts:24`).
  The Goal Analyst's prompt encourages `column`/`offset` (template `:21`, example output `AsOfStrategy: { Mode: 'offset', OffsetDays: 90 }`).
- Validation: the sidecar's `_fit_and_score` (`Sidecar/src/python/app/main.py:340-369`) fits and scores on the same
  rows for `kfold`, `holdout` and fewer than 4 rows (`:366-369`); `k` is never read. Trust: `bestMetrics`
  (`Core/src/trust.ts:126-129`) falls back to those in-sample `Metrics` when `HoldoutMetrics` is empty.
- Determinism: `algorithms.py` defaults `n_jobs: -1` for XGBoost/LightGBM (`:71`, `:82`); the truth-suite runner boots
  its sidecar single-threaded (M5.7, §9 D2-09) and G0.10 passes today (P11).
- Trust grade: fixed bands on one point estimate (`trust.ts:99-110`); accuracy graded on the AUC bands with no
  base-rate check (`:195-198`); `canAct = grade !== 'Poor'` (`:215`). No time-index concept exists anywhere in PS.

**Findings closed or contained:**

| ID | Sev | Defect (evidence) | Fix / containment here | Test |
|---|---|---|---|---|
| F-PIT-3 (owner PR 3) | S1 | The as-of setting changes nothing: the trained model is byte-identical across none/column/offset (Exp 41: five stored columns and the artifact SHA-256 `f10c7843…` identical; AUC 0.8094745558774848 in column and offset). | Refused before training (pipeline and Train-input variants). | C5.1 unit; G0.8 |
| F-PIT-7 (owner PR 3; contained) | S2 | `asOf` on the Train operation is accepted and silently dropped (Exp 43). | A non-`none` `asOf` input is refused. | C5.1 unit; G0.8 |
| F-SC-1 | S1 | `kfold` and `holdout` report in-sample metrics and `k` has no effect (600-row noise target: RF/XGB/LGBM AUC 1.000 under both; true holdout AUC 0.5707 / 0.5039 / 0.5676; k=3 and k=10 identical). | Pooled out-of-fold scoring for `kfold` (K honoured, stratified), `holdout` routed through the out-of-sample split, < 4 rows refused. | C5.2 pytest; G0.9 |
| F-TR-3 (ships with F-SC-1) | S1 | In-sample `Metrics` accepted as full evidence when `HoldoutMetrics` is absent (`{Metrics:'{"auc":1.0,"accuracy":1.0}'}` → Excellent, canAct). | Validation metrics count only when the model's evaluation record says out-of-sample. | C5.5 unit |
| F-TR-1 (owner PR 3) | S0 | A zero-skill majority-class model on 95/5 data is graded "Excellent" (`{accuracy:0.95,f1:0}` → Excellent, canAct, "Right about 10 out of 10 times"). | Accuracy alone is ungraded without the majority rate; at or below it → Poor (an accuracy-only verdict under either `MajorityBaselineRule`; with an AUC, under the default `enforce`, D2-C5d). | C5.5 unit; G0.12 |
| F-TR-2 (owner PR 3) | S1 | No sample-size floor: one correct holdout row (n=1) is graded "Excellent". | Contained by the same rule (an n=1 holdout's majority rate is 1.0, and accuracy alone is ungraded). | C5.5 unit |
| F-TR-4 (owner PR 3) | S1 | A holdout AUC of 0.61 on ~40 rows is graded Fair and cleared to act (W7 s42: lgbm AUC 0.6241 [0.341, 0.842], accuracy 0.905 vs always-lapse 0.921, **Published**, Fair). | Contained where accuracy ≤ majority rate (W7 s42–s43); the interval rule is PR 3's D5/D11. | G0.12 |
| F-SCN-1 (owner PR 3) | S0 | On a monthly series PS grades interpolation, not forecasting (T4: lightgbm Excellent 5 / Good 7 of 12 origins, mean holdout R² 0.7775, `canAct` true; MASE vs naive +0.2429 [0.0772, 0.4289]). | A declared time index (`ValidationStrategy.TimeIndexColumn`) withholds the verdict: Poor, `canAct` false, reason stored. | C5.4/C5.5 unit; G0.11 |
| F-DOC-4, F-DOC-35 (S1, guide) | S1 | Guide promises point-in-time assembly "never leaking the future"; says validation has "overfitting detection" and offers k-fold/holdout that report in-sample metrics. | §4.3 and the §5.1 validation sentence corrected (C5.7). | quote check |

**Decisions taken here (recorded in §9):**
- *D2-C5a — the time index is declared as `ValidationStrategy.TimeIndexColumn` (optional string in the existing JSON
  column; no migration).* PR 3's Temporal Spec (C1) replaces it and migrates the value. Rejected: a new column
  (schema change for a field PR 3 replaces).
- *D2-C5b — the evaluation record lives in `MLModel.Lineage` under the key `evaluation`* (`EvaluationRecord`: out-of-
  sample flag, time index, forecast flag, withheld reason) and the withheld reason is repeated in the training run's
  `Notes`. Rejected: a new column (D-015 moves gate data to the registered `Delivery` in PR 4).
- *D2-C5c — "majority rate" is measured by the sidecar on the same rows as the metric* (`baseline_accuracy` =
  share of the most common class; `predicted_classes`; plus `n`, `n_positive` for interval checks), stored in
  `Metrics`/`HoldoutMetrics`. A model stored before C5 has no `baseline_accuracy`; its accuracy-only verdict becomes
  "unknown" (gated off) and its AUC verdict is unchanged until retrained.
- *D2-C5d — the majority-baseline rule is a per-pipeline setting, `ValidationStrategy.MajorityBaselineRule:
  'enforce' | 'warn'` (optional; absent = `enforce`), recorded at training time in `Lineage.evaluation.MajorityBaselineRule`
  so the verdict is reproducible from the model alone* (owner decision, 2026-10-12: "should be configurable anyway").
  `enforce` grades a classifier at or below the majority rate, or predicting one class, Poor with `canAct` false;
  `warn` puts the same finding and its numbers on the verdict (`TrustVerdict.majorityBaseline`, `enforced: false`)
  and takes grade and `canAct` from the other rules. An accuracy-only verdict is enforced under either value: without
  an AUC, accuracy against the majority rate is the only evidence, and grading it on the bands would re-open F-TR-1.
  An unknown value is refused before the training run row is written (`InvalidMajorityBaselineRuleError`). Stored in
  the existing `ValidationStrategy` JSON column like `TimeIndexColumn` (D2-C5a; no migration); PR 3's Evaluation
  Protocol replaces both the column and this rule. Rejected: a new column (schema change for a setting PR 3 deletes);
  reading the pipeline at verdict time (the verdict would change when the pipeline is edited after training).
- Consequence (§9 risk R-b): under the default `enforce`, the honest W1-signal logistic model (holdout accuracy
  0.7957 = the holdout renewal rate, Exp 73; holdout AUC 0.723, M5.8) is graded Poor although its AUC alone would grade
  it Good (`AUC_BANDS`: ≥ 0.70). That is the B14 rule as written; a pipeline set to `warn` grades the same model Good
  by AUC with the finding shown. PR 3's three-outcome gate (D11, PR 3 M10) replaces both.

#### Task C5.1: Refuse as-of settings that cannot change any feature

**Files:** Create `packages/AI/PredictiveStudio/Engine/src/training/as-of-refusal.ts` ·
Modify `packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts`, `training/index.ts` ·
Modify `packages/AI/PredictiveStudio/Engine/src/operations/train-model.operation.ts` ·
Modify `metadata/prompts/templates/model-development-agent/goal-analyst.template.md` (`:21`, `:27`),
`metadata/prompts/output/model-development-agent/goal-analyst.example.json` (`:13`) ·
Test: Modify `packages/AI/PredictiveStudio/Engine/src/training/__tests__/training-engine.test.ts`,
`packages/AI/PredictiveStudio/Engine/src/operations/__tests__/train-model.operation.test.ts`

**Interfaces:** Produces `class AsOfSettingHasNoEffectError extends Error` (structured fields `Source`, `Mode`,
`PipelineID`) with the static guard
`AsOfSettingHasNoEffectError.WouldBeIgnored<T extends { Mode: AsOfStrategy['Mode'] }>(asOf: T | null | undefined): asOf is T`
(the rule lives on the class that reports it, coding standards §2; exported through `training/index.ts`). The refusal happens **before** the `MJ: ML Training Runs` row is created, so
the harness sees `ok: false, modelId: null` (`WasRefusedBeforeTraining`, unchanged).

- [ ] Step 1: Write the failing tests. Append to `training-engine.test.ts` (import `AsOfSettingHasNoEffectError` from
  `'../as-of-refusal'`):

```ts
describe('TrainingEngine.trainModel — as-of settings that change nothing are refused (W4 → S2.1, F-PIT-3)', () => {
  const ignored: ReadonlyArray<AsOfStrategy> = [{ Mode: 'column', Column: 'StartDate' }, { Mode: 'offset', OffsetDays: 30 }];
  for (const asOf of ignored) {
    it(`refuses AsOfStrategy.Mode='${asOf.Mode}' before any row is written`, async () => {
      const pipeline = new FakeMLPipeline();
      pipeline.AsOfStrategy = JSON.stringify(asOf);
      const { deps, factory, sidecar } = buildDeps({ pipeline });
      await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toBeInstanceOf(AsOfSettingHasNoEffectError);
      await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toMatchObject({ Source: 'pipeline', Mode: asOf.Mode });
      expect(factory.Runs).toHaveLength(0);
      expect(factory.Models).toHaveLength(0);
      expect(sidecar.LastRequest).toBeNull();
    });
  }

  it("still trains Mode='none'", async () => {
    const { deps } = buildDeps();
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(model.Status).toBe('Draft');
  });
});
```

Append to `train-model.operation.test.ts`:

```ts
describe('PredictiveStudioTrainModelServerOperation — asOf input (W4 → S2.1, F-PIT-7)', () => {
  it('refuses an asOf input that would change nothing, before calling the engine', async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    const result = await new TestableTrainOp(engine).ExecuteServer(
      { pipelineId: 'p1', asOf: { Mode: 'offset', OffsetDays: 30 } },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain("the Train operation's asOf input (Mode='offset') has no effect");
    expect(engine.CallCount).toBe(0);
  });

  it("accepts asOf { Mode: 'none' }", async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    const result = await new TestableTrainOp(engine).ExecuteServer({ pipelineId: 'p1', asOf: { Mode: 'none' } }, new CapturingContext());
    expect(result.Success).toBe(true);
    expect(engine.CallCount).toBe(1);
  });
});
```

- [ ] Step 2: Run:
  `cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm vitest run src/training/__tests__/training-engine.test.ts src/operations/__tests__/train-model.operation.test.ts`
  → the engine test file fails to load (`../as-of-refusal` does not exist yet) and the operation refusal test fails
  (training proceeds: `CallCount` is 1).

- [ ] Step 3: Implement. `training/as-of-refusal.ts`:

```ts
/**
 * @module training/as-of-refusal
 *
 * Containment of F-PIT-3 / F-PIT-7 until dated feature assembly exists. Training reads every feature as it
 * stands today and passes no dated sources to assembly, so an as-of mode other than `none` cannot change the model;
 * a pipeline that claims point-in-time assembly is refused before training instead of training a model identical to
 * `Mode: 'none'`.
 */
import type { AsOfStrategy } from '@memberjunction/predictive-studio-core';

/** Thrown before any training row is written when an as-of setting would be ignored. */
export class AsOfSettingHasNoEffectError extends Error {
  constructor(
    public readonly Source: 'pipeline' | 'train-input',
    public readonly Mode: AsOfStrategy['Mode'],
    public readonly PipelineID: string,
  ) {
    super(
      `Training refused: ${Source === 'pipeline' ? "the pipeline's AsOfStrategy" : "the Train operation's asOf input"} ` +
        `(Mode='${Mode}') has no effect. Training reads every feature as it stands today and ` +
        `uses no dated sources, so the model would be identical to Mode='none' while appearing point-in-time. ` +
        `Set the pipeline's AsOfStrategy to {"Mode":"none"} (pipeline ${PipelineID}).`,
    );
    this.name = 'AsOfSettingHasNoEffectError';
  }

  /** True when an as-of setting asks for point-in-time assembly that training cannot perform today. */
  public static WouldBeIgnored<T extends { Mode: AsOfStrategy['Mode'] }>(asOf: T | null | undefined): asOf is T {
    return asOf !== null && asOf !== undefined && asOf.Mode !== 'none';
  }
}
```

Add `export * from './as-of-refusal';` to `training/index.ts`. In `training-engine.ts` import
`AsOfSettingHasNoEffectError` and, in `trainModel`, between `const resolved = await this.resolvePipeline(input.pipelineId, deps);` and
`const run = await this.createRunRow(resolved, input, deps);`, add:

```ts
    if (AsOfSettingHasNoEffectError.WouldBeIgnored(resolved.asOf)) {
      throw new AsOfSettingHasNoEffectError('pipeline', resolved.asOf.Mode, resolved.pipeline.ID);
    }
```

In `train-model.operation.ts` import `AsOfSettingHasNoEffectError` from `'../training/as-of-refusal'` and, right after
the `pipelineId is required` check, add:

```ts
    if (AsOfSettingHasNoEffectError.WouldBeIgnored(input.asOf)) {
      throw new AsOfSettingHasNoEffectError('train-input', input.asOf.Mode, input.pipelineId);
    }
```

In `goal-analyst.template.md` replace the `AsOfStrategy` bullet (`:21`) with:

```markdown
  - **`AsOfStrategy`** — always `{ "Mode": "none" }` for now. Predictive Studio cannot yet rebuild features as they
    stood at a past decision date, so `column` and `offset` are refused at training. If the outcome can only be known
    *after* the moment you would predict it, say so plainly in your message and list the columns that are written
    after that moment as leakage notes for the Data Scout.
```

and in step 4 (`:27`) replace "and reflect it in `AsOfStrategy`" with "and list it as a leakage concern". In
`goal-analyst.example.json` change `"AsOfStrategy": { "Mode": "offset", "OffsetDays": 90 }` to
`"AsOfStrategy": { "Mode": "none" }`.

- [ ] Step 4: Re-run Step 2's command → `0 failed`; `pnpm run build` → `exit=0`;
  `pnpm mj sync push --dir=metadata/prompts --ci` → exit 0.

#### Task C5.2: `kfold` and `holdout` report out-of-sample metrics; the sidecar reports the majority rate

**Files:** Modify `packages/AI/PredictiveStudio/Sidecar/src/python/app/main.py` (`_fit_and_score`,
`_anti_skew_val_metrics`, new `_fit_fold`, new `_kfold_out_of_fold_metrics`) ·
Modify `packages/AI/PredictiveStudio/Sidecar/src/python/app/metrics.py` (`classification_metrics`) ·
Test: Create `packages/AI/PredictiveStudio/Sidecar/src/python/tests/test_validation_out_of_sample.py`

**Interfaces:** `/train`'s `metrics` (validation) are out-of-sample for every strategy. A `/train` with fewer than 4
training rows, `K` outside `2..rows`, or a class with fewer than `K` rows under `kfold` returns HTTP 400 (raised as
`ValueError`, mapped by the existing handler). `classification_metrics` adds `baseline_accuracy`,
`predicted_classes`, `n` and, for binary problems, `n_positive` (all floats in the same metric map).

- [ ] Step 1: Write the failing tests:

```python
"""G0.9 / F-SC-1 / F-TR-1: validation metrics are out-of-sample for every strategy, K is honoured, and the
classification metrics report the majority rate they must be judged against."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pytest

from app import metrics
from tests.test_train_predict import client


def _noise_request(strategy: str, algorithm: str, k: Optional[int] = None, n: int = 1000) -> Dict[str, Any]:
    rng = np.random.default_rng(100)
    X = rng.normal(size=(n, 6))
    y = rng.integers(0, 2, size=n)
    columns = [f"x{i}" for i in range(6)] + ["label"]
    rows: List[List[Any]] = [[float(v) for v in X[i]] + [int(y[i])] for i in range(n)]
    validation: Dict[str, Any] = {"strategy": strategy, "test_size": 0.2, "random_state": 42}
    if k is not None:
        validation["k"] = k
    return {
        "algorithm": algorithm,
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": validation,
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in columns[:-1]],
        "preprocessing": [{"op": "standardize", "cols": columns[:-1]}],
        "target": "label",
        "data": {"columns": columns, "rows": rows},
    }


@pytest.mark.parametrize("strategy", ["kfold", "holdout"])
@pytest.mark.parametrize("algorithm", ["random_forest", "xgboost", "lightgbm", "logistic_regression"])
def test_validation_metrics_are_out_of_sample_on_noise(strategy: str, algorithm: str) -> None:
    resp = client.post("/train", json=_noise_request(strategy, algorithm, k=5 if strategy == "kfold" else None))
    assert resp.status_code == 200, resp.text
    auc = resp.json()["metrics"]["auc"]
    assert 0.35 <= auc <= 0.65, (strategy, algorithm, auc)


def test_kfold_uses_k() -> None:
    m3 = client.post("/train", json=_noise_request("kfold", "logistic_regression", k=3)).json()["metrics"]
    m10 = client.post("/train", json=_noise_request("kfold", "logistic_regression", k=10)).json()["metrics"]
    assert m3["auc"] != m10["auc"]
    assert m3["n"] == 1000.0 and m10["n"] == 1000.0


def test_kfold_refuses_k_larger_than_a_class() -> None:
    req = _noise_request("kfold", "logistic_regression", k=5, n=40)
    rows = req["data"]["rows"]
    req["data"]["rows"] = [r[:-1] + [0] for r in rows[:37]] + [r[:-1] + [1] for r in rows[37:]]
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "needs at least 5 rows of every class" in resp.text


def test_too_few_rows_are_refused_not_scored_in_sample() -> None:
    req = _noise_request("train_test_split", "logistic_regression", n=3)
    req["data"]["rows"][0][-1] = 0
    req["data"]["rows"][1][-1] = 1
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "at least 4" in resp.text


def test_classification_metrics_report_majority_rate_and_predicted_classes() -> None:
    y_true = np.array([0] * 19 + [1])
    y_pred = np.zeros(20, dtype=int)
    y_score = np.column_stack([np.full(20, 0.9), np.full(20, 0.1)])
    m = metrics.classification_metrics(y_true, y_pred, y_score)
    assert m["baseline_accuracy"] == pytest.approx(0.95)
    assert m["predicted_classes"] == 1.0
    assert m["n"] == 20.0
    assert m["n_positive"] == 1.0
```

- [ ] Step 2: Run:
  `cd $MJ/packages/AI/PredictiveStudio/Sidecar && pnpm run test:python -- tests/test_validation_out_of_sample.py`
  → expected failures: the six tree-model out-of-sample cases (AUC 1.000), `test_kfold_uses_k` (identical metrics, no
  `n`), both refusal tests (200) and the metrics test (`KeyError: 'baseline_accuracy'`) — `10 failed`; the two
  logistic cases pass already (in-sample logistic regression on six noise features stays inside 0.35–0.65; the
  assessment measured 0.589 in-sample).

- [ ] Step 3: Implement. In `metrics.py` `classification_metrics`, before `auc = _safe_auc(...)`, add:

```python
    # The rate an always-majority guess achieves on these rows, and how many classes the model actually predicts.
    # The trust verdict grades accuracy only against this baseline (F-TR-1); n / n_positive let judges build intervals.
    _, true_counts = np.unique(y_true, return_counts=True)
    metrics["baseline_accuracy"] = float(true_counts.max() / true_counts.sum())
    metrics["predicted_classes"] = float(len(np.unique(y_pred)))
    metrics["n"] = float(len(y_true))
    if is_binary and len(classes) == 2:
        metrics["n_positive"] = float(np.sum(y_true == classes[1]))
```

In `main.py` add `Callable` to the `typing` import and a module constant `MIN_VALIDATION_ROWS = 4`. Replace the body
of `_fit_and_score` after `def build(): …` with:

```python
    n_dev = X.shape[0]
    if n_dev < MIN_VALIDATION_ROWS:
        raise ValueError(
            f"Only {n_dev} training rows remain after the locked holdout; at least {MIN_VALIDATION_ROWS} are needed to "
            "measure the model on rows it did not train on. Add rows or lower LockedHoldoutFraction."
        )

    if strategy == "kfold":
        val_metrics = _kfold_out_of_fold_metrics(
            req, dev_rows, columns, feature_cols, ops_spec, target_idx, y, is_classification, build, random_state,
        )
    elif strategy in ("train_test_split", "holdout"):
        # `holdout` uses the same out-of-sample split as train_test_split (F-SC-1): it used to score in-sample.
        test_size = req.validation.test_size or 0.2
        idx = np.arange(n_dev)
        stratify = y if is_classification and len(np.unique(y)) > 1 else None
        tr_idx, te_idx = train_test_split(idx, test_size=test_size, random_state=random_state, stratify=stratify)
        val_metrics = _anti_skew_val_metrics(
            req, dev_rows, columns, feature_cols, ops_spec, target_idx,
            tr_idx, te_idx, y, is_classification, encoder, build,
        )
    else:
        raise ValueError(f"Unknown validation strategy '{strategy}'. Use train_test_split, kfold or holdout.")

    # The production estimator is fit on all dev rows (with the frozen, fit-on-all-dev preprocessing).
    final = build()
    final.fit(X, y)
    return val_metrics, final
```

Replace the body of `_anti_skew_val_metrics` (signature unchanged) with:

```python
    est, X_te = _fit_fold(dev_rows, columns, feature_cols, ops_spec, target_idx, tr_idx, te_idx, y_dev, build)
    return _score(est, X_te, y_dev[te_idx], is_classification)
```

and add:

```python
def _fit_fold(
    dev_rows: List[Sequence[Any]],
    columns: List[str],
    feature_cols: List[str],
    ops_spec: List[Dict[str, Any]],
    target_idx: int,
    tr_idx: np.ndarray,
    te_idx: np.ndarray,
    y_dev: np.ndarray,
    build: Callable[[], Any],
) -> Tuple[Any, np.ndarray]:
    """Fit preprocessing and the estimator on the training fold only; return the estimator and the transformed
    held-out fold (preprocessing APPLIED, never re-fit — no held-out leakage into the fitted params)."""
    tr_rows = [list(dev_rows[i]) for i in tr_idx]
    te_rows = [list(dev_rows[i]) for i in te_idx]
    X_tr, _, fold_fitted = preprocessing.fit_transform(columns, tr_rows, ops_spec, feature_cols)
    te_feature_dicts = [{c: r[i] for i, c in enumerate(columns) if i != target_idx} for r in te_rows]
    X_te = preprocessing.transform(te_feature_dicts, fold_fitted, feature_cols)
    est = build()
    est.fit(X_tr, y_dev[tr_idx])
    return est, X_te


def _kfold_out_of_fold_metrics(
    req: TrainRequest,
    dev_rows: List[Sequence[Any]],
    columns: List[str],
    feature_cols: List[str],
    ops_spec: List[Dict[str, Any]],
    target_idx: int,
    y_dev: np.ndarray,
    is_classification: bool,
    build: Callable[[], Any],
    random_state: int,
) -> Dict[str, float]:
    """Pooled out-of-fold metrics for ``kfold``: every dev row is predicted exactly once by a model (and preprocessing)
    fit without it. ``K`` = ``req.validation.k`` (default 5); stratified folds for classification."""
    # Function-local, as every other scikit-learn import in main.py is (lines 126, 204, 340 at c92d4a47f9).
    from sklearn.model_selection import KFold, StratifiedKFold

    n_rows = len(dev_rows)
    k = req.validation.k or 5
    if k < 2 or k > n_rows:
        raise ValueError(f"kfold needs 2 <= K <= {n_rows} (the training rows); got K={k}.")
    idx = np.arange(n_rows)
    if is_classification:
        smallest = int(np.min(np.bincount(y_dev.astype(int))))
        if smallest < k:
            raise ValueError(
                f"kfold with K={k} needs at least {k} rows of every class; the smallest class has {smallest}. "
                "Lower K or use train_test_split."
            )
        splits = StratifiedKFold(n_splits=k, shuffle=True, random_state=random_state).split(idx, y_dev)
    else:
        splits = KFold(n_splits=k, shuffle=True, random_state=random_state).split(idx)

    oof_pred: Optional[np.ndarray] = None
    oof_score: Optional[np.ndarray] = None
    for tr_idx, te_idx in splits:
        est, X_te = _fit_fold(dev_rows, columns, feature_cols, ops_spec, target_idx, tr_idx, te_idx, y_dev, build)
        pred = np.asarray(est.predict(X_te))
        if oof_pred is None:
            oof_pred = np.empty(n_rows, dtype=pred.dtype)
        oof_pred[te_idx] = pred
        if is_classification:
            score = _positive_scores(est, X_te)
            if oof_score is None:
                oof_score = np.empty((n_rows,) + score.shape[1:], dtype=float)
            oof_score[te_idx] = score

    # K >= 2 guarantees at least one fold; an explicit raise (not `assert`, which `python -O` strips) narrows for mypy.
    if oof_pred is None or (is_classification and oof_score is None):
        raise RuntimeError(f"kfold produced no out-of-fold predictions (K={k}, rows={n_rows})")
    if is_classification and oof_score is not None:
        return metrics.classification_metrics(y_dev, oof_pred, oof_score)
    return metrics.regression_metrics(y_dev, oof_pred)
```

Update `_fit_and_score`'s docstring ("kfold / holdout-only / tiny data: … in-sample" no longer applies) and the
comment block above its call in `_run_training` ("Train/validation split (or full-fit fallback for kfold/none)") to
"Out-of-sample validation for every strategy (train/test split, holdout, or pooled K-fold)".

- [ ] Step 4: Re-run Step 2's command → `12 passed`. Then the whole sidecar suite:
  `pnpm run test:python` → `0 failed` (the existing `test_validation_no_leakage.py` tests call
  `_anti_skew_val_metrics` with an unchanged signature).

#### Task C5.3: Keep seeded single-threaded training deterministic

**Files:** Test: Create `packages/AI/PredictiveStudio/Sidecar/src/python/tests/test_determinism.py`

**Interfaces:** none (keep-list for G0.10; the new K-fold path seeds its splitter with `random_state`).

- [ ] Step 1: Write the test:

```python
"""G0.10 keep-list: two single-threaded trainings of logistic regression, XGBoost and LightGBM on the same rows with
the same seed predict within 1e-9, for the default split and for kfold."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from tests.test_train_predict import _predict, _train_request, client


@pytest.mark.parametrize("strategy", ["train_test_split", "kfold"])
@pytest.mark.parametrize("algorithm", ["logistic_regression", "xgboost", "lightgbm"])
def test_single_threaded_training_is_deterministic(algorithm: str, strategy: str) -> None:
    req = _train_request(algorithm, "classification")
    req["validation"]["strategy"] = strategy
    req["validation"]["k"] = 5
    if algorithm != "logistic_regression":
        req["hyperparameters"] = {"n_jobs": 1}
    first = client.post("/train", json=req).json()
    second = client.post("/train", json=req).json()
    assert first["metrics"] == second["metrics"]
    names = [fs["Name"] for fs in req["feature_schema"]]
    rows: List[Dict[str, Any]] = [dict(zip(names, r[: len(names)])) for r in req["data"]["rows"][:50]]
    p1 = _predict(first["artifact_b64"], None, first["fitted_preprocessing"], req["feature_schema"], rows)["predictions"]
    p2 = _predict(second["artifact_b64"], None, second["fitted_preprocessing"], req["feature_schema"], rows)["predictions"]
    assert len(p1) == 50
    assert all(abs(a["score"] - b["score"]) <= 1e-9 for a, b in zip(p1, p2))
```

- [ ] Step 2: `pnpm run test:python -- tests/test_determinism.py` → `6 passed`. (It passes before C5.2 for
  `train_test_split`; it guards the new K-fold path. A failure means a non-seeded random source entered training —
  fix it before continuing.)

#### Task C5.4: The evaluation record, the time-index declaration and the majority-baseline rule

**Files:** Create `packages/AI/PredictiveStudio/Core/src/evaluation-record.ts` ·
Modify `packages/AI/PredictiveStudio/Core/src/pipeline-spec.ts` (`ValidationStrategy.TimeIndexColumn`,
`MajorityBaselineRule` and `ValidationStrategy.MajorityBaselineRule`),
`packages/AI/PredictiveStudio/Core/src/index.ts` ·
Modify `packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts` (`trainModel`, `buildLineage`,
`buildRunNotes`) ·
Test: Create `packages/AI/PredictiveStudio/Core/src/__tests__/evaluation-record.test.ts`;
Modify `packages/AI/PredictiveStudio/Engine/src/training/__tests__/training-engine.test.ts`

**Interfaces:** Produces `ValidationStrategy.TimeIndexColumn?: string`;
`type MajorityBaselineRule = 'enforce' | 'warn'` and `ValidationStrategy.MajorityBaselineRule?: MajorityBaselineRule`
(D2-C5d; in `pipeline-spec.ts`); `class InvalidMajorityBaselineRuleError extends Error` (field `Value`);
`interface EvaluationRecord { ValidationOutOfSample: boolean; TimeIndexColumn: string | null; EvaluatedAsForecast: boolean; WithheldReason: string | null; MajorityBaselineRule: MajorityBaselineRule }`;
and `class EvaluationLineage` with the statics `Key = 'evaluation'`, `NotEvaluatedAsForecast = 'not evaluated as a forecast'`,
`DefaultMajorityBaselineRule: MajorityBaselineRule = 'enforce'`, `MajorityBaselineRules`,
`ParseMajorityBaselineRule(value: string | null | undefined): MajorityBaselineRule` (absent or empty → `'enforce'`;
anything other than the two values throws), `Build(validation: ValidationStrategy): EvaluationRecord` (throws
`InvalidMajorityBaselineRuleError`) and `Read(lineageJson: string | null | undefined): EvaluationRecord | null` (a stored
record without the rule, i.e. any record written before D2-C5d, reads as `'enforce'`). Building and reading the record
are static members of the class that owns it (coding standards §2). Every model trained after C5 carries
`Lineage.evaluation` with the rule that was in force; the training run's `Notes` carry
`Trust withheld — not evaluated as a forecast: …` when the reason is set. `trainModel` builds the record once right
after the C5.1 as-of refusal, so an unknown rule is refused before the `MJ: ML Training Runs` row exists.
The Pipeline Builder's `buildValidation` (`Engine/src/agent/modeling-plan-to-pipeline.ts:147-155`) copies only
`Strategy`, `TestSize`, `K` and `LockedHoldoutFraction`, so agent-built pipelines (G0.2, G0.3, G0.12) always run on
the default `enforce`.

- [ ] Step 1: Write the failing tests.

```ts
// Core/src/__tests__/evaluation-record.test.ts
import { describe, it, expect } from 'vitest';
import { EvaluationLineage, InvalidMajorityBaselineRuleError } from '../evaluation-record';

describe('evaluation record', () => {
  it('records out-of-sample validation and no withheld reason for an ordinary pipeline', () => {
    expect(EvaluationLineage.Build({ Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.1 })).toEqual({
      ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null, MajorityBaselineRule: 'enforce',
    });
  });
  it('withholds the verdict when a time index is declared (not evaluated as a forecast)', () => {
    const record = EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
    expect(record).toEqual({ ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast, MajorityBaselineRule: 'enforce' });
  });
  it('round-trips through the Lineage JSON and tolerates lineage without it', () => {
    const record = EvaluationLineage.Build({ Strategy: 'holdout', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex', MajorityBaselineRule: 'warn' });
    expect(EvaluationLineage.Read(JSON.stringify({ pipelineId: 'p', [EvaluationLineage.Key]: record }))).toEqual(record);
    expect(EvaluationLineage.Read(JSON.stringify({ pipelineId: 'p' }))).toBeNull();
    expect(EvaluationLineage.Read('not json')).toBeNull();
    expect(EvaluationLineage.Read(null)).toBeNull();
  });
  it("records the pipeline's majority-baseline rule, enforce when absent (D2-C5d)", () => {
    expect(EvaluationLineage.DefaultMajorityBaselineRule).toBe('enforce');
    expect(EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' }).MajorityBaselineRule).toBe('warn');
    expect(EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'enforce' }).MajorityBaselineRule).toBe('enforce');
    // a record stored before the rule existed reads as the default
    const legacy = { ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null };
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: legacy }))?.MajorityBaselineRule).toBe('enforce');
  });
  it('refuses an unknown majority-baseline rule instead of ignoring it', () => {
    expect(EvaluationLineage.ParseMajorityBaselineRule(undefined)).toBe('enforce');
    expect(EvaluationLineage.ParseMajorityBaselineRule('')).toBe('enforce');
    expect(EvaluationLineage.ParseMajorityBaselineRule('warn')).toBe('warn');
    expect(() => EvaluationLineage.ParseMajorityBaselineRule('off')).toThrow(InvalidMajorityBaselineRuleError);
    expect(() => EvaluationLineage.ParseMajorityBaselineRule('off')).toThrow("ValidationStrategy.MajorityBaselineRule 'off' is not one of 'enforce', 'warn'");
  });
});
```

Append to `training-engine.test.ts` (import `EvaluationLineage, TrustVerdicts.DeriveTrustVerdict,
InvalidMajorityBaselineRuleError` from `'@memberjunction/predictive-studio-core'`):

```ts
describe('TrainingEngine — evaluation record and the time-index containment (T4 → S6.5, F-SCN-1)', () => {
  it('stores an out-of-sample evaluation record with no withheld reason by default', async () => {
    const { deps } = buildDeps();
    const { model, run } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)).toEqual({ ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null, MajorityBaselineRule: 'enforce' });
    expect(run.Notes).not.toContain('Trust withheld');
  });

  it("records the pipeline's majority-baseline rule in Lineage.evaluation (D2-C5d)", async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' });
    const { deps } = buildDeps({ pipeline });
    const { model } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)?.MajorityBaselineRule).toBe('warn');
  });

  it('refuses an unknown majority-baseline rule before any row is written', async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'off' });
    const { deps, factory, sidecar } = buildDeps({ pipeline });
    await expect(buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps)).rejects.toBeInstanceOf(InvalidMajorityBaselineRuleError);
    expect(factory.Runs).toHaveLength(0);
    expect(factory.Models).toHaveLength(0);
    expect(sidecar.LastRequest).toBeNull();
  });

  it('withholds trust for a pipeline that declares a time index, and stores the reason on the model and the run', async () => {
    const pipeline = new FakeMLPipeline();
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
    const { deps } = buildDeps({ pipeline });
    const { model, run } = await buildEngine().trainModel({ pipelineId: 'pipe-1' }, deps);
    expect(EvaluationLineage.Read(model.Lineage)?.WithheldReason).toBe(EvaluationLineage.NotEvaluatedAsForecast);
    expect(run.Notes).toContain('Trust withheld — not evaluated as a forecast');
    expect(TrustVerdicts.DeriveTrustVerdict(model)).toMatchObject({ grade: 'Poor', canAct: false, withheldReason: EvaluationLineage.NotEvaluatedAsForecast });
  });
});
```

(The last expectation also needs C5.5; run C5.4 and C5.5's Step 3 before C5.4's Step 4.)

- [ ] Step 2: Run `cd $MJ/packages/AI/PredictiveStudio/Core && pnpm vitest run src/__tests__/evaluation-record.test.ts`
  → cannot resolve `../evaluation-record`; the engine tests fail on the missing exports.

- [ ] Step 3: Implement. In `pipeline-spec.ts`, inside `ValidationStrategy` after `LockedHoldoutFraction`:

```ts
  /**
   * Column that orders the rows in time (e.g. `MonthIndex`) when the target is a forecast. Declaring it tells
   * Predictive Studio the model must be tested on later periods than it trained on; until that evaluation exists
   * (a rolling-origin backtest) the trust verdict is withheld with the stored reason "not evaluated as a forecast".
   * To be replaced by the Prediction Unit's Temporal Spec.
   */
  TimeIndexColumn?: string;
  /**
   * How the trust verdict treats a classifier no better than always guessing the most common class (or one that
   * predicts a single class). Absent = `'enforce'`. Recorded in the model's `Lineage.evaluation` at training time.
   * To be replaced by the Evaluation Protocol.
   */
  MajorityBaselineRule?: MajorityBaselineRule;
```

and above `export interface ValidationStrategy`:

```ts
/**
 * The majority-baseline rule of the trust verdict (containment of F-TR-1).
 * - `enforce`: a classifier whose accuracy is at or below the always-majority rate, or that predicts one class, is
 *   graded Poor and cannot be acted on.
 * - `warn`: the verdict records that finding and its numbers but takes grade and `canAct` from the other rules (AUC
 *   bands, unmeasured, withheld). An accuracy-only verdict is enforced either way.
 */
export type MajorityBaselineRule = 'enforce' | 'warn';
```

`Core/src/evaluation-record.ts`:

```ts
/**
 * @module evaluation-record
 *
 * How a model's stored numbers were measured, written by training into `MLModel.Lineage` under `evaluation` and read
 * by the trust verdict. Pure; no dependencies beyond the pipeline spec types.
 */
import type { MajorityBaselineRule, ValidationStrategy } from './pipeline-spec';

export interface EvaluationRecord {
  /** True when `Metrics` were measured on rows the fitted model did not train on (every strategy that writes this record). */
  ValidationOutOfSample: boolean;
  /** The pipeline's declared time index (`ValidationStrategy.TimeIndexColumn`), or null. */
  TimeIndexColumn: string | null;
  /** True only when the model was tested on periods after its training periods (no strategy does yet). */
  EvaluatedAsForecast: boolean;
  /** Why the trust verdict is withheld, or null when it is not. */
  WithheldReason: string | null;
  /** The majority-baseline rule in force when the model was trained (D2-C5d). */
  MajorityBaselineRule: MajorityBaselineRule;
}

/** Thrown before any training row is written when `ValidationStrategy.MajorityBaselineRule` is not a known value. */
export class InvalidMajorityBaselineRuleError extends Error {
  constructor(public readonly Value: string) {
    super(
      `Training refused: ValidationStrategy.MajorityBaselineRule '${Value}' is not one of ` +
        `${EvaluationLineage.MajorityBaselineRules.map((r) => `'${r}'`).join(', ')}. Remove it to use '${EvaluationLineage.DefaultMajorityBaselineRule}'.`,
    );
    this.name = 'InvalidMajorityBaselineRuleError';
  }
}

/** The evaluation record a model carries in `MLModel.Lineage.evaluation`: building it at training, reading it back. */
export class EvaluationLineage {
  /** The `Lineage` key the record is stored under. */
  public static readonly Key = 'evaluation';
  /** The stored reason for a time-indexed model that was not tested on later periods. */
  public static readonly NotEvaluatedAsForecast = 'not evaluated as a forecast';
  /** The rule a pipeline gets when its `ValidationStrategy` does not name one (D2-C5d). */
  public static readonly DefaultMajorityBaselineRule: MajorityBaselineRule = 'enforce';
  /** Every value `MajorityBaselineRule` accepts. */
  public static readonly MajorityBaselineRules: ReadonlyArray<MajorityBaselineRule> = ['enforce', 'warn'];

  /** The rule a pipeline asks for: absent or empty → the default; an unknown value is refused, never ignored. */
  public static ParseMajorityBaselineRule(value: string | null | undefined): MajorityBaselineRule {
    const trimmed = value?.trim() || '';
    if (trimmed.length === 0) return EvaluationLineage.DefaultMajorityBaselineRule;
    if (!EvaluationLineage.isMajorityBaselineRule(trimmed)) throw new InvalidMajorityBaselineRuleError(trimmed);
    return trimmed;
  }

  /** The record training writes for a pipeline's validation strategy. Throws `InvalidMajorityBaselineRuleError`. */
  public static Build(validation: ValidationStrategy): EvaluationRecord {
    const timeIndex = validation.TimeIndexColumn?.trim() || null;
    return {
      ValidationOutOfSample: true,
      TimeIndexColumn: timeIndex,
      EvaluatedAsForecast: false,
      WithheldReason: timeIndex ? EvaluationLineage.NotEvaluatedAsForecast : null,
      MajorityBaselineRule: EvaluationLineage.ParseMajorityBaselineRule(validation.MajorityBaselineRule),
    };
  }

  /** Read the record from a model's `Lineage` JSON; null when absent (models trained before this record existed) or unreadable. */
  public static Read(lineageJson: string | null | undefined): EvaluationRecord | null {
    if (!lineageJson) return null;
    // `unknown` on purpose: stored JSON is untrusted input, narrowed field by field below.
    let parsed: unknown;
    try {
      parsed = JSON.parse(lineageJson);
    } catch {
      return null;
    }
    if (!EvaluationLineage.isRecord(parsed)) return null;
    const raw = parsed[EvaluationLineage.Key];
    if (!EvaluationLineage.isRecord(raw)) return null;
    return {
      ValidationOutOfSample: raw.ValidationOutOfSample === true,
      TimeIndexColumn: typeof raw.TimeIndexColumn === 'string' && raw.TimeIndexColumn.length > 0 ? raw.TimeIndexColumn : null,
      EvaluatedAsForecast: raw.EvaluatedAsForecast === true,
      WithheldReason: typeof raw.WithheldReason === 'string' && raw.WithheldReason.length > 0 ? raw.WithheldReason : null,
      // Stored by training, so it was valid when written; anything else (a record from before D2-C5d) is the default.
      MajorityBaselineRule: raw.MajorityBaselineRule === 'warn' ? 'warn' : EvaluationLineage.DefaultMajorityBaselineRule,
    };
  }

  private static isMajorityBaselineRule(value: string): value is MajorityBaselineRule {
    return (EvaluationLineage.MajorityBaselineRules as ReadonlyArray<string>).includes(value);
  }

  // `Record<string, unknown>` is the boundary type the standards prescribe for untrusted JSON (narrowed by the caller).
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
```

Add `export * from './evaluation-record';` to `Core/src/index.ts` (`pipeline-spec.ts` is already exported there, so
`MajorityBaselineRule` reaches consumers with `ValidationStrategy`). In `training-engine.ts` import
`EvaluationLineage, type EvaluationRecord` from core; in `trainModel`, directly after the
C5.1 as-of refusal (still before `const run = await this.createRunRow(resolved, input, deps);`), add:

```ts
    // Validates the evaluation settings (D2-C5d: an unknown MajorityBaselineRule is refused) before any row is written.
    EvaluationLineage.Build(resolved.validation);
```

In `buildLineage` add
`[EvaluationLineage.Key]: EvaluationLineage.Build(resolved.validation),` to the returned object; change
`run.Notes = this.buildRunNotes(dominance);` to `run.Notes = this.buildRunNotes(dominance, EvaluationLineage.Build(resolved.validation));`
and `buildRunNotes` to:

```ts
  private buildRunNotes(dominance: DominanceResult, evaluation: EvaluationRecord): string {
    const base = dominance.Dominant
      ? `LEAKAGE WARNING: one field ("${dominance.TopFeature}") is doing almost all the predicting ` +
        `(${((dominance.TopShare ?? 0) * 100).toFixed(1)}% of total importance, over the ${(dominance.Threshold * 100).toFixed(0)}% threshold). ` +
        `This often means we are accidentally peeking at the answer. The model is kept in Draft and will NOT be ` +
        `auto-promoted: the promotion gate refuses it unless a promote request records a sign-off with a reason.`
      : 'Training completed. No single-feature dominance detected.';
    if (!evaluation.WithheldReason) {
      return base;
    }
    return (
      `${base} Trust withheld — ${evaluation.WithheldReason}: the pipeline declares '${evaluation.TimeIndexColumn}' as its time index, ` +
      'but the model was scored on rows from its own training period, not on later periods.'
    );
  }
```

  The leakage sentence no longer says a person must confirm: it states the gate's rule (`promote-model.gate.ts:55-64`,
  `signOff` plus a non-empty `reason` from any caller). In `guides/PREDICTIVE_STUDIO_GUIDE.md` §6.4, replace the quoted
  `A human should confirm this is legitimate before we trust this model.` with `The model is kept in Draft until a
  promote request records a sign-off with a reason.` and `until a human signs off with an auditable reason` with
  `until a promote request records a sign-off with an auditable reason`; then
  `grep -c "A human should confirm\|until a human signs off" guides/PREDICTIVE_STUDIO_GUIDE.md packages/AI/PredictiveStudio/Engine/src/training/training-engine.ts`
  → `0` for both files.

- [ ] Step 4: After C5.5 Step 3, run Core `pnpm vitest run src/__tests__/evaluation-record.test.ts` → `5 passed`;
  Engine `pnpm vitest run src/training/__tests__/training-engine.test.ts` → `0 failed`.

#### Task C5.5: Trust containment in the verdict

**Files:** Modify `packages/AI/PredictiveStudio/Core/src/trust.ts` ·
Modify `packages/Angular/Explorer/dashboards/src/PredictiveStudio/resources/ps-predictions-resource.component.ts`
(`Cards` passes `Lineage`) ·
Test: Modify `packages/AI/PredictiveStudio/Core/src/__tests__/trust.test.ts`,
`packages/Angular/Explorer/dashboards/src/__tests__/business-predictions.test.ts`

**Interfaces:** Produces `TrustModelInput.Lineage?: string | null`; `TrustVerdict.withheldReason?: string | null`;
`interface MajorityBaselineFinding { rule: MajorityBaselineRule; enforced: boolean; accuracy: number | null; baselineAccuracy: number | null; predictedClasses: number | null; note: string }`
and `TrustVerdict.majorityBaseline?: MajorityBaselineFinding | null` (null when the classifier beats the majority
rate or the model is a regression; both verdict fields optional, so existing `TrustVerdict` literals in tests stay
valid). Consumes `EvaluationLineage.Read`, `EvaluationLineage.DefaultMajorityBaselineRule` and `EvaluationRecord.MajorityBaselineRule`
(C5.4) and the sidecar's `baseline_accuracy` / `predicted_classes` (C5.2). The rule comes from the model's own
`Lineage` (D2-C5d), never from the pipeline row, so a verdict does not change when the pipeline is edited after
training. Every caller that passes an `MJ: ML Models` entity (Pipeline Builder; harness `ReadModel`, which M5.6 writes
as `TrustVerdicts.DeriveTrustVerdict(model)` over the loaded entity, §9 D2-26) gets the containment without code changes.

- [ ] Step 1: Write the failing tests. In `trust.test.ts` (import `EvaluationLineage` and `type EvaluationRecord`
  from `'../evaluation-record'` and `type MajorityBaselineRule` from `'../pipeline-spec'`) replace the test `'falls back to Accuracy when AUC is absent'` with:

```ts
  it('grades accuracy only against the always-majority rate (F-TR-1)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ Accuracy: 0.82, baseline_accuracy: 0.6, predicted_classes: 2 }), ProblemType: 'classification' });
    expect(v.headlineMetric?.key).toBe('Accuracy');
    expect(v.grade).toBe('Good');
    const bare = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ Accuracy: 0.82 }), ProblemType: 'classification' });
    expect(bare.unknown).toBe(true);
    expect(bare.canAct).toBe(false);
  });
```

and append inside `describe('deriveTrustVerdict', …)`:

```ts
  /** A stored evaluation record; `MajorityBaselineRule` optional because records written before D2-C5d lack it. */
  type StoredEvaluation = Omit<EvaluationRecord, 'MajorityBaselineRule'> & { MajorityBaselineRule?: MajorityBaselineRule };
  const withEvaluation = (evaluation: StoredEvaluation): string => JSON.stringify({ pipelineId: 'p', [EvaluationLineage.Key]: evaluation });

  it('never grades a majority-class model from accuracy alone (F-TR-1: accuracy 0.95, f1 0)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ accuracy: 0.95, f1: 0 }), ProblemType: 'classification' });
    expect(v.canAct).toBe(false);
    expect(v.grade).toBe('Poor');
  });

  it('does not grade a one-row holdout (F-TR-2: accuracy 1, n = 1)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ accuracy: 1 }), ProblemType: 'classification' });
    expect(v.canAct).toBe(false);
  });

  it('ignores in-sample training metrics when no holdout exists (F-TR-3)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ Metrics: JSON.stringify({ auc: 1.0, accuracy: 1.0 }), ProblemType: 'classification' });
    expect(v.unknown).toBe(true);
    expect(v.canAct).toBe(false);
  });

  it('uses validation metrics when the evaluation record says they are out-of-sample', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({
      Metrics: JSON.stringify({ auc: 0.75 }), ProblemType: 'classification',
      Lineage: withEvaluation({ ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null }),
    });
    expect(v.grade).toBe('Good');
    expect(v.canAct).toBe(true);
  });

  it('grades a classifier at or below the majority rate Poor (W7 s42 and s43)', () => {
    const s42 = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.6241, accuracy: 0.905, baseline_accuracy: 0.921, predicted_classes: 2 }), ProblemType: 'classification' });
    const s43 = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.8279, accuracy: 0.921, baseline_accuracy: 0.968, predicted_classes: 2 }), ProblemType: 'classification' });
    for (const v of [s42, s43]) {
      expect(v.grade).toBe('Poor');
      expect(v.canAct).toBe(false);
      expect(v.gateReason).toMatch(/most common outcome/);
      expect(v.majorityBaseline).toMatchObject({ rule: 'enforce', enforced: true });
    }
  });

  it('grades a constant predictor Poor even with a high AUC', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.9, accuracy: 0.95, baseline_accuracy: 0.95, predicted_classes: 1 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Poor');
  });

  it('keeps a classifier that beats the majority rate', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.78, accuracy: 0.85, baseline_accuracy: 0.8, predicted_classes: 2 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Good');
    expect(v.canAct).toBe(true);
    expect(v.majorityBaseline).toBeNull();
  });

  // The W1-signal s42 logistic model (§9 risk R-b): holdout accuracy = the holdout renewal rate, AUC 0.723.
  const w1Logistic = JSON.stringify({ auc: 0.723, accuracy: 0.7957, baseline_accuracy: 0.7957, predicted_classes: 2 });
  const ruleLineage = (rule: MajorityBaselineRule): string =>
    withEvaluation({ ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null, MajorityBaselineRule: rule });

  it('enforce (the default, and when the lineage names it) grades the W1 logistic model Poor (D2-C5d)', () => {
    for (const lineage of [null, ruleLineage('enforce')]) {
      const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: w1Logistic, ProblemType: 'classification', Lineage: lineage });
      expect(v).toMatchObject({ grade: 'Poor', canAct: false });
      expect(v.majorityBaseline).toEqual({
        rule: 'enforce', enforced: true, accuracy: 0.7957, baselineAccuracy: 0.7957, predictedClasses: 2,
        note: 'Right 79.6% of the time; always guessing the most common outcome is right 79.6% of the time.',
      });
    }
  });

  it('warn grades the same model by AUC and keeps the finding visible (D2-C5d)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: w1Logistic, ProblemType: 'classification', Lineage: ruleLineage('warn') });
    expect(v).toMatchObject({ grade: 'Good', canAct: true, gateReason: null, headlineMetric: { key: 'AUC', value: 0.723 } });
    expect(v.majorityBaseline).toMatchObject({ rule: 'warn', enforced: false, accuracy: 0.7957, baselineAccuracy: 0.7957 });
  });

  it('warn never rescues an accuracy-only verdict (F-TR-1 stays contained)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({
      HoldoutMetrics: JSON.stringify({ accuracy: 0.95, baseline_accuracy: 0.95, predicted_classes: 1 }), ProblemType: 'classification',
      Lineage: ruleLineage('warn'),
    });
    expect(v).toMatchObject({ grade: 'Poor', canAct: false });
    expect(v.majorityBaseline).toMatchObject({ rule: 'warn', enforced: true, note: 'Predicts the same outcome for every record.' });
  });

  it('withholds a time-indexed model and returns the stored reason (T4 → S6.5)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({
      HoldoutMetrics: JSON.stringify({ r2: 0.7775 }), ProblemType: 'regression',
      Lineage: withEvaluation({ ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast }),
    });
    expect(v).toMatchObject({ grade: 'Poor', canAct: false, withheldReason: EvaluationLineage.NotEvaluatedAsForecast });
    expect(v.gateReason).toMatch(/later/);
  });
```

In `business-predictions.test.ts` append:

```ts
  it('blocks a card whose model withholds its verdict (time index not evaluated as a forecast)', () => {
    const lineage = JSON.stringify({ evaluation: { ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: 'not evaluated as a forecast' } });
    const c = ToBusinessPredictionCard({ modelId: 'm9', name: 'Monthly volume', HoldoutMetrics: JSON.stringify({ r2: 0.8 }), ProblemType: 'regression', Lineage: lineage });
    expect(c.canOpen).toBe(false);
    expect(c.trust.withheldReason).toBe('not evaluated as a forecast');
  });
```

- [ ] Step 2: Run `cd $MJ/packages/AI/PredictiveStudio/Core && pnpm vitest run src/__tests__/trust.test.ts` →
  `11 failed`: the rewritten accuracy test, six new ones (accuracy-only graded Good/Excellent, n = 1 graded
  Excellent, in-sample graded Excellent, W7 s42/s43 graded Fair/Good, constant predictor Excellent, withheld not
  applied), `keeps a classifier that beats the majority rate` (`majorityBaseline` is `undefined`, not `null`) and the
  three rule tests (W1 logistic graded Good under the default; no `majorityBaseline` under `warn`; accuracy-only
  graded Excellent). `uses validation metrics when…out-of-sample` passes already (today's fallback and bands give the
  same answer).

- [ ] Step 3: Implement in `trust.ts`. Add
  `import { EvaluationLineage, type EvaluationRecord } from './evaluation-record';`
  and `import type { MajorityBaselineRule } from './pipeline-spec';` (still dependency-free: same package). Extend the
  types:

```ts
export interface TrustModelInput {
  Metrics?: string | null;
  HoldoutMetrics?: string | null;
  ProblemType?: string | null;
  /**
   * The model's `Lineage` JSON. Its `evaluation` record says whether `Metrics` were measured out of sample and whether
   * the verdict is withheld (a declared time index not evaluated as a forecast). `MJMLModelEntity` satisfies this.
   */
  Lineage?: string | null;
}
```

add to `TrustVerdict`:

```ts
  /** The stored reason the verdict is withheld (e.g. "not evaluated as a forecast"); null or absent otherwise. */
  withheldReason?: string | null;
  /**
   * Set when a classifier is no better than always guessing the most common class (or predicts one class): the rule
   * in force, whether it capped the grade, and the numbers. Null otherwise. No UI renders it yet;
   * callers that show analyst detail read it here, and the truth-suite harness records it per model.
   */
  majorityBaseline?: MajorityBaselineFinding | null;
```

and, after `TrustVerdict`:

```ts
/** The majority-baseline check's result on one model (decision D2-C5d). */
export interface MajorityBaselineFinding {
  /** The rule recorded in the model's `Lineage.evaluation` (`'enforce'` when the lineage has none). */
  rule: MajorityBaselineRule;
  /** True when the finding graded the model Poor: rule `enforce`, or an accuracy-only verdict under either rule. */
  enforced: boolean;
  /** Holdout (or out-of-sample validation) accuracy; null when not reported. */
  accuracy: number | null;
  /** Accuracy of always guessing the most common class on the same rows (sidecar `baseline_accuracy`). */
  baselineAccuracy: number | null;
  /** How many distinct classes the model predicted on those rows (sidecar `predicted_classes`). */
  predictedClasses: number | null;
  /** One plain sentence with the numbers. */
  note: string;
}
```

extend `TrustMetrics` with `BaselineAccuracy?: number; PredictedClasses?: number;` and `TRUST_METRIC_ALIASES` with
`baseline_accuracy: 'BaselineAccuracy', predicted_classes: 'PredictedClasses',`; replace `bestMetrics` with:

```ts
/**
 * Holdout metrics first. Validation `Metrics` count only when the model's evaluation record says they were measured
 * out of sample (F-TR-3): models trained before this change scored k-fold / holdout in-sample.
 */
function bestMetrics(model: TrustModelInput, evaluation: EvaluationRecord | null): TrustMetrics {
  const holdout = parseTrustMetrics(model.HoldoutMetrics);
  if (Object.keys(holdout).length > 0) return holdout;
  return evaluation?.ValidationOutOfSample === true ? parseTrustMetrics(model.Metrics) : {};
}

/** A classifier right no more often than always guessing the most common class, or one that predicts a single class. */
function noBetterThanMajority(m: TrustMetrics): boolean {
  if (m.PredictedClasses !== undefined && m.PredictedClasses <= 1) return true;
  return m.Accuracy !== undefined && m.BaselineAccuracy !== undefined && m.Accuracy <= m.BaselineAccuracy;
}

/** "79.6%" — a share as a percentage with one decimal. */
function formatShare(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * The majority-baseline finding for a classifier that fails {@link noBetterThanMajority}. Under `warn` it caps the
 * grade only when the headline is accuracy: without an AUC, accuracy against the majority rate is the only evidence.
 */
function majorityFinding(m: TrustMetrics, rule: MajorityBaselineRule, accuracyIsHeadline: boolean): MajorityBaselineFinding {
  const singleClass = m.PredictedClasses !== undefined && m.PredictedClasses <= 1;
  const note =
    !singleClass && m.Accuracy !== undefined && m.BaselineAccuracy !== undefined
      ? `Right ${formatShare(m.Accuracy)} of the time; always guessing the most common outcome is right ${formatShare(m.BaselineAccuracy)} of the time.`
      : 'Predicts the same outcome for every record.';
  return {
    rule,
    enforced: rule === 'enforce' || accuracyIsHeadline,
    // `??` on purpose: an accuracy, baseline or class count of 0 is a legitimate value.
    accuracy: m.Accuracy ?? null,
    baselineAccuracy: m.BaselineAccuracy ?? null,
    predictedClasses: m.PredictedClasses ?? null,
    note,
  };
}

const MAJORITY_ONE_LINER = 'No better than always guessing the most common outcome — not reliable.';
const MAJORITY_GATE_REASON =
  "This prediction is right no more often than always guessing the most common outcome, so it isn't safe to act on yet. An analyst needs to improve it first.";
const NOT_FORECAST_ONE_LINER = 'Not checked as a forecast — not reliable for future periods yet.';
const NOT_FORECAST_GATE_REASON =
  "This prediction looks ahead in time, but it was only checked on periods it learned from, not on later ones, so it isn't safe to act on yet.";

/** A Poor, gated-off verdict that keeps the measured headline (and any majority finding) for the analyst disclosure. */
function cappedVerdict(
  headlineMetric: TrustVerdict['headlineMetric'],
  oneLiner: string,
  gateReason: string,
  withheldReason: string | null,
  majorityBaseline: MajorityBaselineFinding | null,
): TrustVerdict {
  return {
    grade: 'Poor', score01: 0, oneLiner, explanation: GRADE_EXPLANATION.Poor, canAct: false, gateReason, headlineMetric,
    unknown: false, withheldReason, majorityBaseline,
  };
}
```

and in `TrustVerdicts.DeriveTrustVerdict`: compute `const evaluation = EvaluationLineage.Read(model.Lineage);` and
`const metrics = bestMetrics(model, evaluation);`; change the accuracy branch's condition to
`} else if (metrics.Accuracy !== undefined && metrics.BaselineAccuracy !== undefined) {` (comment: "accuracy means nothing without
the always-majority rate (F-TR-1); without it the model is unmeasured"); add `withheldReason: null` and
`majorityBaseline: null` to the unknown verdict; and between the unknown early-return and
`const canAct = grade !== 'Poor';` insert:

```ts
  // The rule comes from the model's own lineage (D2-C5d): a model is graded by the rule it was trained under.
  const majority =
    !regression && noBetterThanMajority(metrics)
      ? majorityFinding(metrics, evaluation?.MajorityBaselineRule || EvaluationLineage.DefaultMajorityBaselineRule, headlineMetric?.key === 'Accuracy')
      : null;
  if (evaluation?.WithheldReason) {
    return cappedVerdict(headlineMetric, NOT_FORECAST_ONE_LINER, NOT_FORECAST_GATE_REASON, evaluation.WithheldReason, majority);
  }
  if (majority?.enforced) {
    return cappedVerdict(headlineMetric, MAJORITY_ONE_LINER, MAJORITY_GATE_REASON, null, majority);
  }
```

and add `withheldReason: null, majorityBaseline: majority,` to the final verdict (under `warn` that is the recorded,
non-enforced finding; otherwise `null`).

Update the module header: "Holdout metrics preferred; validation metrics only when recorded out-of-sample; a
time-indexed model not evaluated as a forecast is Poor; a classifier no better than the majority class is Poor under
the model's recorded majority-baseline rule `enforce` (the default) and carries a visible, non-capping finding under
`warn` (accuracy-only verdicts are capped under either)."

In `ps-predictions-resource.component.ts` `Cards`, add `Lineage: m.Lineage,` to the mapped input.

- [ ] Step 3b: Per §9 `D2-46` and `D2-48` (Scope Rule), only the `@deprecated` aliases inside files modified for functional reasons by PR 2 are removed (`deriveTrustVerdict`, `trustEvidenceLine`, `trustDots` in `Core/src/trust.ts` in M5.6 Step 0; `parseRowDrivers` in `at-risk.view-models.ts` in C4.2; `buildProductionExperimentDeps` in `run-experiment.deps.ts` in C6.1; `MLSidecar.train` in `Sidecar/src/ml-sidecar.ts` in M1.2 alongside updating `Engine/src/training/seams.ts:157` and `Sidecar/src/__tests__/ml-sidecar.test.ts:141,174`). Untouched files (`Core/src/metrics-util.ts`, `Engine/src/experiment/seams.ts`, `Engine/src/maintenance/*`, `Engine/src/agent/pipeline-builder.ts`, `dashboards/src/PredictiveStudio/business-predictions.view-models.ts`, and `packages/TestingFramework/integration-test-suite/rigs/ps-inproc-agent-builder.ts`) are not modified.
- [ ] Step 4: Run Core `pnpm test` → `0 failed`; dashboards
  `pnpm vitest run src/__tests__/business-predictions.test.ts` → `0 failed`; Engine `pnpm test` → `0 failed`
  (C5.4's last expectation now passes). Builds: Core, Engine, dashboards → `exit=0`.

#### Task C5.6: The truth-suite probe reads the stored verdict and declares the time index

**Files:** Modify `packages/AI/PredictiveStudio/TruthSuite/src/harness/containment-probe.ts` (§5.8; C5 owns these two
bodies) ·
Test: Modify `packages/AI/PredictiveStudio/TruthSuite/src/harness/__tests__/containment-probe.test.ts` (created in M5.9)

**Interfaces:** Keeps the signatures of `ContainmentProbe.ReadStoredWithheldVerdict(m: CandidateModel)` and
`ContainmentProbe.ApplyTimeIndexDeclaration(pipeline: MJMLTrainingPipelineEntity, column: string): boolean` (§5.8). Consumes
`CandidateModel.LineageJSON` (the raw `MLModel.Lineage`, filled by `ReadModel`, M5.6) and `CandidateModel.Trust`
(`TrustVerdicts.DeriveTrustVerdict(model)` over the whole entity, M5.6, §9 D2-26). `TruthHarness.CreatePipeline` (M5.6) sets
`ValidationStrategy` from the spec, then calls `ContainmentProbe.ApplyTimeIndexDeclaration` when `spec.TimeIndexColumn` is set, then
saves the pipeline once — so the declaration is part of that save (G0.11).

- [ ] Step 1: Append the failing tests to the M5.9 file (it already imports `describe`/`it`/`expect`,
  `TrustVerdicts.DeriveTrustVerdict`, `CandidateModel` and defines the `model(over)` helper; add the imports below to its import block):

```ts
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EvaluationLineage, type ValidationStrategy } from '@memberjunction/predictive-studio-core';

/** A T4-like regression model whose trust is derived from its own lineage, as `ReadModel` derives it. */
function candidate(lineageJSON: string | null): CandidateModel {
  const holdoutMetrics = { r2: 0.7775 };
  return model({
    Algorithm: 'lightgbm', HoldoutMetrics: holdoutMetrics, LineageJSON: lineageJSON,
    Trust: TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify(holdoutMetrics), ProblemType: 'regression', Lineage: lineageJSON }),
  });
}

describe('containment probe — stored verdict and time index', () => {
  it('reads the stored withheld verdict', () => {
    const lineage = JSON.stringify({ evaluation: { ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast } });
    expect(ContainmentProbe.ReadStoredWithheldVerdict(candidate(lineage))).toEqual({ CanAct: false, Grade: 'Poor', Reason: EvaluationLineage.NotEvaluatedAsForecast });
  });

  it('returns null when nothing is withheld', () => {
    expect(ContainmentProbe.ReadStoredWithheldVerdict(candidate(JSON.stringify({ pipelineId: 'p1' })))).toBeNull();
  });

  it('declares the time index on the pipeline, keeping the rest of its validation strategy', () => {
    // Test double: ContainmentProbe.ApplyTimeIndexDeclaration reads and writes only ValidationStrategy.
    const pipeline = { ValidationStrategy: JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 }) } as unknown as MJMLTrainingPipelineEntity;
    expect(ContainmentProbe.ApplyTimeIndexDeclaration(pipeline, 'MonthIndex')).toBe(true);
    const saved = JSON.parse(pipeline.ValidationStrategy || '{}') as ValidationStrategy;
    expect(saved).toEqual({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
  });
});
```

- [ ] Step 2: `pnpm --filter @memberjunction/predictive-studio-truth-suite exec vitest run src/harness/__tests__/containment-probe.test.ts`
  → `2 failed` (null returned; `false` returned), `5 passed` (M5.9's four and `returns null when nothing is withheld`).

- [ ] Step 3: Replace the two members' bodies in `ContainmentProbe` (add
  `import { SafeJSONParse } from '@memberjunction/global';` and
  `import { EvaluationLineage, type ValidationStrategy } from '@memberjunction/predictive-studio-core';`):

```ts
  /** The withheld verdict a model stores: `Lineage.evaluation.WithheldReason` with the model's derived grade. */
  public static ReadStoredWithheldVerdict(m: CandidateModel): StoredWithheldVerdict | null {
    const evaluation = EvaluationLineage.Read(m.LineageJSON);
    if (!evaluation?.WithheldReason) {
      return null;
    }
    return { CanAct: m.Trust.canAct, Grade: m.Trust.grade, Reason: evaluation.WithheldReason };
  }

  /** Declare the pipeline's time index as `ValidationStrategy.TimeIndexColumn`. The caller saves the pipeline. */
  public static ApplyTimeIndexDeclaration(pipeline: MJMLTrainingPipelineEntity, column: string): boolean {
    const current: ValidationStrategy =
      (pipeline.ValidationStrategy ? SafeJSONParse<ValidationStrategy>(pipeline.ValidationStrategy) : null) || {
        Strategy: 'train_test_split',
        TestSize: 0.2,
        LockedHoldoutFraction: 0.1,
      };
    const next: ValidationStrategy = { ...current, TimeIndexColumn: column };
    pipeline.ValidationStrategy = JSON.stringify(next);
    return true;
  }
```

- [ ] Step 4: Re-run Step 2's command → `7 passed`; `pnpm --filter @memberjunction/predictive-studio-truth-suite test`
  → `0 failed`. Mutation checks (§6 shared notes): `ContainmentProbe.ReadStoredWithheldVerdict` returning the record without the
  `WithheldReason` check → `returns null when nothing is withheld` red; `ContainmentProbe.ApplyTimeIndexDeclaration` dropping `...current`
  → `declares the time index on the pipeline, keeping the rest …` red.

#### Task C5.7: Guide corrections for as-of and validation

**Files:** Modify `guides/PREDICTIVE_STUDIO_GUIDE.md` (§4.3 last paragraph; §5.1 first sentence)

**Interfaces:** none. This milestone owns the wording of these guide sections; M-final.4 quote-checks them and does not
rewrite them (§9 D2-30). Closes F-DOC-4 and F-DOC-35.

- [ ] Step 1: In §4.3 replace the paragraph starting `Time-relative feature logic (\`daysSinceLastActivityAsOf\``
  with:

```markdown
The time-relative helpers (`daysSinceLastActivityAsOf`, `activityCountAsOf`) filter dated source rows to each record's
cutoff, but training passes no dated sources and reads every other feature as it stands today, so **an as-of mode
changes nothing in a trained model** (all three modes produced byte-identical models in the assessment). Training
therefore **refuses** `column` and `offset` before it starts, and so does `PredictiveStudio.TrainModel` when its `asOf`
input is not `none`. Use `{ "Mode": "none" }` and keep post-outcome columns out of the feature list until dated
feature assembly ships.
```

- [ ] Step 2: In §5.1 replace `Default to a train/test split with overfitting detection; optional k-fold and holdout.`
  with:

```markdown
Validation is a train/test split by default; `kfold` predicts every training row out of fold (`K` folds, stratified
for classification) and `holdout` uses the same out-of-sample split as `train_test_split`. There is no overfitting
detection. Training with fewer than 4 rows after the locked holdout is refused. The trust grade uses `HoldoutMetrics`,
or the validation metrics when the model's lineage records them as out-of-sample. A pipeline that declares
`ValidationStrategy.TimeIndexColumn` but was not tested on later periods ("not evaluated as a forecast") is graded
Poor with the reason stored. A classifier no better than always predicting the most common class (or one that predicts
a single class) is graded Poor while the pipeline's `ValidationStrategy.MajorityBaselineRule` is `"enforce"` (the
default); with `"warn"` the verdict keeps that finding and its numbers but is graded on AUC, and an accuracy-only
verdict is still graded Poor. Training records the rule in the model's lineage (`Lineage.evaluation`), so a model keeps
the rule it was trained under; an unknown value is refused before training. The Studio has no control for it yet: set
it in the pipeline's `ValidationStrategy` JSON (the `MJ: ML Training Pipelines` record form, or metadata), e.g.
`{ "Strategy": "train_test_split", "TestSize": 0.2, "LockedHoldoutFraction": 0.15, "MajorityBaselineRule": "warn" }`.
The Studio's pipeline editor keeps the value when other validation settings are edited; a pipeline created by the
wizard (including a clone) or by the Model Development Agent starts on `"enforce"`.
```

(The rest of §5.1 — the locked holdout's position and the "honest number" — is corrected by M-final.4, which does not
rewrite the sentences C5.7 owns, §9 D2-30.)

#### Task C5.8: Runtime verification and gates `W4 → S2.1`, `W2 → S5.3`, `W1 → S5.4`, `T4 → S6.5`, `W7 → S4.2`

**Files:** Create `packages/AI/PredictiveStudio/TruthSuite/scripts/majority-rule-check.mts` (kept) · Modify
`packages/AI/PredictiveStudio/TruthSuite/package.json` (`"truth:majority-rule": "tsx scripts/majority-rule-check.mts"`)

**Interfaces:** Consumes the M5.7 runner (RV-0 `gate`/`outcome`) and the G0.8–G0.12 bodies (M5.9, unchanged except
D2-27's promote step in G0.10, which M5.9 already contains). G0.8 reads `WasRefusedBeforeTraining` (`!ok && modelId ===
null`; `TruthHarness.Train` returns `modelId: null` whenever the operation fails, M5.6). G0.11 creates each origin's
pipeline with `timeIndexColumn: 'MonthIndex'`; `CreatePipeline` calls `ApplyTimeIndexDeclaration` (C5.6) before its
single `p.Save()` and records the answer for `LastTimeIndexDeclared()`; it then reads `ReadStoredWithheldVerdict`
(C5.6) and `GradedAbovePoorOrActionable` on `CandidateModel.trust`, which `ReadModel` derives from the whole
`MJ: ML Models` entity (`TrustVerdicts.DeriveTrustVerdict(model)`, so `Lineage` reaches C5.5; M5.6, §9 D2-26). G0.12 reads the
same `trust` for the Pipeline Builder's winner. G0.10 promotes each of its models to Validated before scoring (C3
refuses Draft, §9 D2-27).

- [ ] Step 1: Build Core, Engine, dashboards, TruthSuite (`pnpm run build; echo "exit=$?"` in each → `exit=0`). The
  sidecar's Python sources changed (C5.2) but `requirements.txt` did not, so the venv is not rebuilt; stop the truth
  sidecar so RV-0 starts it from the new sources: `pkill -f "scripts/sidecar.mts"; rm -f $TS/.run/sidecar.url`. Run
  RV-0.
- [ ] Step 2: Gates (record the start time first; the database checks count only this run's rows):

```bash
export T0=$(date -u +"%Y-%m-%d %H:%M:%S")
for g in "W4 → S2.1" "W2 → S5.3" "W1 → S5.4" "T4 → S6.5" "W7 → S4.2"; do gate pr "$g"; done
outcome G0.8    # → xpass {"refused":2,"columnModeError":"Training refused: the pipeline's AsOfStrategy (Mode='column') has no effect. …",
                #          "asOfInputError":"Training refused: the Train operation's asOf input (Mode='column') has no effect. …", …Model:null}
outcome G0.9    # → xpass: kfoldLower ≤ 0.5 ≤ kfoldUpper and holdoutLower ≤ 0.5 ≤ holdoutUpper (or …Refused true)
outcome G0.10   # → xpass: logistic_regressionMaxDiff, xgboostMaxDiff, lightgbmMaxDiff each ≤ 1e-9 (xpass before C5 too)
outcome G0.11   # → xpass {"origins":12,"timeIndexDeclared":12,"gradedAbovePoorOrActionable":0,"withheldVerdictsStored":12}
outcome G0.12   # → xpass: "violations":0 ("qualifying" = seeds whose winner's accuracy ≤ the majority rate; s42 and s43 per F-TR-4)
```

- [ ] Step 3: Database checks:

```bash
sq "SELECT COUNT(*) FROM __mj.MLTrainingRun r JOIN __mj.MLTrainingPipeline p ON p.ID = r.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.8%' AND r.__mj_CreatedAt >= '$T0'"                                         # → 0 (both refused before the run row)
sq "SELECT COUNT(*) FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.11%' AND m.__mj_CreatedAt >= '$T0'
      AND JSON_VALUE(p.ValidationStrategy,'$.TimeIndexColumn') = 'MonthIndex'
      AND JSON_VALUE(m.Lineage,'$.evaluation.WithheldReason') = 'not evaluated as a forecast'"                 # → 12
sq "SELECT COUNT(*) FROM __mj.MLTrainingRun r JOIN __mj.MLTrainingPipeline p ON p.ID = r.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.11%' AND r.__mj_CreatedAt >= '$T0'
      AND r.Notes LIKE '%Trust withheld — not evaluated as a forecast%'"                                         # → 12
sq "SELECT TOP 1 JSON_VALUE(m.Metrics,'$.n') FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.9%kfold%' AND m.__mj_CreatedAt >= '$T0' ORDER BY m.__mj_CreatedAt DESC"     # → the W2 s100 row count
                                                                                                                 #   (LockedHoldoutFraction 0)
sq "SELECT COUNT(*) FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.12%' AND m.__mj_CreatedAt >= '$T0'
      AND ISNULL(JSON_VALUE(m.Lineage,'$.evaluation.MajorityBaselineRule'), '') <> 'enforce'"                   # → 0 (G0.12 runs on the default, D2-C5d)
```

- [ ] Step 4: The majority-baseline rule end to end (D2-C5d, §9 risk R-b). Create `scripts/majority-rule-check.mts`:

```ts
/**
 * Runtime check of the majority-baseline rule: trains the W1-signal s42 logistic model once per rule
 * through MJAPI (the Train operation, as a browser does) and prints what the stored model says. `pnpm run truth:majority-rule`.
 */
import { EvaluationLineage } from '@memberjunction/predictive-studio-core';
import { RunFixtures } from '../src/harness/run-fixtures';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from '../src/harness/w-world';
import type { PipelineSpec } from '../src/harness/types';

async function main(): Promise<void> {
  const h = await RunFixtures.GetRunHarness();
  const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
  for (const rule of EvaluationLineage.MajorityBaselineRules) {
    const spec: PipelineSpec = {
      Name: `PSTruth: majority-rule ${rule} ${h.RunID}`, Dataset: w1, Target: 'Renewed', ProblemType: 'classification',
      Features: [...W_WORLD_FEATURES], Algorithm: 'logistic_regression', AsOf: { Mode: 'none' }, DenyFields: [...W_WORLD_DENY_FIELDS],
      // the containment gates' spec() validation, plus the rule under test
      Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, MajorityBaselineRule: rule },
    };
    const attempt = await h.Train(await h.CreatePipeline(spec), { MaxRows: 1000000 });
    if (!attempt.ModelID) throw new Error(`training failed under '${rule}': ${attempt.ErrorMessage || 'no message'}`);
    const m = await h.ReadModel(attempt.ModelID);
    console.log(JSON.stringify({
      rule, recorded: EvaluationLineage.Read(m.LineageJSON)?.MajorityBaselineRule || null,
      auc: m.HoldoutMetrics['auc'] ?? null,   // `??` on purpose: an AUC of 0 is a legitimate value
      grade: m.Trust.grade, canAct: m.Trust.canAct, majorityBaseline: m.Trust.majorityBaseline || null,
    }));
  }
}

try {
  await main();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
}
```

  add `"truth:majority-rule": "tsx scripts/majority-rule-check.mts"` to the TruthSuite `package.json` scripts, then run
  (RV-0 up) `cd $TS && pnpm run truth:majority-rule`. Expected, two lines:
  `{"rule":"enforce","recorded":"enforce","auc":0.723…,"grade":"Poor","canAct":false,"majorityBaseline":{"rule":"enforce","enforced":true,…}}`
  and `{"rule":"warn","recorded":"warn","auc":0.723…,"grade":"Good","canAct":true,"majorityBaseline":{"rule":"warn","enforced":false,…}}`,
  with the same `accuracy` ≤ `baselineAccuracy` in both findings. If the `enforce` line is not Poor (`majorityBaseline`
  null: this split's accuracy beats the majority rate), R-b's premise does not hold for this pipeline: record both
  lines in §11 and correct §9 risk R-b's numbers; the rule itself is still proven by the C5.5 unit tests. Then:

```bash
sq "SELECT JSON_VALUE(p.ValidationStrategy,'$.MajorityBaselineRule') + '|' + JSON_VALUE(m.Lineage,'$.evaluation.MajorityBaselineRule')
    FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth: majority-rule%' AND m.__mj_CreatedAt >= '$T0' ORDER BY p.Name"            # → enforce|enforce, warn|warn
```

  (An unknown rule is refused before the run row by `trainModel`; that path is proven by the Engine test
  "refuses an unknown majority-baseline rule before any row is written", C5.4, because the typed harness spec cannot
  carry an unknown value.)

- [ ] Step 5: Mutation checks (§6 shared notes):

| Guard | Mutation | Must go red |
|---|---|---|
| as-of refusal | `WouldBeIgnored` returns `false` | `refuses AsOfStrategy.Mode='column' …`, `… 'offset' …`, `refuses an asOf input that would change nothing …` |
| as-of refusal placement | move the engine check after `createRunRow` | `refuses AsOfStrategy.Mode=… before any row is written` (`factory.Runs` has 1) |
| sidecar: < 4 rows refused | delete the `MIN_VALIDATION_ROWS` raise | `test_too_few_rows_are_refused_not_scored_in_sample` |
| sidecar: K range / class size | delete either raise in `_kfold_out_of_fold_metrics` | `test_kfold_refuses_k_larger_than_a_class` (class size); the K-range raise is not exposed (no test passes K ≤ 1 or K > rows) — record it |
| sidecar: out-of-fold scoring | score `est` on its own training fold | `test_validation_metrics_are_out_of_sample_on_noise` (tree cases) |
| unknown rule refused | `ParseMajorityBaselineRule` returns the default for any value | `refuses an unknown majority-baseline rule instead of ignoring it`, Engine `refuses an unknown majority-baseline rule before any row is written` |
| validation metrics only when out-of-sample | `bestMetrics` ignores `evaluation` | `ignores in-sample training metrics when no holdout exists (F-TR-3)` |
| accuracy needs the majority rate | drop `&& metrics.BaselineAccuracy !== undefined` | `grades accuracy only against the always-majority rate (F-TR-1)` (`bare.unknown`) |
| at-or-below majority is Poor | `<=` → `<` in `noBetterThanMajority` | `enforce (the default …) grades the W1 logistic model Poor` (accuracy = baseline) |
| constant predictor | `PredictedClasses <= 1` → `< 1` | `grades a constant predictor Poor even with a high AUC` |
| `warn` never rescues accuracy-only | `enforced: rule === 'enforce'` only | `warn never rescues an accuracy-only verdict` |
| withheld verdict | delete the `evaluation?.WithheldReason` early return | `withholds a time-indexed model …` (Core), `withholds trust for a pipeline that declares a time index …` (Engine), `blocks a card whose model withholds its verdict` (dashboards) |
| stored-record default | `Read` maps a missing rule to `'warn'` | `records the pipeline's majority-baseline rule, enforce when absent` |

  **Release notes, regression strategy and remediation (conventions §5a):** this changes long-stable trust grading
  and validation, so (a) on deploy, verdicts of existing models change the first time they are read: accuracy-only
  verdicts without `baseline_accuracy` become "unknown" (not actionable), validation-only verdicts of models trained
  before C5 become "unknown" (their `Metrics` are in-sample), and classifiers whose stored accuracy is at or below the
  majority rate become Poor — their Predictions cards lock (`canOpen` false). Status is not changed: a model already
  `Published` stays Published. (b) Pipelines with `AsOfStrategy` `column`/`offset` and Train calls with a non-`none`
  `asOf` start failing (R-e). (c) `kfold`/`holdout` retrains report lower, honest metrics. The fix prevents new
  in-sample verdicts and does not heal existing ones: list the models whose verdict changes with
  `SELECT m.ID, m.Status, p.Name FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID WHERE JSON_VALUE(m.Lineage,'$.evaluation.ValidationOutOfSample') IS NULL AND m.Status IN ('Validated','Published')`
  and retrain them (models trained after C5 carry `Lineage.evaluation`). Regression strategy: the full Core, Engine,
  Sidecar and dashboards suites, the C5.8 gate runs and the live Engine integration test (keep-list), with the
  mutation table above; all of it is run by AI (ruling S1) and the PR description says so. Both go to §10.

**Exit tests:**
- Core `pnpm test` → +16 (5 evaluation-record, 11 new trust tests; one trust test rewritten in place), `0 failed`.
- Engine `pnpm test` → +9 (3 as-of engine, 2 operation, 4 evaluation-record engine), `0 failed`.
- Sidecar `pnpm run test:python` → +18 (12 out-of-sample, 6 determinism), `0 failed`.
- dashboards `pnpm test` → +1, `0 failed`; TruthSuite unit `pnpm --filter @memberjunction/predictive-studio-truth-suite test` → +3, `0 failed`.
- Builds `exit=0` (Core, Engine, dashboards, TruthSuite).
- Truth-suite runner: G0.8, G0.9, G0.10, G0.11, G0.12 → `xpass` (Step 2); G0.12's models record `enforce` (Step 3).
- `pnpm run truth:majority-rule` → the two lines of Step 4 (or the R-b correction recorded in §11 and §9).
- Keep-list: `pnpm --filter @memberjunction/predictive-studio run test:integration` → `3 passed` (the live test trains
  with `train_test_split` on 420 rows).

**Checkpoint commit:** `fix(ps): PR 2 C5 — refuse no-op as-of; out-of-sample validation; withheld and majority-rate trust containment`

### C6 — Hide what doesn't run  ·  parallel-safe: no  ·  depends on: C5 (shares the agent prompt and metadata with C4); no gate of its own

**Outcome:** nobody can start an experiment session that trains nothing and reports success: the server refuses
before creating any session row (Action and Remote Operation), the Studio's Experiments panel no longer offers "New
Experiment", Pause, Resume or Cancel, and the Model Development Agent no longer has the action or the instruction.
The maintenance job that has no Action behind it is labelled "not wired" and stays Disabled. The guide says what runs.

**What `next` does today:**
- `BuildProductionExperimentDeps` (`Engine/src/actions/run-experiment.deps.ts:65-93`) always wires
  `new UnresolvedPipelineResolver()` (`:82`), whose `resolvePipelineId` always throws (`:40-48`). The orchestrator
  catches each iteration's failure into `Rationale` (`experiment/experiment-orchestrator.ts:376-390`) and ends the
  session `Completed` (`:529`); only scored iterations count toward the budget (`:294-302`). Both the
  `Run Experiment Session` Action (`run-experiment.action.ts:147`) and `PredictiveStudio.StartExperimentSession`
  (`operations/delegation.ts:211`) use it.
- The Studio's Experiments panel offers "New Experiment" (`components/ps-experiments.component.ts:65`, `:93`), which
  opens `ps-run-experiment-modal` → `PredictiveStudioStartExperimentSessionOperation` (`ps-run-experiment-modal.component.ts:595`),
  and Pause/Resume/Cancel (`:96-104`), which only relabel the session.
- The agent links `Run Experiment Session` (`metadata/agents/.model-development-agent.json:45`) and its prompt says
  "Call **Run Experiment Session** with the approved plan" (template `:55`) and offers "launch manual experiment
  sessions anytime in the **Experiments** tab" (`:61`).
- `metadata/scheduled-jobs/.predictive-studio-maintenance-job.json`: `Status: "Disabled"`, `Configuration: {}`, no
  `ActionID`; its description says it runs the maintenance pass. Enabling it fails ("ActionID is required", Exp 61).

**Findings closed or contained:**

| ID | Sev | Defect (evidence) | Fix / containment here | Test |
|---|---|---|---|---|
| F-EXP-1 | S2 | "Start Experiment Session" never trains anything, yet reports success and a Completed session (Exp 53: 3 experiments → 251 ms success, 3 iterations failed, 0 training runs, Rationale "no pipeline resolver is configured"). | Server refuses before any row; UI entry hidden; agent link revoked. | C6.1 unit, C6.2 DOM, C6.3 metadata |
| F-EXP-2 (owner PR 5) | S2 | A failing session ignores its run budget (4 iterations under `MaxRuns = 3`). | Hidden as user-facing (no session can start). | C6.1 |
| F-EXP-3 (owner PR 5) | S2 | Compute cost is 0 on every training run and tokens are never recorded, so a compute budget can never stop a session. | Hidden as user-facing. | C6.1 |
| F-EXP-4 (owner PR 4) | S2 | Concurrent trains of one pipeline can get the same version; two published models share one scoring Action. | Hidden as user-facing (the session path that trained concurrently is closed). | C6.1 |
| F-MNT-1 (owner PR 4) | S2 | The maintenance pillar never runs: its only job is a disabled placeholder pointing at no Action. | Job renamed "(not wired)", description says so; stays Disabled; guide says "built, not wired". | C6.4 metadata test |
| F-DOC-1, F-DOC-7, F-DOC-8, F-DOC-9, F-DOC-12, F-DOC-22 | S3 | Guide: PS "ships end-to-end" incl. the orchestrator and maintenance; waves via Record Set Processing, one Process Run per wave; pause "clean, resumable"; budget gate "no in-flight overrun"; the agent executes through the `ExperimentOrchestrator`; maintenance a co-equal pillar. | §7, §7.1, §12, §14 corrected (C6.5). | quote check |

**Decision taken here (recorded in §9):** *D2-C6 — refuse at `BuildProductionExperimentDeps` (now `ExperimentDepsBuilder.BuildProductionExperimentDeps`), keep the orchestrator code.*
The old wiring moves to `ExperimentDepsBuilder.BuildWithResolver(resolver, user, provider)` so PR 3/PR 5 can wire a real
`IPipelineResolver` without re-deriving it; tests that inject their own deps are unaffected. Rejected: delete the
orchestrator (PR 3 replaces it with the protocol-driven trainer; deleting first loses its tested seams).

#### Task C6.1: The server refuses experiment sessions before creating anything

**Files:** Modify `packages/AI/PredictiveStudio/Engine/src/actions/run-experiment.deps.ts`,
`packages/AI/PredictiveStudio/Engine/src/actions/run-experiment.action.ts`,
`packages/AI/PredictiveStudio/Engine/src/operations/delegation.ts` (doc references) ·
Test: Modify `packages/AI/PredictiveStudio/Engine/src/actions/__tests__/run-experiment.action.test.ts`

**Interfaces:** Produces `EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE`, `class ExperimentSessionsUnavailableError`,
`ExperimentDepsBuilder.BuildWithResolver(resolver: IPipelineResolver, contextUser: UserInfo, provider: IMetadataProvider): Promise<ExperimentDeps>`
(a static of a new `ExperimentDepsBuilder` class, program D-047; user and provider required: a new entry point has no
caller to keep compiling, coding standards §2);
`ExperimentDepsBuilder.BuildProductionExperimentDeps` (the shipped free function, moved into the class because this task
changes it — program D-047 as amended by D-052, ruling CQ-1) keeps its parameters and always rejects with
`ExperimentSessionsUnavailableError`.
The Action returns `ResultCode: 'EXPERIMENT_UNAVAILABLE'`; `PredictiveStudio.StartExperimentSession` fails with the
message (its `RunExperimentSessionViaOrchestrator` awaits the deps before `runSession`, `delegation.ts:211`).

- [ ] Step 1: Write the failing tests. Append to `run-experiment.action.test.ts` (import
  `ExperimentDepsBuilder, ExperimentSessionsUnavailableError` from `'../run-experiment.deps'`):

```ts
/** The action with production deps (no buildDeps override) and a recording orchestrator. */
class ProductionDepsExperimentAction extends PredictiveStudioRunExperimentAction {
  constructor(private readonly orchestrator: ExperimentOrchestrator) {
    super();
  }
  protected override createOrchestrator(): ExperimentOrchestrator {
    return this.orchestrator;
  }
  public RunAction(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

describe('Experiment sessions are switched off (F-EXP-1)', () => {
  it('ExperimentDepsBuilder.BuildProductionExperimentDeps refuses before touching the database', async () => {
    await expect(ExperimentDepsBuilder.BuildProductionExperimentDeps(undefined, undefined)).rejects.toBeInstanceOf(ExperimentSessionsUnavailableError);
  });

  it('the action refuses an approved plan with EXPERIMENT_UNAVAILABLE and never runs the orchestrator', async () => {
    const orch = new MockOrchestrator(sessionResult());
    const p = params([{ Name: 'PlanSpec', Type: 'Input', Value: approvedPlan() }]);
    const result = await new ProductionDepsExperimentAction(orch).RunAction(p);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXPERIMENT_UNAVAILABLE');
    expect(result.Message).toMatch(/Experiment sessions are switched off/);
    expect(orch.CallCount).toBe(0);
  });
});
```

- [ ] Step 2: `cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm vitest run src/actions/__tests__/run-experiment.action.test.ts`
  → `2 failed` (`ExperimentSessionsUnavailableError` is not exported yet, and the action does not return
  `EXPERIMENT_UNAVAILABLE`).

- [ ] Step 3: Implement in `run-experiment.deps.ts`:

```ts
/** Why experiment sessions are switched off (containment of F-EXP-1). */
export const EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE =
  'Experiment sessions are switched off: the session runner has no way to turn a proposed experiment into a training ' +
  'pipeline, so every iteration failed while the session still reported Completed. Build models with the Model ' +
  'Development Agent (its Pipeline Builder trains the approved experiments) or train a pipeline with Train ML Model.';

/** Thrown when an experiment session is requested while sessions are switched off. */
export class ExperimentSessionsUnavailableError extends Error {
  constructor() {
    super(EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE);
    this.name = 'ExperimentSessionsUnavailableError';
  }
}

/** Builds the experiment orchestrator's dependencies (static members on one owner, coding standards §2). */
export class ExperimentDepsBuilder {
  /**
   * Production {@link ExperimentDeps}: refused until a real {@link IPipelineResolver} exists (a later change wires one
   * through {@link ExperimentDepsBuilder.BuildWithResolver}). Refusing here stops both the Action and the Remote Operation
   * before the orchestrator creates any Experiment, Session or Iteration row.
   */
  public static async BuildProductionExperimentDeps(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<ExperimentDeps> {
    throw new ExperimentSessionsUnavailableError();
  }

  /**
   * The orchestrator's dependencies with a caller-supplied pipeline resolver: the production wiring, with `resolver`
   * deciding which pipeline each experiment trains.
   */
  public static async BuildWithResolver(resolver: IPipelineResolver, contextUser: UserInfo, provider: IMetadataProvider): Promise<ExperimentDeps> {
    const entityFactory = new MetadataEntityFactory(provider);
    const providerId = await ResolveActiveFileStorageProviderId(contextUser, provider);
    const trainingDeps: TrainingDeps = {
      entityFactory,
      recordLoader: new RunViewRecordLoader(provider),
      sidecar: new MJSidecarTrainer(),
      artifactStore: BuildArtifactStore(providerId, entityFactory),
      contextUser,
      provider,
    };
    const trainer = new TrainingEngineExperimentTrainer(trainingDeps, resolver, new TrainingEngine());
    return {
      entityFactory: new MetadataExperimentEntityFactory(provider),
      trainer,
      clock: new SystemClock(),
      contextUser,
      provider,
    };
  }
}
```

This replaces the free function `BuildProductionExperimentDeps` (`:51-93`); keep `UnresolvedPipelineResolver` exported
(it is still the safe default for a caller that has none) and the module's imports. Delete the deprecated `buildProductionExperimentDeps`
alias (`run-experiment.deps.ts:95–101`, program D-042) and change its two doc references in
`Engine/src/operations/delegation.ts` (lines 9 and 195) to `ExperimentDepsBuilder.BuildProductionExperimentDeps`. Move the
callers of the free function on `next` — `run-experiment.action.ts:31,147` and `operations/delegation.ts:30,211` — to
`ExperimentDepsBuilder.BuildProductionExperimentDeps`; the release note (§10) names the move. In `run-experiment.action.ts` import
`ExperimentSessionsUnavailableError` and make the `catch` start with:

```ts
      if (e instanceof ExperimentSessionsUnavailableError) {
        return this.fail('EXPERIMENT_UNAVAILABLE', e.message);
      }
```

- [ ] Step 4: Re-run Step 2's command → `0 failed` (the existing tests override `buildDeps` and keep passing);
  `pnpm run build` → `exit=0` (fix any import left unused by the move).

#### Task C6.2: The Studio no longer offers experiment sessions

**Files:** Modify `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-experiments.component.ts` ·
Delete `components/ps-run-experiment-modal.component.ts`, `components/ps-run-experiment-modal.component.css`,
`components/ps-confirm-modal.component.ts` and `components/ps-confirm-modal.component.dom.test.ts` ·
Test: Modify `packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-experiments.component.dom.test.ts`

**Interfaces:** Existing sessions stay viewable (header, kanban, leaderboard, results artifact); nothing in the panel
starts, pauses, resumes or cancels a session. Deleted as dead code (standards §3; rulings SR-6 and CN-11): the start
modal `ps-run-experiment-modal` (with sessions switched off nothing can open it, and no later plan re-enables it —
checked: PR 3–PR 6 plans do not name it); the Pause/Resume/Cancel controls with their confirmation flow
(`CanPause`/`CanResume`/`CanCancel`, `RequestControl`/`CancelControl`/`ConfirmControl`, `PendingAction`, `Busy`, the
`Pending*` getters, `refreshAfterMutation`, `escapeHtml`, each with its deprecated camelCase alias), which could only
relabel a session that cannot train; and `ps-confirm-modal`, whose only user is that flow
(`git grep -n "PSConfirmModalComponent\|ps-confirm-modal" origin/next -- packages` → only `ps-experiments.component.ts`
and the modal's own files; ruling CQ-4: no dead code between releases — PR 4 M7 creates the dialog it needs). A later
re-enable re-creates the controls. No route change (L3 surface, no router import
added).

- [ ] Step 1: Update the DOM tests. Delete `'shows Pause + Cancel (not Resume) for a Running session'`,
  `'shows Resume (not Pause) for a Paused session'` and `'opens the confirm modal when Pause is clicked'`, update the file
  header comment that describes the controls, and add:

```ts
  it('offers no New Experiment, Pause, Resume or Cancel while sessions are switched off', () => {
    for (const status of ['Running', 'Paused']) {
      const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: status, Budget: null }]));
      for (const id of ['ps-experiments-new-btn', 'ps-experiments-pause', 'ps-experiments-resume', 'ps-experiments-cancel']) {
        expect(query(fixture, `[data-testid="${id}"]`)).toBeNull();
      }
      expect(query(fixture, '[data-testid="ps-experiments-unavailable"]')).not.toBeNull();
    }
  });

  it('explains why in the empty state and offers no New Experiment', () => {
    const fixture = render(makeEngine([]));
    expect(query(fixture, '[data-testid="ps-experiments-new-btn-empty"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-empty"]')?.textContent).toContain('switched off');
  });
```

- [ ] Step 2: `cd $MJ/packages/Angular/Explorer/dashboards && pnpm vitest run src/PredictiveStudio/components/ps-experiments.component.dom.test.ts`
  → both new tests fail (buttons present; no unavailable notice).

- [ ] Step 3: Implement in `ps-experiments.component.ts`:
  - delete the start modal and everything that only serves it: the `PSRunExperimentModalComponent` import and its entry
    in `imports`, the `@if (showNewExperimentModal) { <ps-run-experiment-modal …> }` block, and the members
    `showNewExperimentModal` (getter/setter and its backing field), `openNewExperimentModal`, `closeNewExperimentModal`
    and `onExperimentStarted`; then delete `ps-run-experiment-modal.component.ts` and `.css`;
  - delete the session controls and their confirmation flow: the three `@if (canPause)` / `@if (canResume)` /
    `@if (canCancel)` button blocks of the header (`:96-104`), the `@if (pendingAction) { <ps-confirm-modal …> }` block
    (`:206-218`), the members `PendingAction`/`pendingAction` and `Busy`/`busy` (`:300-321`), the `// ---- control
    availability ----` and `// ---- control flow (Remote Op) ----` sections (`CanPause` … `confirmControl`, `:670-821`),
    `refreshAfterMutation` (`:823-829`) and the module function `escapeHtml` (`:832-839`); remove the
    `PredictiveStudioControlExperimentSessionOperation`, `PredictiveStudioExperimentSessionAction` and
    `PSConfirmModalComponent` imports and the `PSConfirmModalComponent` entry in `imports`; in the class doc replace
    the "**Pause / Cancel** call the … Remote Op" bullet with "Sessions are switched off: the panel shows earlier
    sessions and offers no start or control action."; then delete `ps-confirm-modal.component.ts` and its DOM test;
  - check: `git grep -n "ps-run-experiment-modal\|PSRunExperimentModalComponent\|ps-confirm-modal\|PSConfirmModalComponent\|ControlExperimentSession\|CanPause\|RequestControl" packages/Angular/Explorer/dashboards`
    → 0 hits;
  - empty state: replace the `<p>` text with
    `Experiment sessions are switched off: the session runner cannot yet train the experiments it plans. Build models with the Model Development Agent or from the Pipelines tab.`
    and remove the `ps-experiments-new-btn-empty` button's container `<div>` (it opened the deleted modal);
  - session header: remove the `ps-experiments-new-btn` button (it opened the deleted modal) and add after the header
    strip:

```html
        <div class="ps-callout warn" data-testid="ps-experiments-unavailable">
          <i class="fa-solid fa-circle-info"></i>
          <div>Experiment sessions are switched off: earlier sessions are shown for reference, but new sessions cannot be
          started, paused or resumed until the session runner can train the experiments it plans.</div>
        </div>
```

  (`.ps-callout.warn` is defined in `predictive-studio.shared.css`; no new colours.)

- [ ] Step 4: Re-run Step 2's command → `0 failed`; dashboards `pnpm test` → `0 failed`; `pnpm run build` →
  `exit=0`; `cd $MJ && npm run check:ui` → passes.

#### Task C6.3: The agent no longer has, or is told to use, Run Experiment Session

**Files:** Modify `metadata/agents/.model-development-agent.json` (the `Run Experiment Session` link) ·
Modify `metadata/prompts/templates/model-development-agent/model-development-agent.template.md` (section 3, the
Studio-workbench bullet, the intro sentence on execution) ·
Test: Create `packages/AI/PredictiveStudio/Engine/src/agent/__tests__/agent-tool-containment.test.ts`

**Interfaces:** `MJ: AI Agent Actions.Status` is `'Active' | 'Pending' | 'Revoked'` (`__mj.ts:38650`); `BaseAgent`
loads only `Status === 'Active'` links (`AI/Agents/src/base-agent.ts:3875`, `:4541`, `:5782`, `:5905`; anchor
`ctn-c6-agent-status-filter`), so `Revoked` removes the tool from every run without deleting the row. The agent's
`Promote ML Model` link stays `Active` (program D-030).

- [ ] Step 1: Create `agent-tool-containment.test.ts` (the test file is
  `packages/AI/PredictiveStudio/Engine/src/agent/__tests__/`, seven levels below the repository root):

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MJAIAgentActionEntity } from '@memberjunction/core-entities';

/** The slice of the agent metadata file this test reads (`Status` derived from the entity, never widened to string). */
interface AgentActionLink {
  fields: { ActionID: string; Status: MJAIAgentActionEntity['Status'] };
}
interface AgentMetadataRecord {
  fields: { Name: string };
  relatedEntities?: { 'MJ: AI Agent Actions'?: AgentActionLink[] };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

function activeActions(): string[] {
  const raw = readFileSync(path.join(repoRoot, 'metadata/agents/.model-development-agent.json'), 'utf8');
  const records = JSON.parse(raw) as AgentMetadataRecord[];
  const agent = records.find((r) => r.fields.Name === 'Model Development Agent');
  return (agent?.relatedEntities?.['MJ: AI Agent Actions'] || [])
    .filter((link) => link.fields.Status === 'Active')
    .map((link) => link.fields.ActionID);
}

describe('Model Development Agent — no experiment sessions (F-EXP-1)', () => {
  it('has no active link to Run Experiment Session', () => {
    expect(activeActions()).not.toContain('@lookup:MJ: Actions.Name=Run Experiment Session');
  });

  it('is not told to run or launch experiment sessions', () => {
    const prompt = readFileSync(path.join(repoRoot, 'metadata/prompts/templates/model-development-agent/model-development-agent.template.md'), 'utf8');
    expect(prompt).not.toMatch(/Run Experiment Session/);
    expect(prompt).not.toMatch(/launch manual experiment sessions/);
  });
});
```

- [ ] Step 2: `pnpm vitest run src/agent/__tests__/agent-tool-containment.test.ts` → `2 failed`.
- [ ] Step 3: Implement.
  - In `.model-development-agent.json`, in the link whose `ActionID` is
    `@lookup:MJ: Actions.Name=Run Experiment Session`, set `"Status": "Revoked"`.
  - In the template, replace the whole "### 3. Execute (deterministic)" section body with:

```markdown
- Once the user approves, the system routes the approved plan to the **Pipeline Builder**, which creates the pipeline,
  trains the proposed candidates and publishes the best one when its trust grade clears the bar and training did not
  flag leakage (otherwise it stays in Draft with the reason). You do not run experiment sessions: they are switched off
  because the session runner cannot yet train the experiments it plans.
- Do **not** try to do the training yourself or second-guess the engine's math. Your job during execution is to keep
  the user informed.
```

  - Replace the bullet starting `- **Point out the Studio Workbench**:` with:

```markdown
- **Point out the Studio Workbench**: let the user know the created pipeline is in the **Pipelines** tab, where they
  can view the feature steps and leakage rules and train it again.
```

  - In the template's tool list (`:27`), delete the bullet that starts `- **Run Experiment Session** — the deterministic engine.`
  - In "### 2. Approve", replace the bullet that starts `- **Do not call Run Experiment Session until the user clearly approves.**` with:

```markdown
- **Nothing is built until the user clearly approves.** "Looks good, go ahead" is approval; silence or a question is
  not. Use `suggestedResponses` to offer clear choices (Approve / Edit goal / Edit data / Edit experiments).
```

  - In `metadata/prompts/.model-development-agent-prompts.json`, in the `Model Development Agent - Main Prompt` record's
    `Description`, change "drives the deterministic experiment session" to "hands the approved plan to the
    deterministic Pipeline Builder".
  - In `.model-development-agent.json` the agent `Description` says "then drives the deterministic experiment session
    through the Run Experiment Session action"; change that clause to "then hands the approved plan to the
    deterministic Pipeline Builder (experiment sessions are switched off)".
  - Check: `grep -n "Run Experiment Session" metadata/prompts/templates/model-development-agent/model-development-agent.template.md`
    → no output.
- [ ] Step 4: Re-run Step 2's command → `0 failed`. Push and check:

```bash
pnpm mj sync push --dir=metadata/agents --ci && pnpm mj sync push --dir=metadata/prompts --ci
sq "SELECT aa.Status FROM __mj.AIAgentAction aa JOIN __mj.Action a ON a.ID = aa.ActionID
    JOIN __mj.AIAgent ag ON ag.ID = aa.AgentID WHERE ag.Name = 'Model Development Agent' AND a.Name = 'Run Experiment Session'"   # → Revoked
```

#### Task C6.4: The maintenance job says it is not wired

**Files:** Modify `metadata/scheduled-jobs/.predictive-studio-maintenance-job.json` ·
Test: Create `packages/AI/PredictiveStudio/Engine/src/maintenance/__tests__/maintenance-job-metadata.test.ts`

**Interfaces:** `MJ: Scheduled Jobs.Status` stays `Disabled` (`ScheduledJobEngine` runs only `Active` jobs,
`Scheduling/engine/src/ScheduledJobEngine.ts:852`); `Name` becomes `Predictive Studio Maintenance (not wired)`.
No other record references the job by name.

- [ ] Step 1: Write the test:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';

interface ScheduledJobRecord {
  fields: { Name: string; Description: string; Status: MJScheduledJobEntity['Status']; Configuration: Record<string, string | number | boolean> };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

describe('Predictive Studio maintenance job metadata (F-MNT-1 contained)', () => {
  const [job] = JSON.parse(readFileSync(path.join(repoRoot, 'metadata/scheduled-jobs/.predictive-studio-maintenance-job.json'), 'utf8')) as ScheduledJobRecord[];

  it('is Disabled, has no Action, and says it is not wired', () => {
    expect(job.fields.Status).toBe('Disabled');
    expect(job.fields.Configuration).toEqual({});
    expect(job.fields.Name).toBe('Predictive Studio Maintenance (not wired)');
    expect(job.fields.Description).toMatch(/^Not wired:/);
  });
});
```

(`repoRoot`: seven levels above `Engine/src/maintenance/__tests__/`.)

- [ ] Step 2: `pnpm vitest run src/maintenance/__tests__/maintenance-job-metadata.test.ts` → `1 failed`.
- [ ] Step 3: In the job file set `"Name": "Predictive Studio Maintenance (not wired)"` and replace `Description` with:

```json
"Description": "Not wired: no Action exists behind this job, so enabling it fails with \"ActionID is required\" and nothing runs. It is kept Disabled as a placeholder for the Predictive Studio maintenance pass (staleness, scheduled re-scoring, retraining with a challenger comparison), which is built in the engine but not connected to any job. Per-model monitoring jobs replace it in a later release; until then do not enable it."
```

  Keep `Status: "Disabled"`, `Configuration: {}`, the primary key and the `sync` block.
- [ ] Step 4: Re-run → `1 passed`. Push and check:

```bash
pnpm mj sync push --dir=metadata/scheduled-jobs --ci
sq "SELECT Name, Status FROM __mj.ScheduledJob WHERE ID = '2CCE4280-9B29-4DCC-86A4-E5AF765909D1'"   # → Predictive Studio Maintenance (not wired) Disabled
```

#### Task C6.5: Guide corrections — what does not run

**Files:** Modify `guides/PREDICTIVE_STUDIO_GUIDE.md` (§7 intro, §7.1, §12 intro and diagram, §14 intro)

**Interfaces:** none. This milestone owns the wording of these guide sections; M-final.4 quote-checks them and does not
rewrite them (§9 D2-30). Closes F-DOC-7 and F-DOC-8; corrects the contained F-DOC-1, F-DOC-9,
F-DOC-12, F-DOC-22 sentences to shipped behaviour.

- [ ] Step 1: At the start of §7 (after the heading) insert:

```markdown
> **Built, not wired.** Experiment sessions are switched off: the production session runner has no
> `IPipelineResolver`, so it cannot turn a proposed experiment into a training pipeline, and every session it ran
> trained nothing while reporting `Completed`. The `Run Experiment Session` Action and
> `PredictiveStudio.StartExperimentSession` refuse with "Experiment sessions are switched off…", the Studio shows past
> sessions read-only, and the Model Development Agent trains through its Pipeline Builder (§12.4). The description
> below is the design the orchestrator code implements.
```

- [ ] Step 2: In §7.1 replace `and runs iterations in **waves through Record Set Processing**:` with
  `and runs iterations in **waves in an in-process bounded pool** (\`runBounded\`, \`experiment/concurrency.ts\`) — no Record Set Processing run is created:`;
  in the diagram replace `PAUSE(["Status='Paused'<br/>(clean, resumable)"])` with `PAUSE(["Status='Paused'<br/>(a status label; resume relabels only)"])`;
  replace the budget note's last sentence (from `The comment is explicit:` to the end of the blockquote) with
  `Only iterations that produced a score count toward the budget, so failed iterations are never counted (a 3-run budget ran 4 failing iterations), and \`MaxComputeCost\` has no effect because training records a compute cost of 0.`;
  and replace `A session may spawn **one Process Run per wave** (the two are kept distinct, no hard FK in v1). Because scoring *also* composes onto Record Set Processing, the whole feature shares one batching/budget/audit substrate.`
  with `A session creates no Process Run; waves run in the in-process pool above.`
- [ ] Step 3: In §12 replace `then execute mostly with deterministic code (the \`ExperimentOrchestrator\`)` with
  `then execute with deterministic code (the Pipeline Builder, §12.4)`; in the §12 diagram replace
  `ORCH[ExperimentOrchestrator] --> RUNS["waves through Record Set Processing<br/>train/score · prune · budget-gate · leaderboard"]`
  with `ORCH[Pipeline Builder] --> RUNS["create pipeline · train candidates<br/>winner → Published if trust clears"]`.
- [ ] Step 4: In §14 replace `Maintenance is a **co-equal pillar**, not an afterthought.` with
  `> **Built, not wired.** Nothing runs the maintenance pass: no Action exists for it and its scheduled job ("Predictive Studio Maintenance (not wired)") is Disabled. The design below is what the engine code implements.`
- [ ] Step 5: Quote check:
  `grep -n "co-equal pillar\|clean, resumable\|waves through Record Set Processing\|one Process Run per wave\|no in-flight overrun" guides/PREDICTIVE_STUDIO_GUIDE.md`
  → no output.

#### Task C6.6: Runtime verification

**Files:** none.

**Interfaces:** Consumes MJAPI's `ExecuteRemoteOperation` mutation (`ExecuteRemoteOperationInput { operationKey,
inputJSON, invokeMode }` → `{ success, errorMessage }`, GraphQL root `/`, API key header `x-mj-api-key`) and the M5.7
runner for the closing `pr` lane run (RV-0).

- [ ] Step 1: Build Engine and dashboards; run RV-0.
- [ ] Step 2: Refusal through MJAPI's generic Remote Operation mutation (`ExecuteRemoteOperation`, GraphQL root `/`,
  system key header `x-mj-api-key` = `$MJ_API_KEY` from your env file):

```bash
node --input-type=module -e '
const plan = { Goal: "check", TargetDefinition: { EntityName: "PS Truth: W1_MembershipYear", TargetVariable: "Renewed", ProblemType: "classification", SuccessMetric: "AUC" },
  CandidateSources: [], CandidateFeatures: [], LeakageNotes: [],
  ProposedExperiments: [{ Label: "lr", AlgorithmName: "logistic_regression", FeatureSet: ["AutoRenew"], Rationale: "check", Priority: 1 }],
  ValidationStrategy: { Strategy: "train_test_split", TestSize: 0.2, LockedHoldoutFraction: 0.2 }, ProposedBudget: { MaxRuns: 1 }, Approved: true };
const body = { query: "mutation($i: ExecuteRemoteOperationInput!){ ExecuteRemoteOperation(input: $i){ success errorMessage } }",
  variables: { i: { operationKey: "PredictiveStudio.StartExperimentSession", invokeMode: "attached", inputJSON: JSON.stringify({ planSpec: plan }) } } };
const res = await fetch("http://localhost:" + process.env.GRAPHQL_PORT + "/", { method: "POST",
  headers: { "Content-Type": "application/json", "x-mj-api-key": process.env.MJ_API_KEY }, body: JSON.stringify(body) });
console.log(JSON.stringify((await res.json()).data.ExecuteRemoteOperation));
'
```

  Expected: `{"success":false,"errorMessage":"Experiment sessions are switched off: …"}`.
- [ ] Step 3: Database checks:

```bash
sq "SELECT COUNT(*) FROM __mj.ExperimentSession WHERE __mj_CreatedAt >= DATEADD(minute, -30, GETUTCDATE())"   # → 0
```

- [ ] Step 4: UI check, automated (§9 D2-34), tiers chosen exactly as C4.5 Step 4 (d). Append to
  `e2e/specs/ps-containment.spec.ts` (the Studio's `section` query parameter opens the Experiments panel,
  `ps-studio-resource.component.ts`):

```ts
test.describe('Predictive Studio containment — experiment sessions switched off', () => {
  test('Studio → Experiments offers no new session and says why', async ({ page }) => {
    await page.goto('/app/predictive-studio/Studio?section=experiments', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ps-experiments-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('ps-experiments-new-btn')).toHaveCount(0);
    await expect(page.getByTestId('ps-experiments-new-btn-empty')).toHaveCount(0);
    const pastSessions = Number(process.env.PS_PAST_SESSIONS || '0');
    if (pastSessions > 0) {
      // Past sessions stay readable, under the switched-off notice.
      await expect(page.getByTestId('ps-experiments-unavailable')).toBeVisible();
      await expect(page.getByTestId('ps-experiments-kanban')).toBeVisible();
    } else {
      await expect(page.getByTestId('ps-experiments-empty')).toContainText('switched off');
    }
  });
});
```

```bash
# component tier — always runs (the C6.2 DOM tests on the real component):
(cd $MJ/packages/Angular/Explorer/dashboards && pnpm vitest run src/PredictiveStudio/components/ps-experiments.component.dom.test.ts)   # → 0 failed
# browser tier — when C4.5's sign-in check (re-run here) prints LOGIN_OK:
cd $MJ && PW_PROFILE_DIR=$MJ/.playwright-cli/profile-pr2 MJ_EXPLORER_URL=http://localhost:4221 node e2e/overlay/prime-auth.mjs | grep -q LOGIN_OK \
  && PW_BASE_URL=http://localhost:4221 PW_USER_DATA_DIR=$MJ/.playwright-cli/profile-pr2 \
     PS_PAST_SESSIONS=$(sq "SELECT COUNT(*) FROM __mj.ExperimentSession") \
     npx playwright test --config e2e/playwright.config.ts e2e/specs/ps-containment.spec.ts --grep "experiment sessions switched off"   # → 1 passed
```

  (`--grep "experiment sessions switched off"` runs only that test: after C5 the W1 logistic card is blocked by design, R-b, so the C4 tests are
  C4.5's alone.) Record the tier and the counts in §11.
- [ ] Step 5: Mutation checks (§6 shared notes): `ExperimentDepsBuilder.BuildProductionExperimentDeps` returning the resolver-wired deps →
  `ExperimentDepsBuilder.BuildProductionExperimentDeps refuses before touching the database` and `the action refuses an approved plan with
  EXPERIMENT_UNAVAILABLE …` red; the action's `instanceof ExperimentSessionsUnavailableError` branch deleted → the
  latter red (`EXPERIMENT_FAILED`); the `ps-experiments-pause` button restored in the header → `offers no New Experiment, Pause, Resume or Cancel …`
  and `explains why in the empty state …` red; the link's `Status` back to `Active` → `has no active link to Run
  Experiment Session` red; the job's `Status` → `Active` → `is Disabled, has no Action, and says it is not wired` red.

  **Release notes (conventions §5a):** after deploy, `Run Experiment Session` and
  `PredictiveStudio.StartExperimentSession` refuse with "Experiment sessions are switched off…" (they trained nothing
  before; any automation that called them now gets an error instead of a false `Completed`); the Studio shows past
  sessions read-only; the Model Development Agent loses the action (link `Revoked`, row kept). Sessions already marked
  `Completed` stay as they are — they trained nothing (F-EXP-1), and their rows are kept for the record. Goes to §10.

**Exit tests:**
- Engine `pnpm test` → +5 (2 action, 2 containment, 1 maintenance metadata), `0 failed`; dashboards `pnpm test` →
  +0 (two DOM tests rewritten), `0 failed`; builds `exit=0`; `npm run check:ui` passes.
- No gate is owned; the whole `pr` lane is re-run (RV-0, then `(cd $TS && pnpm run truth:run -- --mode pr)` →
  `truth:run exit=0`) and its report line reads
  `truth suite: pass 0 · fail 0 · xfail 1 · xpass 9 · not-implemented 99 · not-run 2 · error 0 (111 gates)` — PR 2's
  nine `pr` gates (G0.1, G0.4, G0.5, G0.7–G0.12) still `xpass`; PR 4's G0.3 `xfail` (its measured count recorded; an
  `xpass` there, `xfail 0 · xpass 10`, is recorded and not acted on — the path is unchanged, D-030); G0.2 (`nightly`)
  and G0.6 (`weekly`) `not-run`.
- The branch now has `metadata/` changes (C4.4, C5.1, C6.3, C6.4), so M-final.6's changeset is `minor`.

**Checkpoint commit:** `fix(ps): PR 2 C6 — experiment sessions switched off; maintenance job marked not wired; guide says what runs`


### M-final — Flip the Phase-0 gates, close out the PR  ·  parallel-safe: no  ·  depends on: M6, C1–C6

**Outcome:** PR 2's ten Phase-0 gates are `required` and green in their lanes (G0.2/G0.3 stay PR 4's `expected-fail`, program D-030); the deterministic integration tier passes;
PR 1's four shipped gates are reconciled (and G7.8 stays a stub until patch 04 per D2-45); the guide states shipped behaviour; the changeset is present; the PR is marked ready (`gh pr ready`; merging it is the human step of program
D-007, and no task waits on it).

#### Task M-final.1: Flip PR 2's ten gates

**Interfaces:** Consumes the registry (M2.2/M2.3), the ten PR 2 bodies of M5.9 and M5.10 (§4.1 gate map),
and every C milestone's `xpass` record in §11. G0.2 and G0.3 (`OwnerPR: 4`) are not flipped: their bodies stay
registered as `expected-fail` for PR 4 (program D-030). Run M-final.5 first (PR 1 `#5540` is merged on `origin/next`, so M-final.5 adds PR 1's four shipped `required` gates and changes the counts below).

- [ ] Step 1: Check every Phase-0 body is registered and present:
  `node -e 'const g=require("./gates/gates.json").filter(x=>x.Phase===0);console.log(g.map(x=>x.GateID+":"+x.Implementation.Kind).join(" "))'`
  (in `$TS`) → `G0.1:body G0.2:body G0.3:body G0.4:body G0.5:body G0.6:body G0.7:body G0.8:body G0.9:body
  G0.10:body G0.11:body G0.12:body`, and
  `node -e 'const g=require("./gates/gates.json").filter(x=>x.OwnerPR===2);console.log(g.length, g.map(x=>x.GateID).join(" "))'`
  → `10 G0.1 G0.4 G0.5 G0.6 G0.7 G0.8 G0.9 G0.10 G0.11 G0.12`. Each of the last C-milestone runs recorded in §11 must
  show its gates `xpass` (C1.4: G0.1; C3.4: G0.7; C4.5: G0.4, G0.5, G0.6 or its `not-run` note; C5.8: G0.8–G0.12;
  C6.6: PR 2's nine `pr` gates still `xpass`).
- [ ] Step 2: In `gates/gates.json` set `"Status": "required"` for the ten gates with `OwnerPR: 2` — G0.1, G0.4–G0.12
  (one edit); G0.2 and G0.3 stay `expected-fail`.
- [ ] Step 3: `pnpm run truth:registry -- --against origin/next` → `registry OK: 111 gates (required 10, expected-fail 101)`
  (`required 14, expected-fail 97` when M-final.5 bridged PR 1's four shipped gates in this PR, order A).
- [ ] Step 4: Local runs (RV-0 first): `(cd $TS && pnpm run truth:run -- --mode pr)` → report line
  `pass 9 · fail 0 · xfail 1 · xpass 0 · not-implemented 99 · not-run 2 · error 0` — PR 2's nine `pr` gates `pass`,
  PR 4's G0.3 `xfail` (`xfail 0 · xpass 1` when no W3 run published; recorded, not acted on), G0.2 and G0.6 `not-run`
  (`not-implemented 95 · not-run 6` with the bridge: the four bridged PR 1 gates are `nightly`); `gate nightly "W2 → C1.1"` →
  G0.2 `xfail` or `xpass` (PR 4's; record its `published` and `consistent` counts); with the bridge, on a
  host with bizapps-common installed at `BIZAPPS_COMMON_REF`, `TRUTH_BIZAPPS_COMMON=1 gate nightly "C1 → C2.1"` (and
  the other three: `C1 → C2.2`, `C1 → C2.3`, `C1 → C2.5`) → `pass`;
  G0.6 as C4.5 Step 3 decides it (§9 D2-33): with the `AI_VENDOR_API_KEY__GeminiLLM` line in your env file,
  `TRUTH_LIVE_MODEL=1 gate weekly "W1 → S9.3"` → G0.6 `pass`; without it, Step 5's `weekly` dispatch (keys from
  `GEMINI_API_KEY`) measures it — record the run id in §11 either way.
- [ ] Step 5: CI: dispatch `pr`, `nightly`, `weekly` on the branch (`gh workflow run ps-truth-suite.yml --ref
  ps/pr-2-truth-suite-containment -f mode=<lane>`) → all green, PR 2's ten Phase-0 gates `pass` in their lanes and
  G0.2/G0.3 report `xfail` or `xpass` (never `fail`: they are `expected-fail`); with
  M-final.5's bridge (order A), G7.1, G7.2, G7.3, G7.5 also `pass` in `nightly` and `weekly` (both install
  bizapps-common at `BIZAPPS_COMMON_REF`).

#### Task M-final.2: Verify Loom pin (`MemberJunction/loom` @ `63aec01f61a3f9e831fbf64bc9bac4675ac86d84`)

- [ ] Step 1: Per §9 `D2-48`, `fixtures/loom.json` is already pinned to `MemberJunction/loom` `origin/next` (`63aec01f61a3f9e831fbf64bc9bac4675ac86d84`) with no Loom companion PR required. Verify clean fetch and regeneration: `rm -rf .loom .data && pnpm run truth:loom && pnpm run test:regeneration` → `68 passed`.

#### Task M-final.3: Full verification

- [ ] Step 1: Every keep-list item of §4.3, with counts; the integration tier:
  `MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test suite "Integration Tests — Deterministic"` → `0 failed`
  (record passed/skipped).
- [ ] Step 2: `npm run check:ui`, `npm run check:standards`, `npm run check:esm`, `npm run check:changeset` → pass.
- [ ] Step 3: `node .github/scripts/check-migration-entityfield-sequence.mjs` → pass (C-milestone migrations, if any).
- [ ] Step 4: Re-run the README walkthrough (M6.5 Step 3, §9 D2-35) on the final branch head:
  `(cd $TS && pnpm run truth:readme -- --env "$MJ/.env.MJ_PS_PR2_<agent>")` → `<n> of <n> steps passed`; record it in §11.

#### Task M-final.4: Guide corrections (B15, F-DOC-2, setup)

**Files:** Modify `guides/PREDICTIVE_STUDIO_GUIDE.md` (and the PS package READMEs where they repeat a claim)

- [ ] Step 1: Locate each claim (run each `grep -n` in `guides/PREDICTIVE_STUDIO_GUIDE.md` and the PS READMEs; record line
  numbers in §11 before editing):

| Finding | Claim to find | Correct to (after C1–C6) | Wording owned by |
|---|---|---|---|
| F-DOC-19 | "never auto-published" / coin-flip models | the builder's bar is the point-estimate trust grade, so a model whose holdout AUC interval contains 0.5 can be published; auto-train publishes without reading the trust verdict (C2.1, D-030) | C2.1 for §6.x, §12.4, §13 item 4, §15.3; M-final.4 for any other occurrence |
| F-DOC-21 | "nothing leaky is promoted silently" (§13 item 5) | the leakage guard is a single-feature dominance check that misses restated and one-hot leaks (until PR 3); a promotion of a flagged model needs sign-off with a reason, but a model the guard does not flag is published by the agent or auto-train with no sign-off (D-030; PR 4 gates it) | M-final.4 |
| F-DOC-3, F-DOC-5 | "locked holdout … leading slice never seen by the search", `HoldoutMetrics` "the honest number" | the holdout is the trailing primary-key slice; the agent selects on it, so its number is optimistic (until PR 3) | M-final.4 (the rest of §5.1 after C5.7's first sentence) |
| F-DOC-4 | point-in-time assembly "never leaking the future" | an as-of setting that cannot change any feature is refused (C5); real point-in-time assembly arrives in PR 3 | C5.7 (§4.3); M-final.4 for any other occurrence |
| F-DOC-11 | `llm-derived` features persisted and version-pinned | the model reads the live column; no version pin (PR 5) | M-final.4 |
| F-DOC-17 | "cv-score" leaderboard column | the column is the holdout score × 0.98, not a CV score (C4 does not change it; PR 3 D3 deletes it) — state that | M-final.4 |
| F-DOC-18 | build forced only after approval, no-loop guard | state the shipped behaviour of the forced build (PR 5 fixes) | M-final.4 |
| F-DOC-23 | dry runs compute without mutating | `ScoreRecordSet` with `dryRun` writes nothing (C3); Feature Pipeline dry runs are PR 1's | C3.3 (§6.3); M-final.4 for any other occurrence |
| F-DOC-35 | validation "with overfitting detection"; k-fold/holdout offered | k-fold/holdout report out-of-sample results (C5); no overfitting detection exists | C5.7 (§5.1 first sentence) |
| F-DOC-36 | "and the Experiment Designer" queries the ranking matrix | remove the Designer from that sentence (no agent reads the matrix) | M-final.4 |
| F-DOC-7, F-DOC-8 | "waves through Record Set Processing", "one Process Run per wave", "clean, resumable" | in-process pool; no Process Run; pause relabels only | C6.5 (§7, §7.1); quote-checked here |
| F-DOC-2 | "6 typed Remote Operations", "4 Actions" (lines 3, 16, 19, 72; §10.1; §10.2) | 7 Remote Operations (add `PredictiveStudio.CreateScoringProcess` to the §10.1 table) and 5 Actions (add `Schedule Model Scoring` to §10.2) — verify the counts first: `python3 -c "import json;print(len([r for r in json.load(open('metadata/remote-operations/.remote-operations.json')) if 'PredictiveStudio.' in json.dumps(r['fields'])]))"` → 7; count the top-level records of `metadata/actions/predictive-studio/.predictive-studio-actions.json` → 5 | M-final.4 |

  M-final.4 does not rewrite a sentence a C milestone owns (§9 D2-30); for those rows it only runs the quote check
  (Step 2) and corrects occurrences outside the C-owned sections.
  Each corrected sentence must be true of the code at that moment; where a later PR changes it again, the later PR
  re-corrects it (M3 rule). Do not describe planned behaviour as shipped.
- [ ] Step 2: Quote check: for every corrected sentence, run the command or test that proves it (gate result, unit test,
  `grep`), and list sentence → evidence in §11.

#### Task M-final.5: Reconcile PR 1's gate tests (D-009, D-025, D2-45)

PR 1 (`#5540`) shipped four of its five Phase-7 gates (`G7.1` `C1 -> C2.1`, `G7.2` `C1 -> C2.2`, `G7.3` `C1 -> C2.3`, `G7.5` `C1 -> C2.5`) as
`MJ: Tests` rows of type Integration Test in the suite `Predictive Studio Gates — Feature Pipelines`
(`metadata-optional/integration-test/tests/gates/`, `…/test-suites/.ps-gates-feature-pipelines-suite.json`), with check bundles in `@memberjunction/integration-test-suite` and bizapps-common's job-title
Feature Pipeline as their subject. `G7.8` (`C1 → C3.3`) was extracted from PR 1 in PR 1 §13 into patch 04 (`patches/04-agent-framework-strict-parameters.md`), so `G7.8` stays `Implementation: { Kind: "stub" }`, `Status: "expected-fail"` here (`D2-45`). Note also that the `MJ: Tests` row names use ASCII `->` (`C1 -> C2.1`), while the registry `TestName`s use Unicode `→` (`C1 → C2.1`), so the bridge maps `→` to `->` when invoking `mj test run --name` (`D2-45`). They are not vitest files, so they are registered as `body` bridges that run the
row with the MJ CLI (program decision D-025), never as `external`.

**Files:** Create `packages/AI/PredictiveStudio/TruthSuite/gates/feature-pipelines.gates.test.ts` (order A) · Modify
`packages/AI/PredictiveStudio/TruthSuite/gates/gates.json` (order A), `packages/AI/PredictiveStudio/TruthSuite/package.json`
(add `"@memberjunction/testing-engine-base"` at the version of the other `@memberjunction/*` dependencies, then
`pnpm install` at the repo root; order A), `.github/workflows/ps-truth-suite.yml` (`BIZAPPS_COMMON_REF`, order A)

**Interfaces:** Consumes `TruthGate.Define` / `GateMeasurement` (M2.5), the `bizapps-common` requirement (`TRUTH_BIZAPPS_COMMON=1`,
M2.3/M2.5, §5.2), the workflow's bizapps-common install and `BIZAPPS_COMMON_REF` pin (M6.1, §9 D2-32), the
validator's literal-title rule (M2.3), and `mj test run --name <name> --format json --output
<file>` (`packages/MJCLI/src/commands/test/run.ts` → `@memberjunction/testing-cli` `RunCommand`: a name that is not a
test ID resolves by name; with `--output` the `TestRunResult` JSON is written to the file; the process exits 0 only for
`Passed`/`Skipped` and 1 for a failed test **and** for "Test not found" or a crash, so the bridge reads the file, not the
exit code). Produces the four bridged registry entries (`G7.1`, `G7.2`, `G7.3`, `G7.5`).

- [ ] Step 1: Confirm order A applies (PR 1 `#5540` is merged on `origin/next`):
  `git fetch origin && git ls-tree -r --name-only origin/next metadata-optional/integration-test/test-suites/.ps-gates-feature-pipelines-suite.json`
  → one line: PR 1 merged first (**order A**, Steps 2–4).
- [ ] Step 2 (order A): create `gates/feature-pipelines.gates.test.ts`:

```ts
/**
 * The Feature Pipeline gates shipped in PR 1 (C1 → C2.1, C2.2, C2.3, C2.5; G7.8 C1 → C3.3 was extracted to patch 04).
 * Each is an `mj test` row of the suite "Predictive Studio Gates — Feature Pipelines" (whose Name uses ASCII `->`);
 * this file runs the row through the MJ CLI and reports its status to the truth-suite registry.
 * The four TruthGate.Define calls are literal so the registry validator finds each title exactly once.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SafeJSONParse } from '@memberjunction/global';
import type { TestRunResult } from '@memberjunction/testing-engine-base';
import { TruthGate } from '../src/gates/define-gate';
import type { GateMeasurement } from '../src/gates/results';

/** gates/ → TruthSuite → PredictiveStudio → AI → packages → repository root (where mj.config.cjs loads the check bundles). */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The fields of the `TestRunResult` JSON `mj test run --output` writes that this bridge reads (derived, not restated). */
type MJTestRunJSON = Pick<TestRunResult, 'testRunId' | 'testName' | 'status' | 'passedChecks' | 'failedChecks' | 'totalChecks'>;

/**
 * The stderr an `execFileSync` failure carries. `unknown` on purpose: a catch boundary, narrowed by `in`/`instanceof`
 * before any field is read.
 */
function stderrOf(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'stderr' in e) {
    const stderr: unknown = e.stderr;
    if (typeof stderr === 'string') return stderr;
    if (Buffer.isBuffer(stderr)) return stderr.toString('utf8');
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Run one `mj test` row by name and turn its result into a gate measurement. Passed → threshold met; Failed → not met
 * (a measurement); no result file, or Skipped / Error / Timeout → the bridge could not measure, so it throws and the
 * gate's outcome is `error` (which always fails the run).
 */
function runMJTest(testName: string): GateMeasurement {
  const mjRowName = testName.replace('→', '->');
  const dir = mkdtempSync(path.join(tmpdir(), 'truth-mj-test-'));
  const resultFile = path.join(dir, 'result.json');
  let stderr = '';
  try {
    execFileSync('node', ['packages/MJCLI/bin/run.js', 'test', 'run', '--name', mjRowName, '--format', 'json', '--output', resultFile], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MJ_INTEGRATION_TEST: '1', RUN_MUTATION_TESTS: '1' },
    });
  } catch (e) {
    stderr = stderrOf(e); // exit 1 is also a failed test; the result file decides
  }
  try {
    if (!existsSync(resultFile)) {
      throw new Error(`mj test run --name "${mjRowName}" wrote no result: ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
    }
    const parsed = SafeJSONParse<MJTestRunJSON | MJTestRunJSON[]>(readFileSync(resultFile, 'utf8'));
    if (!parsed) {
      throw new Error(`mj test run --name "${mjRowName}" wrote invalid JSON in ${resultFile}`);
    }
    const runs = Array.isArray(parsed) ? parsed : [parsed];
    const unmeasured = runs.find((r) => r.status !== 'Passed' && r.status !== 'Failed');
    if (unmeasured) {
      throw new Error(`mj test run "${mjRowName}" ended ${unmeasured.status} (MJ: Test Runs ${unmeasured.testRunId})`);
    }
    const passed = runs.every((r) => r.status === 'Passed');
    const last = runs[runs.length - 1];
    return {
      Passed: passed,
      Measured: { testRunId: last.testRunId, status: last.status, iterations: runs.length,
        passedChecks: last.passedChecks, failedChecks: last.failedChecks, totalChecks: last.totalChecks },
      Detail: `mj test run "${mjRowName}": ${runs.map((r) => r.status).join(', ')}; ${last.passedChecks}/${last.totalChecks} checks (MJ: Test Runs ${last.testRunId})`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

TruthGate.Define('C1 → C2.1', async () => runMJTest('C1 → C2.1'));
TruthGate.Define('C1 → C2.2', async () => runMJTest('C1 → C2.2'));
TruthGate.Define('C1 → C2.3', async () => runMJTest('C1 → C2.3'));
TruthGate.Define('C1 → C2.5', async () => runMJTest('C1 → C2.5'));
```

- [ ] Step 3 (order A): point the four shipped registry entries (`G7.1`, `G7.2`, `G7.3`, `G7.5`) at the bridge (in `$TS`):

```bash
node -e '
const fs = require("fs");
const file = "gates/gates.json";
const reg = JSON.parse(fs.readFileSync(file, "utf8"));
for (const g of reg.filter((x) => ["G7.1", "G7.2", "G7.3", "G7.5"].includes(x.GateID))) {
  g.RunMode = "nightly";
  g.Requires = ["bizapps-common"];
  g.Implementation = { Kind: "body" };   // found by the titles gates/feature-pipelines.gates.test.ts declares
}
fs.writeFileSync(file, JSON.stringify(reg, null, 2) + "\n");'
pnpm run truth:registry      # → registry OK: 111 gates (required 0, expected-fail 111) — before M-final.1
```

  (`G7.8` stays `Implementation: { Kind: "stub" }`, `Status: "expected-fail"` until patch 04 lands, D2-45.) The statuses stay `expected-fail` until Step 4 has measured them.
- [ ] Step 4 (order A): pin CI to PR 1's companion, measure locally, flip, then measure in CI.
  1. The four gates run against the job-title pipeline as PR 1's bizapps-common companion (`MemberJunction/bizapps-common#354`) left it (scope filter,
     golden set, taxonomy), so the workflow's pre-companion pin (`main` @ `172b99a5fe`) cannot pass them. The companion
     was opened from fork `arie-glazier-bcc/bizapps-common`, so query it by PR number (`D2-47`):
     `gh pr view 354 -R MemberJunction/bizapps-common --json number,state,headRefOid,mergeCommit`
     → PR #354 (`headRefOid`: `76809d340e450905f1c80730a62ad3485aabeca0`). `MERGED`: set `BIZAPPS_COMMON_REF` in `.github/workflows/ps-truth-suite.yml` to its full
     `mergeCommit.oid` and the comment above it to "PR 1 companion #354, merge commit". `OPEN`: set it to the full
     `headRefOid` (`76809d340e450905f1c80730a62ad3485aabeca0`; GitHub keeps it fetchable through `refs/pull/354/head`, and `git fetch --depth 1 origin $BIZAPPS_COMMON_REF` fetches it by full SHA),
     the comment to "PR 1 companion #354 head — re-pin to its merge commit when it merges", and record that re-pin
     in §11 and in PR 1's plan §11 as the next step when #354 merges.
  2. Measure locally with bizapps-common installed at that commit (PR 1 plan §2.4, with the clone checked out at the
     pin: `git -C <bizapps-common clone> fetch origin 76809d340e450905f1c80730a62ad3485aabeca0 && git -C <bizapps-common clone> checkout 76809d340e450905f1c80730a62ad3485aabeca0`): build
     `@memberjunction/integration-test-suite` (`cd $MJ/packages/TestingFramework/integration-test-suite && pnpm run build`;
     the repository `mj.config.cjs` loads its `dist/` as `testing.checkModules`), run RV-0, then
     `for g in "C1 → C2.1" "C1 → C2.2" "C1 → C2.3" "C1 → C2.5"; do TRUTH_BIZAPPS_COMMON=1 gate nightly "$g"; done`
     and `outcome G7.1` … `outcome G7.5` → `xpass` with `status: "Passed"` each. Without `TRUTH_BIZAPPS_COMMON=1` each
     reports `not-run` ("requires bizapps-common: …"); the `pr` lane always reports that (it does not install
     bizapps-common and does not select `nightly` gates).
  3. Set the four (`G7.1`, `G7.2`, `G7.3`, `G7.5`) to `"Status": "required"` (M-final.1's counts become `required 14, expected-fail 97`).
  4. CI measures them: `gh workflow run ps-truth-suite.yml --ref ps/pr-2-truth-suite-containment -f mode=nightly` →
     green, the `bizapps-common` step's summary names the new pin, and G7.1, G7.2, G7.3, G7.5 `pass` in the
     report (each result's `Measured.testRunId` is an `MJ: Test Runs` row of that job). Record the run id in §11.
- [ ] Step 5 (order B — historical, not taken since PR 1 `#5540` merged first): skipped.

#### Task M-final.6: Changeset, PR ready

- [ ] Step 1: `.changeset/ps-truth-suite-containment.md` (hand-written). Level `minor`: the branch has `metadata/`
  changes (C4.4, C5.1, C6.3, C6.4 — confirm with `git diff --name-only origin/next...HEAD -- migrations metadata`
  → non-empty). Packages (one line each): `@memberjunction/predictive-studio-sidecar` (M1, C5.2),
  `@memberjunction/predictive-studio` (M1, C1–C6), `@memberjunction/predictive-studio-core` (M5.10, C4.1, C4.2, C4.4, C5.4, C5.5),
  `@memberjunction/ng-dashboards`
  (M5.10, C4.2, C4.3, C5.5, C6.2), `@memberjunction/ng-core-entity-forms` (C4.3), plus any other package
  `npm run check:changeset` names (`@memberjunction/codegen-lib` and `@memberjunction/metadata-sync` are NOT modified per D2-43; the private TruthSuite package needs no entry). `npm run check:changeset` → OK.
- [ ] Step 2: Final handoff entry; update `program/STATUS.md` and the PR description (§10) with the measured runtime,
  the ten gates' final measured values (and G0.2/G0.3's measured counts for PR 4), the Loom pin (its merge commit,
  or the companion head plus the merge order, M-final.2 Step 3), the release notes and remediation paths, and the
  mutation-check results from §11 (each "not exposed" row with its reason); mark the PR ready with `gh pr ready <number>`, and the
  Loom companion too when it is still a draft (`gh pr ready <number> -R MemberJunction/loom`). No review step follows:
  merging is the human step of program D-007.

**Exit tests (M-final):** the three CI lanes green with PR 2's ten gates `pass` in their lanes (plus PR 1's four shipped gates in
`nightly`/`weekly` with the order-A bridge), G0.2/G0.3 `xfail` or `xpass`; integration tier `0 failed`; keep-list counts recorded;
`check:*` scripts pass.

**Checkpoint commit:** `feat(ps): PR 2 — Phase-0 gates required; guide corrections; changeset`

## 7. Verification

**Unit (every touched package; counts recorded in §11):**

```bash
cd $MJ/packages/AI/PredictiveStudio/Sidecar && pnpm test && pnpm run test:python
cd $MJ/packages/AI/PredictiveStudio/Core && pnpm test
cd $MJ/packages/AI/PredictiveStudio/Engine && pnpm test && pnpm run test:integration
cd $MJ/packages/AI/PredictiveStudio/TruthSuite && pnpm test && pnpm run test:python && pnpm run test:python -- -m slow && pnpm run test:regeneration && pnpm run test:db
cd $MJ/packages/CodeGenLib && pnpm test
cd $MJ/packages/MetadataSync && pnpm test
cd $MJ/packages/Angular/Explorer/dashboards && pnpm test
cd $MJ/packages/TestingFramework/integration-test-suite && pnpm test
cd $MJ/packages/Angular/Explorer/core-entity-forms && pnpm test          # C4.3
```

Expected deltas from the containment milestones over the start-of-C1 counts (each milestone's exit tests list them):
Engine +10 (C1) +0 (C2, guide only) +11 (C3) +4 (C4) +9 (C5) +5 (C6); Core +6 (C4) +16 (C5); Sidecar Python +18 (C5); dashboards
+9 (C4) +1 (C5), with two DOM tests rewritten in C6; core-entity-forms +3 (C4); TruthSuite +2 (C4.5) +3 (C5.6). All with
`0 failed`. Builds `exit=0` for every touched package; `npm run check:ui` passes (C4.2's new CSS uses tokens only).

**Integration tier:** `MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 pnpm mj test suite "Integration Tests — Deterministic"`
→ 0 failed (IT14 among the passes).

**Gate tests:** `pnpm --filter @memberjunction/predictive-studio-truth-suite run truth:run -- --mode pr|nightly|weekly`
with the sidecar and MJAPI started as in M5.7 (C milestones: RV-0). After M-final the report lines read: `pr` →
`pass 9 · fail 0 · xfail 1 · xpass 0 · not-implemented 99 · not-run 2 · error 0` (PR 4's G0.3 is the `xfail`; an
`xpass` in its place is recorded, not acted on); `nightly` → `pass 9`, G0.2 and G0.3 `xfail` or `xpass`, `not-run 1`
(G0.6); `weekly` with live-model keys → `pass 10`, G0.2/G0.3 as in `nightly`, the W8 stubs `not-implemented` like every
stub. G0.2/G0.3 are PR 4's `expected-fail` gates (program D-030) and never `fail` in a PR 2 run. With
PR 1's bridge in place (M-final.5 order A) `not-implemented` is 94 and the five PR 1 gates `pass` in the `nightly` and
`weekly` lanes, which install bizapps-common at the workflow's `BIZAPPS_COMMON_REF` and set `TRUTH_BIZAPPS_COMMON=1`
(§5.9, §9 D2-32); locally they report `not-run` ("requires bizapps-common") unless `TRUTH_BIZAPPS_COMMON=1` on a host
with bizapps-common installed (PR 1 plan §2.4). Before PR 1's gates are bridged (order B), both lanes still install
bizapps-common and the five report `not-implemented` like every stub. Before
M-final.1, each C milestone's gates report `xpass` (§4.1 gate map). The registry check
`pnpm run truth:registry -- --against origin/next` passes.

**Runtime checks (database, with your env file loaded):**

```bash
# the test schema is registered and nothing else changed scope
sqlcmd … -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.Entity WHERE SchemaName='pstruth'"            # → 44
sqlcmd … -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.Entity WHERE Name LIKE 'PS Truth:%' AND SchemaName<>'pstruth'"   # → 0
# truth never enters the database
sqlcmd … -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id WHERE SCHEMA_NAME(t.schema_id)='pstruth' AND c.name IN ('TrueP','TrueValue','OriginMean','OneStepMean','PopulationMean')"   # → 0
# suite models are identifiable; record their statuses after a full run
sqlcmd … -h -1 -W -Q "SET NOCOUNT ON; SELECT m.Status, COUNT(*) FROM __mj.vwMLModels m WHERE m.Pipeline LIKE 'PSTruth:%' GROUP BY m.Status"
```

(The last query: Published rows come from the agent runs — G0.2, G0.3 and G0.12's Pipeline Builder runs publish a
winner its trust verdict clears, as on `next` (program D-030) — and from the two `PSTruth: UI W1 …` models C4.5's UI
fixture (`truth:ui-fixture`) publishes through the promote operation. G0.2/G0.3 count only their own runs' models; PR 4 makes the automated path refuse noise and leaks.)

**Containment runtime checks** (each milestone's runtime task has the full set; with `sq` from RV-0):

```bash
# C1 — an explicit cap that would truncate a scoring scope is refused (C1.4 Step 4's mutation), nothing written
sq "SELECT COUNT(*) FROM pstruth.W1_MembershipYear WHERE TruthScore IS NOT NULL"                                  # → 0
# C2 / D-030 — the automated publish path is unchanged: the agent keeps Promote ML Model; Run Experiment Session is revoked (C6)
sq "SELECT a.Name + '|' + aa.Status FROM __mj.AIAgentAction aa JOIN __mj.Action a ON a.ID = aa.ActionID JOIN __mj.AIAgent ag ON ag.ID = aa.AgentID
    WHERE ag.Name = 'Model Development Agent' AND a.Name IN ('Promote ML Model', 'Run Experiment Session') ORDER BY a.Name"   # → Promote ML Model|Active, Run Experiment Session|Revoked
git diff --stat origin/next...HEAD -- packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder.ts   # → no output
# C4 — no causal wording left in the agent prompt
sq "SELECT COUNT(*) FROM __mj.TemplateContent WHERE TemplateText LIKE '%which features mattered most%'"            # → 0
# C5 — every time-indexed suite model stores the withheld reason
sq "SELECT COUNT(*) FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.11%' AND JSON_VALUE(m.Lineage,'$.evaluation.WithheldReason') IS NULL
      AND m.__mj_CreatedAt >= '$T0'"                                          # → 0 (T0 exported before the run, as in C5.8 Step 2)
# C5 / D2-C5d — G0.12's models record the default majority-baseline rule
sq "SELECT COUNT(*) FROM __mj.MLModel m JOIN __mj.MLTrainingPipeline p ON p.ID = m.PipelineID
    WHERE p.Name LIKE 'PSTruth: G0.12%' AND m.__mj_CreatedAt >= '$T0'
      AND ISNULL(JSON_VALUE(m.Lineage,'$.evaluation.MajorityBaselineRule'), '') <> 'enforce'"              # → 0
# C6 — experiment sessions cannot start; the maintenance job is labelled and disabled
sq "SELECT Name, Status FROM __mj.ScheduledJob WHERE ID = '2CCE4280-9B29-4DCC-86A4-E5AF765909D1'"                 # → Predictive Studio Maintenance (not wired)|Disabled
```

## 8. Refresh procedure for this PR

Canonical procedure: `program/conventions.md` §7. This PR's specifics:

- **(a) Kickoff:** run the anchor check and every assumption below before copying the plan into MJ. Re-run
  `node tools/check-anchors.mjs plans/PR-2-truth-suite-containment.md <mj-checkout> origin/next`; anchors with
  `"repo": "loom"` / `"ps-review"` are skipped by the tool — the scripted check at the end of this section verifies them.
- **(b) Dependency merged:** PR 2 depends on no PR. Trigger (b) fires when **PR 1 merges** (M-final.5 switches to order
  A: add the D-025 bridge for its five `mj test` rows; read PR 1's final plan §11 and confirm the five row names still
  equal the registry `testName`s and the suite file of A18) and when the **Loom companion PR merges** (M-final.2 re-pin). When **PR 2 merges**, PR 3 and PR 6 (J1–J2)
  run their trigger (b) against this plan's §5.2 (registry format), §5.7 (harness) and §5.8 (containment probe).
- **(c)** `next` merged into the branch and the merge touched any anchored MJ file (`git diff --name-only <old>..HEAD`
  against the anchor list). The `ctn-*` anchors (§5.11, second block) cover every product line C1–C6 replaces; one that
  is `changed` means the containment task's "replace X with Y" step no longer matches the code — re-read the file,
  rewrite the step against the new code, and record the change in §9. The `ctn-c2-*` code anchors (builder publish,
  auto-train publish, promote-gate transitions and artifact check) cover the behaviour C2.1's guide sentences describe
  and PR 2 leaves unchanged (program D-030); one that is `changed` means a sentence must be re-checked. The `bridge-*` and `story-*` anchors cover the
  CLI and agent APIs M-final.5 and M5.6's story step call.
- **(d)** Session start with the last refresh older than 7 days.

**Assumption checks** (run from the MJ checkout at the ref being checked, unless stated):

- [ ] A1 `git show origin/next:packages/AI/PredictiveStudio/Sidecar/scripts/setup-python.mjs | grep -c "for (const candidate of \['python3', 'python'\])"` → `1` (before M1 lands; after: `0`).
- [ ] A2 `git grep -c "PREDICTIVE_STUDIO_PYTHON" origin/next -- packages/AI/PredictiveStudio` → no output (0 matches) before M1.
- [ ] A3 `git show origin/next:packages/AI/PredictiveStudio/Sidecar/src/python/requirements.txt | grep -E "^(numpy|scipy|scikit-learn)=="` → `scikit-learn==1.4.2`, `numpy==1.26.4` and no scipy line (M1.4 adds it). If numpy moved to ≥ 2, re-check the 3.13 restriction in `python-probe.mjs` and record a §9 decision.
- [ ] A4 `git show origin/next:packages/AI/PredictiveStudio/Engine/src/feature-assembly/data-access.ts | grep -c "IgnoreMaxRows: params.MaxRows == null"` → `1` (training-read cap lifted by #5295; G0.1's training half passes today).
- [ ] A5 `git show origin/next:packages/AI/PredictiveStudio/Engine/src/actions/promote-model.gate.ts | grep -A4 "ALLOWED_TRANSITIONS: Readonly" | grep -c "Draft: \['Validated'\]"` → `1` (G0.7's fixture path Draft → Validated → Archived).
- [ ] A6 `git ls-remote https://github.com/MemberJunction/loom next` → a sha; `git -C <loom clone> log --oneline 63aec01f61..origin/next | wc -l` → record; any new commit touching `packages/engine/src/{simulation,math}` must be checked by `pnpm run test:regeneration` before re-pinning.
- [ ] A7 `npm view @memberjunction/loom-engine version 2>&1 | grep -c E404` → `1` (still unpublished; if published, §9 D2-03 may switch to the npm package — record a decision).
- [ ] A8 `git show origin/next:packages/CodeGenLib/src/Database/manage-metadata.ts | grep -c "refreshMetadataBeforeVirtualEntitySync\|generatedFieldMetadata"` → `≥ 1` (`F-ENV-12` landed upstream on `origin/next`; M1.6 is read-only verification per D2-43).
- [ ] A9 `git show origin/next:packages/MetadataSync/src/services/ValidationService.ts | grep -c "effectiveFilePattern"` → `≥ 1` (`F-L2-1` landed upstream on `origin/next`; M1.7 is read-only verification per D2-43).
- [ ] A10 `git show origin/next:.github/workflows/integration.yml | grep -c "mcr.microsoft.com/mssql/server:2022-latest"` → `≥ 1` (5 at `c92d4a47f9`; the provisioning M6.1 mirrors).
- [ ] A11 `git show origin/next:packages/AI/PredictiveStudio/Engine/src/agent/pipeline-builder.ts | grep -c "trust.canAct"` → `≥ 1` and `… | grep -c "model.Status = 'Published';"` → `1` (the builder still publishes a trust-cleared winner directly — the path PR 4's G0.2/G0.3 bodies measure and C2.1's guide sentences describe; PR 2 leaves it, program D-030. If PR 4 has merged and changed it, re-read C2.1's sentences against the new code).
- [ ] A12 `git show origin/next:packages/TestingFramework/testing-integration/src/bootstrap-client.ts | grep -c "export async function BootstrapIntegrationClient"` → `1` (harness connect).
- [ ] A13 `git -C /Users/arieglazier/repos/ps-review rev-parse --short=10 HEAD` → `d47dfb86f1` and `git -C /Users/arieglazier/repos/ps-review status --short --untracked-files=no | wc -l` → `0` (the port sources are unchanged).
- [ ] A14 `git show origin/next:pnpm-workspace.yaml | grep -c "packages/AI/PredictiveStudio/\*"` → `1`.
- [ ] A15 (C2.1, program D-030) `git show origin/next:packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts | grep -c "for (const targetStatus of \['Validated', 'Published'\] as const)"` → `1` and `… | grep -c "canAct\|DeriveTrustVerdict"` → `0` (auto-train publishes without reading the trust verdict, as C2.1's §6.x sentence says; PR 2 leaves it, so the result is the same after PR 2 merges — PR 6's A-10 and PR 4 read it; a change means PR 4 has gated it and C2.1's sentence is re-corrected there).
- [ ] A16 (C3.2) `git show origin/next:packages/AI/PredictiveStudio/Engine/src/operations/score-record-set.operation.ts | grep -c "dryRun"` → `0` (the operation drops `dryRun`; C3.2 forwards it).
- [ ] A17 (M-final.5 bridge) `git show origin/next:packages/TestingFramework/CLI/src/commands/run.ts | grep -c "test = engine.GetTestByName(flags.name);"` → `1` and `… | grep -c "OutputFormatter.writeToFile(output, flags.output);"` → `1` (`mj test run --name … --output <file>` writes the `TestRunResult` JSON the bridge reads).
- [ ] A18 (M-final.5 order) `git ls-tree -r --name-only origin/next metadata-optional/integration-test/test-suites/.ps-gates-feature-pipelines-suite.json | wc -l` → `1` (`#5540` merged on `origin/next` → M-final.5 order A, bridging the 4 shipped rows `G7.1`, `G7.2`, `G7.3`, `G7.5`; `G7.8` extracted to patch 04 per D2-45).
- [ ] A19 (G0.7 fixture, G0.4/G0.5/G0.6 Validated model) `git show origin/next:packages/AI/PredictiveStudio/Engine/src/actions/promote-model.gate.ts | grep -c "DeriveTrustVerdict\|canAct"` → `0` (the promotion gate does not read the trust verdict, so the promote operation to Validated still succeeds for the W1 logistic model after C5 grades it Poor).
- [ ] A20 (C5.5) `git show origin/next:packages/AI/PredictiveStudio/Core/src/trust.ts | grep -c "bestMetrics(model: TrustModelInput)"` → `1` (in-sample `Metrics` fallback still present; C5.5 replaces it).
- [ ] A21 (C5.4, D2-C5d: the rule lives in the existing JSON column and survives the Studio editor)
  `git show origin/next:packages/AI/PredictiveStudio/Core/src/pipeline-spec.ts | grep -c "MajorityBaselineRule"` → `0`
  (C5.4 adds it); `git show origin/next:packages/Angular/Explorer/dashboards/src/PredictiveStudio/components/ps-pipelines.component.ts | grep -c "p.ValidationStrategy = JSON.stringify(this.EditValidation);"`
  → `1` and `… | grep -c "this.EditValidation = this.parse<ValidationStrategy>(p.ValidationStrategy,"` → `1` (the editor
  parses the whole object and writes it back, so a key it has no control for is kept; if it starts rebuilding the
  object field by field, C5.7's "the editor keeps the value" sentence is false — add the field to the rebuild and
  record it in §9).
- [ ] A22 (M6.1, D2-32) `git ls-remote https://github.com/MemberJunction/bizapps-common.git refs/heads/main` → a sha;
  `gh repo view MemberJunction/bizapps-common --json visibility --jq .visibility` → `PUBLIC` (no CI secret needed; if
  it became private, add a read-only deploy token secret and record a §9 decision); at the pinned
  `BIZAPPS_COMMON_REF` `mj-app.json` `mjVersionRange` includes MJ `next`'s version
  (`git show origin/next:packages/MJCore/package.json | grep '"version"'`; at writing `">=6.1.5 <7.0.0"` vs
  `6.2.0-edge.3`) — `mj migrate --dir` does not read the manifest, so a range that excludes `next` is a signal to
  re-check the pin, not a CI failure.

**Scripted check for non-MJ anchors** (the plans repo's `tools/check-anchors.mjs` functions, each anchor read at its
own `atCommit`; before M3.1–M3.2 the Loom anchors sit at `63aec01f61`; when a Loom fix changes one, the same commit
updates its `atCommit` to the pinned sha and its `pattern` to the fixed code). `$LOOM` is a Loom clone (§2.2) fetched
past the pin (`git -C $LOOM fetch origin`); `PLAN` is this file (the plans-repo path, or
`$MJ/plans/predictive-studio/PR-2-truth-suite-containment.md` once the PR has started):

```bash
cat > /tmp/check-ext-anchors.mjs <<'EOF'
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extractAnchors, classify } from '/Users/arieglazier/repos/ps-rebuild-plans/tools/check-anchors.mjs';
const [plan, loom] = process.argv.slice(2);
const roots = { loom, 'ps-review': '/Users/arieglazier/repos/ps-review' };
let bad = 0;
for (const a of extractAnchors(readFileSync(plan, 'utf8')).filter((x) => (x.repo || 'mj') !== 'mj')) {
  let text = null;
  try { text = execFileSync('git', ['-C', roots[a.repo], 'show', `${a.atCommit}:${a.file}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { text = null; }
  const r = classify({ ...a, repo: 'mj' }, text);
  if (r.status !== 'ok' && r.status !== 'moved') bad += 1;
  console.log(`${r.status.padEnd(8)} ${a.repo} ${a.id} @ ${a.atCommit} (${r.detail})`);
}
console.log(`# non-MJ anchors not found: ${bad}`);
process.exitCode = bad > 0 ? 1 : 0;
EOF
node /tmp/check-ext-anchors.mjs "$PLAN" "$LOOM"     # → 9 lines "ok", "# non-MJ anchors not found: 0"
```

On a host without ps-review (§9 D2-36) its three anchors print `missing`; record them as "ps-review absent on this
host" in §12 — the port sources they describe are already verified by sha256 prefix in M3.4/M5.2/M5.4.

## 9. Risks, open questions, decisions

### Decisions (PR-local)

- **D2-01 · Where the suite lives: a new private package `packages/AI/PredictiveStudio/TruthSuite`, run by vitest, not
  inside the Engine package and not as `mj test` bundles.** The Engine is a published package; the suite brings
  generators, fixtures (≈ 1.2 MB of JSON and parquet), a Python package, a GraphQL client, a server-side agent leg and
  `mssql` — none of which belongs in a published package's dependency list, and R-TEST's location
  (`Engine/src/__tests__/integration/truth-suite/`) would put them there. The `mj test` catalog is single-process with
  one provider (server or client), a 5-minute default per test and serial bundles; the truth suite needs a GraphQL client
  *and* a server-provider child process, a sidecar, generated data and runs of 10–40 minutes — the integration guide
  already sends sidecar-dependent PS flows to standalone rigs (§2.5, §3.5). The private-package pattern copies
  `@memberjunction/integration-test-suite`. Results still reach tooling MJ already has: `outcomes.json` in the
  `EMIT_OUTCOMES` shape. Rejected: Engine `__tests__` (published-package bloat, Python inside a TS package), `mj test`
  bundles (process model and timeouts), `rigs/` scripts (no registry, no named tests).
- **D2-02 · Python boundary: the judges and the reference pipeline get their own venv (`TruthSuite/.venv`) whose
  requirements start with `-r` the sidecar's pins and add statsmodels, patsy, pyarrow, mypy, pandas-stubs; scipy is
  pinned in the product sidecar requirements.** The product sidecar image must not carry test-only libraries; the
  shared `-r` keeps numpy/pandas/scikit-learn identical between judge and sidecar; pinning scipy in the product file
  removes the one transitive version that could differ. One interpreter-probing implementation (the sidecar's) serves
  both. Rejected: everything in the sidecar venv (R-TEST's proposal; ships test libraries to production), an unrelated
  pin set (judge and sidecar could disagree numerically).
- **D2-03 · Loom: a pinned git checkout of the public `MemberJunction/loom` repo, built by `fetch-loom.mjs` into a
  git-ignored `.loom/<sha>` and cached by sha; not an npm dependency, not vendored, no generated CSVs committed.**
  Loom is public, unpublished on npm (E404), a pnpm workspace whose engine depends on `workspace:*` contracts (so a git
  dependency in MJ's lockfile would not resolve), BUSL-1.1 with the same licensor as MJ (so the licence raises nothing a
  checkout does not already). PR 2 changes Loom (F-LOOM-1..4, -6), so a pin to the Loom commit that carries those fixes (and passes M3.6's regeneration check) is required anyway;
  vendoring would fork those fixes. Generated CSVs: all base seeds are ≈ 100–150 MB and the 400-seed sets ≈ 1.4 GB for C2
  alone — too big for git; regeneration takes < 1 s per world. The fixture fallback R-TEST allows is not needed: the
  regeneration check (M3.6) proves bytes, and the golden hashes travel in the plan.
- **D2-04 · Seeds and caching:** fixed seed sets (§5.4: W2 100–159 and 100–499; scenarios `[seed, seed·1000+1 … +399]`);
  cache key = canonical spec + generator source + Loom sha; base and T2 seeds cached, 400-seed sets streamed
  (generate → use → delete, hashes logged). Rejected: caching 400-seed sets (GBs), random seeds (irreproducible gates).
- **D2-05 · Test entities: a test-only schema `pstruth` created by a migration inside TruthSuite with its scoped CodeGen
  output appended once, applied by `mj migrate --schema pstruth --dir …`.** A fresh database needs no live CodeGen (as the
  integration CI does for core), entity names are fixed (`PS Truth: <table>`), `UserViewMaxRows` keeps the product
  default the cap gates exercise. Rejected: live scoped CodeGen per run (minutes per run, metadata churn), entities via
  `mj sync push` of Loom metadata (317 s per world in the review and F-L2-1/2), tables in `migrations/` (would ship to
  customers).
- **D2-06 · Isolation: database-per-run plus table-per-dataset, seed stamps, no truncation of the schema.** CI already
  provisions a fresh database per job; agents have private databases by rule. Within a run, every dataset has its own
  tables, so W1's model can be scored after W2 has been loaded; seeds of one dataset load serially, stamped and checked.
  Rejected: schema-per-run (a CodeGen pass per schema per run, orphaned entity metadata), one shared table set
  (`load_world.sh`'s truncation and its serial-only constraint).
- **D2-07 · Loader: Node `mssql` bulk insert.** Removes bcp, Docker exec, the fixed container and the shell's password
  handling; uses the same `DB_*` env as the rest of MJ; ≈ 1–3 s per world.
- **D2-08 · Harness transport: PS operations through MJAPI with the GraphQL client (as a browser), the Pipeline Builder
  agent in a separate server-provider process.** The gates are about product entry points; both providers cannot share
  a process (the review's reason, `probe-truth-agent-step.ts:9-11`).
- **D2-09 · One single-threaded sidecar per run, MJAPI pointed at it with `PREDICTIVE_STUDIO_SIDECAR_URL`.** G0.10 needs
  single-threaded training; making every gate single-threaded keeps all measured values reproducible across machines.
  Cost: slower W8 (weekly, `sidecar-16gb`).
- **D2-10 · Registry format and outcomes** as §5.2: statuses `expected-fail | required`; outcomes `pass | fail | xfail |
  xpass | not-implemented | not-run | error`; `fail` and `error` fail CI; `xpass` is reported, never fails; flipping is a
  registry edit by the owner PR; the `--against origin/next` check forbids relaxing a required gate. Implementation
  pointers (`stub | body | external`) let a gate's body live in the package whose code it tests (dashboards, PR 1's
  package).
- **D2-11 · Lanes:** `pr` (Phase-0 gates that run in minutes), `nightly` (+ G0.2, PR 4's), `weekly` (+ 400-seed, W8,
  live-model). Defaults for later gates by rule (§5.3); owners may move their gates.
- **D2-12 · CI host: GitHub-hosted `ubuntu-latest` with the SQL Server 2022 container, as `integration.yml`.** No
  self-hosted runner exists; the integration lane proves the provisioning works there. W8 is excluded from 16 GB
  runners by the `sidecar-16gb` requirement until PR 3 fixes its memory (F-L4-5).
- **D2-13 · Superseded by D2-44.** Was: UI gates G0.4/G0.5 live in the dashboards package (node vitest), fed by a TruthSuite artifact. Now: `AtRiskRules` is moved to `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts`), and G0.4/G0.5 live as `Kind: "body"` in `packages/AI/PredictiveStudio/TruthSuite/gates/containment.gates.test.ts` (calling `ContainmentProbe.TopDriverBadges` / `ContainmentProbe.AtRiskListRecordIDs`), so `@memberjunction/ng-dashboards` carries zero TruthSuite test-harness code.
- **D2-14 · G0.6 runs weekly with live-model keys**; its story generator and story-prompt files are read through the
  containment probe, which C4 points at the real story prompt.
- **D2-15 · Containment probe seam (§5.8):** gate bodies never read product storage directly; C1–C6 own the probe's
  bodies. This keeps the two plan halves independent.
- **D2-16 · Superseded by D2-43.** F-ENV-7, F-ENV-12, and F-L2-1 all landed upstream on `origin/next` prior to `141d8d065c`; M1.6–M1.8 are read-only verification tasks and PR 2 does not modify `packages/CodeGenLib` or `packages/MetadataSync`.
- **D2-17 · Ownership transfers (recorded as program decisions D-022 and D-023, 2026-10-12):**
  F-ENV-5 (bizapps-common tags `DisplayName`) → PR 1, whose bizapps-common companion already exists; F-LOOM-5
  (MoreCheese checkpoint) → PR 6 (J2), whose more-cheese companion already exists. Reason: D-011's rule that each PR
  touches only the repos it already has companions in; PR 2's companion is Loom. Fallback if either is rejected: PR 2
  opens a companion branch `ps/pr-2-truth-suite-containment` in that repo with the one fix (bizapps-common:
  `metadata/tags/.activity-sentiment-tags.json` gains `DisplayName` per record, verified by `mj sync push` against MJ
  `next`; more-cheese: regenerate `generated/checkpoint.json` and add the subset check of the finding).
- **D2-18 · ps-review is a read-only prerequisite of M3 and M5** (sources verified by sha256 prefix). Its absence
  affects only the port tasks, handled by D2-36; the plan carries every golden value (world/scenario hashes, the 20
  reference results).
- **D2-19 · No MoreCheese install.** No Phase-0 gate uses it; real-case reference inputs are committed fixtures (D2-20).
- **D2-20 · Real-case fixtures committed** (`person_years*.parquet`, R2-real and T1-real rows + manifests, ≈ 1 MB):
  synthetic MoreCheese data (public per D-004); rebuilding them needs a pinned MoreCheese corpus that PR 6 owns.
- **D2-21 · F-LOOM-6 behaviour:** an error naming every offending field, with an explicit `allowIndexDefault: true`
  opt-in (declared intent is not silent). Rejected: a validate-only warning (the finding is that the default is silent).

Containment decisions (full reasoning in the milestone that takes them):

- **D2-C1 · Explicit caps are errors** (C1): an explicit `maxRows`/`MaxRows` smaller than the match fails training
  (naming the cap and the true count) and refuses scoring; a caller that wants a sample narrows the filter. Rejected:
  explicit caps as silent samples.
- **D2-C2 · The automated publish path is left as `next` has it; C2 corrects only the guide** (C2; program D-029,
  D-030, which supersede D-012 and the assessment's B6 containment): the Pipeline Builder keeps publishing a
  trust-cleared winner directly, opt-in auto-train keeps publishing through the promotion gate with `signOff: false`,
  and the Model Development Agent keeps its `Promote ML Model` link; G0.2/G0.3 move to PR 4, which replaces the path
  with gated automatic publishing. C2.1 makes the guide state that behaviour (F-DOC-19; F-DOC-6/F-DOC-37 text).
  Rejected: stop both paths at `Validated` until PR 4 (the earlier plan; contradicts D-029); publish only when PR 2's
  checks pass (PR 4's job, D-030).
- **D2-C3 · Only `Validated` and `Published` models score** (C3); the status check runs after the artifact checks so
  "needs training" and auto-train still work. Rejected: refusing `Validated` (blocks preview before publishing).
- **D2-C4 · Global driver lists only for coefficient importance** (`logistic_regression`, `ridge`) (C4). Rejected:
  hide all lists; show all with a caveat. PR 3's D8 re-enables them.
- **D2-C5a/b/c** (C5): the time index is `ValidationStrategy.TimeIndexColumn` (no migration; PR 3's Temporal Spec
  replaces it); the evaluation record lives in `MLModel.Lineage.evaluation` and the withheld reason is repeated in the
  training run's `Notes`; the majority rate (`baseline_accuracy`, `predicted_classes`, `n`, `n_positive`) is measured
  by the sidecar on the metric's own rows.
- **D2-C5d · The majority-baseline rule is configurable per pipeline** (C5.4, C5.5; owner decision 2026-10-12, which
  closes the former open question "W1's honest logistic model is graded Poor by the majority rule"):
  `ValidationStrategy.MajorityBaselineRule: 'enforce' | 'warn'` in the existing JSON column (no migration; `MJ: ML Training Pipelines` has no other column for evaluation settings — its JSON columns are
  `Hyperparameters`, `SourceBindings`, `FeatureSteps`, `AsOfStrategy`, `LeakageGuard`, `ValidationStrategy`), default
  `enforce`, recorded at training time in `MLModel.Lineage.evaluation.MajorityBaselineRule` and read from there by
  `TrustVerdicts.DeriveTrustVerdict`, so a verdict is reproducible from the model alone. `warn` records the finding with its numbers
  (`TrustVerdict.majorityBaseline`) and grades on the other rules; an accuracy-only verdict is enforced under either
  value (F-TR-1 stays contained); an unknown value is refused before the run row. G0.12 and every agent-built pipeline
  run on the default. **No Studio control in PR 2:** the pipeline editor round-trips the JSON (A21) and the
  `MJ: ML Training Pipelines` record form edits it, so the setting is made in the pipeline's `ValidationStrategy` JSON;
  a control would need a template change, a DOM test and the design-token gate for a setting PR 3 deletes. Follow-up
  owner: **PR 3**, whose Evaluation Protocol replaces `ValidationStrategy` and this rule (its three-outcome gate, D11).
  No Remote Operation changes: `PredictiveStudio.TrainModel` takes no validation input. Rejected: a new column; reading
  the rule from the pipeline at verdict time (an edit after training would re-grade old models).
- **D2-C6 · Experiment sessions refused at `ExperimentDepsBuilder.BuildProductionExperimentDeps`; the orchestrator code is kept** (C6), with
  `ExperimentDepsBuilder.BuildWithResolver` for PR 3/PR 5 (PR 3 M9.5's runtime check uses it). Rejected: deleting the
  orchestrator.

Decisions taken when the containment milestones were merged into this plan (each changed M1–M6 or the containment
text so the two halves fit; none changes another plan's interface except D2-22/D2-23, which PR 1's M7.5 consumes):

- **D2-22 · `GateRequirement` gains `'bizapps-common'`** (`TRUTH_BIZAPPS_COMMON=1`; M2.3 validator, M2.5
  `GateSelection.MissingRequirement` and its test, §5.2). PR 1's five gates exercise bizapps-common's job-title pipeline, so a host
  without it reports them `not-run`, not `error` (answers PR 1 plan Q-5). Rejected: running them unconditionally
  (every host without bizapps-common would `error`).
- **D2-23 · PR 1's gates are `body` bridges with five literal `TruthGate.Define('<name>', …)` calls that run
  `mj test run --name <name> --format json --output <file>` and read the result file's `status`** (M-final.5, D-025).
  The validator counts a title only as a literal first argument, so a loop over an array of names would fail
  registration; and `mj test run` exits 1 for a failed test *and* for "not found" or a crash, so the exit code cannot
  separate `fail` from `error`. Rejected: `external` vitest registration (the rows are not vitest files); exit-code
  mapping.
- **D2-24 · G0.6's "generated story" is the Model Development Agent's report turn** about the W1 s42 Validated model:
  one user message with the model's facts, `absoluteMaxIterations: 3`, story = `AIAgentRun.Message`
  (`src/harness/story-step.ts`, `TruthHarness.GenerateStory`, M5.6); `GenerateModelStory` calls it from M5.9 on, so
  G0.6 measures stories before C4 too. No other PS prompt writes stories (a `git grep -il story` over the PS packages
  and the agent's prompts finds none). Rejected: leaving `GenerateModelStory` returning `null` (G0.6 could never pass,
  10 of 10 stories required).
- **D2-25 · One causal-phrase list.** Core `CausalCopy.Patterns` (C4.1) is the list; M5.9 starts with the same eight
  patterns so G0.6 measures before C4, and C4.5 makes TruthSuite's `CausalCopyScan.Patterns` derive from Core and skips the
  file that defines the list. The earlier M5.9 list (`cause`, `leads to`, `because of`, `the effect of`, `the impact
  of`) is dropped: it flagged C4's own associative wording ("an association, not a cause"), so G0.6 could never pass.
- **D2-26 · `ReadModel` derives `trust` from the whole `MJ: ML Models` entity** (M5.6), not from
  `{ Metrics, HoldoutMetrics, ProblemType }` as the review's harness did, so C5's `Lineage`-based withheld verdict
  reaches G0.11 and G0.12.
- **D2-27 · G0.10 promotes each trained model to Validated before scoring** (M5.9): after C3 a Draft model is refused,
  which would turn G0.10 into `error`. The promotion gate does not read trust (A19), so it succeeds.
- **D2-28 · The validator recognises `recordGate(`** and the dashboards UI-gate helper is named `recordGate` (M2.3,
  M5.10): with the helper named `record`, the validator found 0 titles for G0.4/G0.5 and `truth:registry` failed at
  M5.10 Step 4.
- **D2-29 · Containment ordering** (§6 shared notes): every C milestone runs after M6 (gate runs need the M5.7 runner;
  results are compared with the M6.3 baseline); C1 ∥ C3; C2 → C4 → C5 → C6. The runner is `pnpm run truth:run --
  --mode <lane> --gate "<testName>"` with results under `TruthSuite/results/<run id>/gates/<GateID>.json` (RV-0
  `gate`/`outcome`); `run-truth.mjs --gate` runs the artifact producer for the two `external` UI gates (M5.7).
- **D2-30 · Guide ownership:** a C milestone owns the wording of the guide sections it lists (C2.1 §6.x/§12.4/§13 item 4/§15.3,
  C3.3 §6.3, C5.7 §4.3 and §5.1's first sentence, C6.5 §7/§7.1/§12/§14); M-final.4 corrects every other B15 claim and
  only quote-checks the C-owned ones (M-final.4 table).
- **D2-31 · Superseded by D2-44.** C4.2 updates `ContainmentProbe.TopDriverBadges` and `ContainmentProbe.AtRiskListRecordIDs` in `packages/AI/PredictiveStudio/TruthSuite/src/harness/containment-probe.ts` and their two call sites in `gates/containment.gates.test.ts` to take `targetVariable`.
- **D2-32 · The `nightly` and `weekly` CI lanes install bizapps-common** (M6.1; owner decision 2026-10-12, "why not just
  install bizapps common?", which resolves risk R-f and closes the former open question "should one CI lane install bizapps-common"). The step replicates PR 1 plan §2.4's
  database-only install (`mj migrate --verbose --schema __mj_BizAppsCommon --dir <clone>/migrations`,
  `mj sync push --dir <clone>/metadata --ci`, §2.4's row checks) after core provisioning and before MJAPI boots, from a
  shallow fetch of `BIZAPPS_COMMON_REF` (a full sha in the workflow `env`), and exports `TRUTH_BIZAPPS_COMMON=1`. Pin:
  bizapps-common `main` @ `172b99a5fef78352dbfa54784eaa34149423f802` (v5.52.0) until PR 1's companion exists; then
  its PR head, then its merge commit (the companion merges after PR 1) — set by M-final.5 Step 4 (order A) or PR 1's
  M7.5 (order B, Step 5's text). No secret (public repository), no cache (fresh database per job; the clone is one
  commit). The `pr` lane does not install it (none of its gates needs it). Rejected: no lane installs it (CI would
  report `required` gates `not-run` forever); installing in every lane (the `pr` lane selects no bizapps-common gate);
  tracking a branch instead of a sha (an unpinned bizapps-common change could turn the nightly lane red).

Decisions taken by the human-fallback audit (2026-10-12; every step of this plan runs without a person — program
D-006, D-029 — and merging the PR is the only human act, D-007):

- **D2-33 · G0.6's live model comes from `GEMINI_API_KEY` when `INTEGRATION_LIVE_MODEL_KEYS` is absent** (M6.1, C4.5
  Step 3, M-final.1 Step 4; resolves the former open question 2 and risk R-5). Facts, 2026-10-12: `gh secret list -R
  MemberJunction/MJ` lists 13 repository secrets including `GEMINI_API_KEY` and `ANTHROPIC_API_KEY`, not
  `INTEGRATION_LIVE_MODEL_KEYS`; the organisation secrets shared with the repository are `APP_PRIVATE_KEY`,
  `TURBO_REMOTE_CACHE_SIGNATURE_KEY`, `TURBO_TOKEN`; the Model Development Agent's prompts (G0.6's story generator,
  D2-24) run on Gemini 3.8 Flash, whose inference driver is `GeminiLLM`
  (`metadata/prompts/.model-development-agent-prompts.json:21`, `metadata/ai-models/.ai-models.json:25013`), so
  `AI_VENDOR_API_KEY__GeminiLLM` alone runs it. The weekly lane writes the key into `.env` **before** MJAPI boots and
  fails red when neither secret yields that line (never a silent `not-run`). Locally the env file copied from `$MJ/.env`
  carries the line (checked with `grep -c`); without it the weekly CI dispatch measures G0.6. Rejected: waiting for a
  person to configure `INTEGRATION_LIVE_MODEL_KEYS` (G0.6 would stay unmeasured indefinitely); `ANTHROPIC_API_KEY`
  (no prompt G0.6 runs uses an Anthropic model).
- **D2-34 · UI verification is automated in two tiers chosen by a command's output** (C4.5 Step 4, C6.6 Step 4;
  replaces the manual Explorer checks). Browser tier: a Playwright spec on MJ's `e2e/` harness
  (`e2e/specs/ps-containment.spec.ts`) against the agent's Explorer (4221) and MJAPI, signed in by
  `e2e/overlay/prime-auth.mjs` (credentials `HEADLESS_AUTH0_TEST_UID`/`_PWD` in `packages/MJAPI/.env`, or
  `MJ_TEST_USER`/`MJ_TEST_PWD`), on data made by `truth:ui-fixture` through the product operations. Component tier:
  vitest DOM tests that render the real components (`PSRowDriversComponent` on the real W1 s42 scores; the C6.2
  experiments DOM tests). The component tier always runs; the browser tier runs when `prime-auth.mjs` prints
  `LOGIN_OK`, and the tier line is recorded in §11. As of 2026-10-12 neither `$MJ/.env` nor `packages/MJAPI/.env`
  carries the headless credentials, so on this host the component tier is the verification of record until they are
  added; nothing waits for them. Rejected: a person looking at the screen (not repeatable, not available); the browser
  tier as the only tier (an agent without sign-in credentials could not finish C4/C6).
- **D2-35 · The README is verified by executing it** (M6.5 Step 3, M-final.3 Step 4; replaces "README reviewed
  against a fresh terminal"). `scripts/readme-walkthrough.mts` runs every `bash readme-step` block in a fresh
  `git worktree` of HEAD against a new private database `<DB_DATABASE>_readme`, stops at the first non-zero exit and
  cleans up; `src/readme/steps.ts` refuses placeholders and unclosed blocks (unit-tested). Rejected: a CI job (the
  weekly lane already provisions from scratch; the walkthrough adds the reader's own command order, which only the
  README holds).
- **D2-36 · ps-review is read only on the reference host** (§2.1 remedy table). Every absolute path in this plan names
  that host; a session elsewhere runs the tasks that do not read ps-review, takes ported sources from the pushed
  branch, and hands the port steps to a session on the reference host through its handoff entry. No copy of ps-review
  is requested from anyone, and none from another source is accepted (sha256 prefixes). Rejected: asking a person for
  an archive (the previous text).
- **D2-37 · An unmerged Loom companion does not hold PR 2** (M-final.2 Step 3). The pin stays at the companion's head
  sha (fetchable by sha through `refs/pull/<n>/head`), the PR description states the merge order, and the re-pin to the
  merge commit is the refresh trigger (b) task. Rejected: stopping until the Loom PR merges (merging is the human step
  of D-007; no agent task may wait on it).
- **D2-38 · A `BIZAPPS_COMMON_REF` bump is kept only when a nightly dispatch on the bumping branch runs the
  bizapps-common step green at the new sha** (M6.1 header comment, R-f). This replaces "bump only to a reviewed commit":
  the install step's migration, metadata push and row checks are the acceptance test of a pin.
- **D2-39 · "Ready" is `gh pr ready`; there is no review step** (M-final.6). The PR description, the §11 log and the
  CI lanes carry the evidence; merging is D-007's human act and no task waits on it.
- **D2-40 · Supersedes the provisioning clause of D2-05** (ruling SR-4, program D-040; D2-05 itself stands as written
  above). A fresh database needs `mj migrate` **plus** `mj sync push` of `TruthSuite/metadata`: the push sets each
  `PS Truth:` entity's `AllowDirectSQLInsert`/`Update`/`Delete` (with `TrackRecordChanges` and
  `TrustServerCacheCompletely` off and `DeleteType` `Hard`, as the opt-in requires), so the loaders' and the harness's
  direct SQL is the declared, sanctioned path; `provision.mjs` runs both and checks the flags (M4.2). Rejected: raw DML
  on registered entities without the opt-in (the previous default).
- **D2-41 · Durable gate-file names; the registry keys on the declared title** (ruling PR3-R7, program D-043). Gate files
  are named by subject (`containment.gates.test.ts`, `feature-pipelines.gates.test.ts`, …), a `body` entry carries no
  file, and the validator finds each body by its literal `TruthGate.Define('<TestName>', …)` across
  `gates/*.gates.test.ts`. Shipped TruthSuite code and comments carry no plan vocabulary. Rejected: registry entries
  naming plan-numbered files (`phase-0`, `phase-7-pr1`, `pr3-m<k>`).
- **D2-42 · The deprecated camelCase aliases are removed** (rulings PR3-R4 and CN-6, program D-042): `isErrorMetric`,
  `deriveTrustVerdict`, `trustEvidenceLine`, `toBusinessPredictionCard`, `buildBusinessCatalog`, `trustDots`,
  `MLSidecar.train` (C5.5 Step 3b), `parseRowDrivers` (C4.2) and `buildProductionExperimentDeps` (C6.1), with every
  in-repo caller moved to the PascalCase name in the same commit; the release note names the removal. Later PRs
  never re-add them. Rejected: keeping them (a shim, standards §3).
- **D2-43 · Platform patches `F-ENV-12`, `F-ENV-7`, and `F-L2-1` landed upstream on `origin/next` prior to `141d8d065c`; M1.6–M1.8 are read-only verification tasks** (kickoff adversarial review, 2026-10-20; supersedes D2-16). `packages/CodeGenLib/src/Database/manage-metadata.ts` (`refreshMetadataBeforeVirtualEntitySync`), `packages/CodeGenLib/src/Database/sqlserver.ts` (`DROP PROCEDURE IF EXISTS`), and `packages/MetadataSync/src/services/{ValidationService,PushService}.ts` (`effectiveFilePattern(config)`) are already on `origin/next`. M1.6–M1.8 verify those upstream fixes and run the existing unit tests; PR 2 makes zero edits to `@memberjunction/codegen-lib` or `@memberjunction/metadata-sync`, keeping PR 2's blast radius out of foundational platform packages (PR 1 lesson #1).
- **D2-44 · Pure At-Risk rules (`AtRiskRules`) move to `@memberjunction/predictive-studio-core`, and G0.4/G0.5 run as `Kind: "body"` in `TruthSuite/gates/containment.gates.test.ts`** (kickoff adversarial review, 2026-10-20; supersedes D2-13, D2-29's external-gate clause, and D2-31). Putting `truth-gates.ui.test.ts` and `truth-gates.ui-probe.ts` inside `packages/Angular/Explorer/dashboards` leaked TruthSuite harness logic into `@memberjunction/ng-dashboards` and forced `run-truth.mjs` to spawn a second vitest process. Moving the pure functions (`AtRiskRules.ParseAtRiskRows`, `ParseRowDrivers`, `ResolveRenewalPolarity`, `TopGlobalDrivers`, `HumanizeFeatureName`, and C4.2's `DriverRaisesRisk`, `DriverBadgeText`, `BuildAtRiskOptions`, `SelectAtRiskListMembers`) into `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts`) lets both `@memberjunction/ng-dashboards` and `@memberjunction/predictive-studio-truth-suite` import them cleanly, and G0.4/G0.5 run inside `containment.gates.test.ts` as standard `Kind: "body"` gates.
- **D2-45 · M-final.5 bridges PR 1's 4 shipped gate rows (`G7.1`, `G7.2`, `G7.3`, `G7.5`), maps `→` to `->` for `mj test run --name`, and leaves `G7.8` (`C1 → C3.3`) as `Kind: "stub"` until patch 04** (kickoff adversarial review, 2026-10-20). PR 1 (`#5540`) extracted `G7.8` (`C1 → C3.3`, `strictParameters`) into patch 04 (`patches/04-agent-framework-strict-parameters.md`) per PR 1 §13, and named its four shipped `MJ: Tests` rows with ASCII `->` (`C1 -> C2.1`, `C1 -> C2.2`, `C1 -> C2.3`, `C1 -> C2.5`) while `gates.json` uses Unicode `→`. `feature-pipelines.gates.test.ts` defines the four shipped gates and converts `testName.replace('→', '->')` when calling `mj test run --name`.
- **D2-46 · `D-053` (`@deprecated` alias removal) is scoped strictly to files PR 2 modifies for functional reasons (`C1`–`C6`, `M1`, `M5.6`, `M5.10`)** (kickoff adversarial review, 2026-10-20). PR 2 does not open untouched Predictive Studio files solely to strip `@deprecated` aliases (reducing unnecessary diff noise); remaining aliases are removed in PR 6 `X-M1`.
- **D2-47 · `BIZAPPS_COMMON_REF` is queried via `gh pr view 354 -R MemberJunction/bizapps-common` (`76809d340e450905f1c80730a62ad3485aabeca0`)** (kickoff adversarial review, 2026-10-20). Because `MemberJunction/bizapps-common#354` was opened from fork `arie-glazier-bcc/bizapps-common`, `gh pr list --head ps/pr-1-feature-pipelines` returns `[]`; querying PR `#354` directly returns `headRefOid` `76809d340e450905f1c80730a62ad3485aabeca0` while open and `mergeCommit.oid` once merged.
- **D2-48 · Strict Scope Rule enforcement (PR 1 §13 rule applied to PR 2, 2026-10-21; supersedes D2-03's Loom-changes clause and D2-42's untouched-file sweep):** A change outside Predictive Studio's target packages stays only if TruthSuite or Predictive Studio containment literally fails without it:
  1. **Zero changes to `MemberJunction/loom` (`M3.1–M3.3` & `M-final.2` scoped out):** `TruthSuite`'s world and scenario generators only call `recurringDecision`, `createRng`, `IdentityService`, `calibrateIntercept`, and `sigmoid` from `@memberjunction/loom-engine` (`make_world.mjs` writes `people.csv` directly and never calls `emitMetadata`, `loom build`, `loom validate`, or `RetrospectiveUnroller`). All 68 golden hashes in `M3.6` were produced against unmodified `MemberJunction/loom` `origin/next` (`63aec01f61a3f9e831fbf64bc9bac4675ac86d84`), so `fixtures/loom.json` pins `63aec01f61a3f9e831fbf64bc9bac4675ac86d84` directly with zero Loom companion PRs. The standalone Loom CLI findings (`F-LOOM-1..4, -6`) are deferred to the Loom backlog.
  2. **Zero changes to `guides/INTEGRATION_TESTING_QUICKSTART.md` (`M6.5`):** All `TruthSuite` documentation lives in `packages/AI/PredictiveStudio/TruthSuite/README.md` and `guides/PREDICTIVE_STUDIO_GUIDE.md`.
  3. **Zero changes to `packages/TestingFramework/**`, `Engine/src/agent/pipeline-builder.ts`, or untouched files in `M5.6 Step 0` / `C5.5 Step 3b`:** `Core/src/trust.ts` exports `TrustVerdicts` while keeping `DeriveTrustVerdict` and `TrustEvidenceLine` exported so `TestingFramework/integration-test-suite/rigs/ps-inproc-agent-builder.ts` and `Engine/src/agent/pipeline-builder.ts` stay untouched (honouring D-030 and §7 line 9650), and untouched files (`Core/src/metrics-util.ts`, `Engine/src/experiment/seams.ts`, `Engine/src/maintenance/*`, `dashboards/src/PredictiveStudio/business-predictions.view-models.ts`) are not modified.
- **D2-49 · Defer `mj test` CLI bridge and every-build CI trigger out of PR 2; amend D2-01 with a bridge when picked up (CEO check-in, 2026-10-21):** Stitching `@memberjunction/predictive-studio-truth-suite` into the `mj test` catalog and running its `pr` lane on every build (unfiltering `.github/workflows/ps-truth-suite.yml`) are deferred out of PR 2 to keep PR 2 focused on landing the truth suite and Phase-0 containment. When picked up in a follow-up, this amends D2-01's "not `mj test`" clause with a thin bridge bundle (invoking the suite's `pr` lane and surfacing each gate from `outcomes.json`—which now carries the true non-`pass` outcome in `error`—as a named check) rather than rewriting the multi-process GraphQL + sidecar runner.
- **D2-50 · No fixture teardown (Arie, 2026-10-22):** The suite does not delete its `PSTruth:` fixtures. Each run gets a throwaway database (D2-06), so teardown buys nothing and costs a slow, FK-fragile delete pass that can reach rows outside the run. The `truth:clean` script, `HarnessCleanup`, and `TRUTH_KEEP_FIXTURES` added for the integration-guide self-cleaning rule are removed. A run against a developer's private database leaves its fixtures; drop the database to reclaim them.

### Standards rulings (raised by the 2026-10-13 audit, ruled 2026-10-13)

The 2026-10-13 audit against `reference/coding-standards.md` (D-035) left six items that would change a name or
contract PR 3's or PR 4's plan consumes, or a recorded PR 2 decision. The program ruled each on 2026-10-13; the plan
text above implements the rulings (the defaults first recorded here are kept below for history, marked superseded).

- **SR-1 · TruthSuite module functions other plans import by name** (`defineGate`, `TruthSuiteRoot`, `GetRunHarness`,
  `SeedSet`, `CATALOG`/`EnsureGenerated`, `OpenPool`, `ParseCsv` and its `csv.ts` siblings, the probe functions, the
  harness's one-function-per-member modules). *Superseded default: keep the names.* **Ruled (program D-037):** statics
  on owning classes — `TruthGate.Define` (the validator matches the literal `TruthGate.Define(`), `TruthSuite.Root`,
  `RunFixtures.GetRunHarness`/`W1S42Model`/`W1S42ValidatedModel`/`TrainedModel`, `DatasetSeeds.SeedSet`,
  `DatasetCatalog.EnsureGenerated` (`CATALOG` stays an exported constant), `TruthConnection.OpenPool`,
  `TruthCsv.{Parse, CoerceCell, AssertNotTruthFile, AssertHeaderOrder}`, `ContainmentProbe.*`, and one class per harness
  member module (`MJAPIConnection`, `TruthEntities`, `HarnessDatasets`, `HarnessPipelines`, `HarnessTraining`,
  `HarnessScoring`, `HarnessModels`, `HarnessAgent`, `JudgeBridge`, `HarnessArtifacts`); PR 3 and PR 4 consume these.
- **SR-2 · camelCase members of exported data shapes.** *Superseded default: keep them.* **Ruled (program D-039):**
  PascalCase members for new shapes that mirror no shipped camelCase shape — `GateEntry` (and `gates/gates.json`,
  mapped once by `import-gates.mjs`), `GateImplementation`, `GateResult`, `GateMeasurement`, `GateRunRecord`,
  `PythonVersion`/`ProbeResult`/`SelectResult`, and the harness result shapes `LoadedDataset`, `TrainAttempt`,
  `CandidateModel`, `ScoreAttempt`, `RecordProcessScoring`, `AgentStepResult`, `PromoteAttempt`, `RunContext`,
  `StoredWithheldVerdict`. Kept camelCase with evidence: the `TrustVerdict` additions `withheldReason`/`majorityBaseline`
  (and `MajorityBaselineFinding`, part of that shape) — `TrustVerdict` is shipped camelCase on `next`
  (`Core/src/trust.ts:32`, consumed by the dashboards and the agent); `outcomes.json` — the shipped `EMIT_OUTCOMES`
  shape (`IntegrationTestDriver.ts`, `scripts/integration-golden-diff.mjs`); the `TestRunResult` fields the bridge reads
  (`@memberjunction/testing-engine-base`). Evidence that the renamed shapes are not shipped: `git grep` on `origin/next`
  finds 0 uses of `gateId`, `ownerPR`, `GateMeasurement`, `TrainAttempt`, `CandidateModel`, `ScoreAttempt`.
- **SR-3 · `ReadStoredWithheldVerdict(m).grade` was `string`.** *Superseded default: `string`.* **Ruled:** a derived
  union — `StoredWithheldVerdict.Grade: TrustVerdict['grade']` here; PR 3 M10.4, which replaces `TrustVerdict` and the
  probe body, types it as the union of its derived verdict grade and `TrustVerdicts.OutcomeTitle`'s return type
  (`OutcomeTitleText`, a literal union), never `string`.
- **SR-4 · Raw DML on registered `PS Truth:` entities.** *Superseded default: raw DML without the opt-in.* **Ruled
  (program D-040, D2-40):** the opt-in flags through metadata seed files pushed with `mj sync push` (M4.2), and the
  loaders check them before any DML (M4.3).
- **SR-5 · `AtRiskRules.ParseRowDrivers(raw, invertedRisk = false)` kept a default.** *Superseded default: the default parameter.*
  **Ruled (program D-042):** `invertedRisk` is required and every caller passes it — `AtRiskRules.ParseAtRiskRows`, and the
  score-history service through the new required `LoadScoreHistoryParams.InvertedRisk` the grid fills (C4.2, §5.10).
- **SR-6 · `ps-run-experiment-modal` stayed in the bundle, unreachable.** *Superseded default: keep it for PR 3 to
  replace.* **Ruled:** deleted as dead code (standards §3) — no later plan re-enables it (PR 3–PR 6 do not name it);
  C6.2 removes it and the members and buttons that only opened it.
- **CN-6 · Four more deprecated aliases** (`parseRowDrivers`, `buildProductionExperimentDeps`, `trustDots`,
  `MLSidecar.train`). **Ruled (program D-042):** removed like the first five — C4.2 deletes `parseRowDrivers`, C6.1
  deletes `buildProductionExperimentDeps` and fixes its two doc references, C5.5 Step 3b deletes `trustDots` and
  `MLSidecar.train` and moves their callers (D2-42, release note §10).
- **CN-7 · `DataCache.canonical` duplicated MJGlobal's `Canonicalize`.** **Ruled (program D-041 applies everywhere):**
  `DataCache.SpecHash` hashes `Canonicalize(spec)`; the local copy is not written (M3.5).
- **CN-8 · Exported free functions no other plan imports.** **Ruled (program D-047):** every exported function a plan
  writes is a static of its owning class — `BulkLoader.Insert`, `DatasetStamp.{Read, Write}`, `WorldLoader.LoadSeed`,
  `ScenarioLoader.{LoadSeed, LoadSeriesFrame, FillSeriesTrain}` (M4.3), `AgentPlans.Build` (M5.6),
  `TruthGatesUiProbe.{BadgeText, TopDriverBadges, AtRiskListRecordIds}` (M5.10, C4.2),
  `AtRiskRules.{DriverRaisesRisk, DriverBadgeText, BuildAtRiskOptions, SelectAtRiskListMembers}` (C4.2),
  `ModelImportanceView.DisplayedFeatureImportance` and `PredictionDrivers.DriversForModel` (C4.3),
  `EntityFilePattern.{Default, Resolve}` (M1.7; supersedes that task's module-function note).
- **CN-9 · Shapes SR-2 did not classify.** **Ruled (program D-039):** classified with evidence. PascalCase (new, mirror
  no shipped shape): `DatasetRef` (`Kind`/`ID`/`Seed`/`Origin`), `PipelineSpec`, the catalog entry
  (`Kind`/`ID`/`SpecFile`/`Generator`), `AgentPlanInput`, `UserFacingLine`, `ReadmeStep` (and the walkthrough's
  `StepResult`); already PascalCase: `CausalCopyPattern`. Kept camelCase: `ScoreRequest`, now
  `Omit<PredictiveStudioScoreRecordSetInput, 'modelId'>` — the shipped operation input (`remote_operations.ts:249`,
  `scope`/`dryRun`/`writeBack`); `MajorityBaselineFinding`, part of the shipped camelCase `TrustVerdict` (SR-2); the
  harness `Train` options (`maxRows`, `asOf`) — the shipped `TrainModel` input's names.
- **CN-10 · Code in other repos.** **Ruled:** the standards apply to every line a plan writes, in any repo — Loom's new
  `LogisticFit` is `{ Beta; StandardErrors; Iterations }`, and Loom's new test files carry no plan-numbered names
  (`packages/engine/test/{child-index, motif-fixed-fields, logistic-refit}.test.ts`,
  `packages/cli/test/{index-defaults, latent-dials}.test.ts`).
- **CN-11 · Dead Pause/Resume/Cancel controls.** **Ruled:** deleted with the start modal (C6.2): the three buttons,
  their confirmation flow and every member that served only them.
- **CQ-4 · `ps-confirm-modal` left without a user.** **Ruled:** deleted in C6.2 with the other dead UI (no dead code
  between releases); PR 4 M7 creates the confirmation dialog it needs.
- **CQ-1 · Shipped free functions this PR modifies.** **Ruled (program D-052):** statics of their owner classes with
  every caller moved and no alias — `TrustVerdicts.{DeriveTrustVerdict, TrustEvidenceLine}` (M5.6 Step 0, ahead of the
  harness's first caller), `AtRiskRules.{ParseRowDrivers, ParseAtRiskRows}` (C4.2),
  `ExperimentDepsBuilder.BuildProductionExperimentDeps` (C6.1); the release note names each.
- **CQ-2 · Deprecated aliases in touched files.** **Ruled (program D-053):** every task removes the `@deprecated` aliases
  of the Predictive Studio files it modifies, callers moved (§2.7); PR 6 X-M1 removes the rest.
- **Plan-vocabulary names (CN-3/CN-4/CN-17, program D-043):** the browser spec is `e2e/specs/ps-containment.spec.ts`,
  the UI-fixture and past-sessions variables are `PS_UI_FIXTURE` and `PS_PAST_SESSIONS`, the baseline file is
  `baselines/containment-<YYYY-MM-DD>.json`, the changeset is `.changeset/ps-truth-suite-containment.md`, and PR 1's
  suite is `Predictive Studio Gates — Feature Pipelines`.

### Risks

| ID | Risk | Owner | Mitigation |
|---|---|---|---|
| R-1 | A Loom fix changes engine output and moves the worlds. | PR 2 implementer (M3) | M3.6 regenerates every base seed against the golden hashes on the pinned Loom and on `63aec01`; a mismatch stops the milestone. |
| R-2 | The `pr` lane is slower than the 6-minute R-TEST estimate (provisioning alone ≈ 15 min). | PR 2 implementer (M6) | M6.4 measures; gates over budget move to `nightly`; path filter keeps the lane to PS PRs. |
| R-3 | CodeGen output for 44 test tables is large and churns when CodeGen changes. | PR 2 implementer; later the PR that changes CodeGen's emitted shape | It lives only in the TruthSuite migration; regenerate with `provision.mjs --codegen` when CodeGen's emitted shape changes (the DDL test catches drift in the hand-written part). |
| R-4 | The containment writer chooses storage the gate bodies cannot read. | PR 2 implementer (C1–C6) | §5.8: C milestones change `containment-probe.ts` in the same commit as the product change; C5.6 is the only one that needs to. |
| R-5 | **Resolved (D2-33).** Was: G0.6 cannot be measured without model keys. | PR 2 implementer (M6.1, C4.5) | The weekly lane takes `INTEGRATION_LIVE_MODEL_KEYS`, else `GEMINI_API_KEY` (present, 2026-10-12), and fails red when neither yields `AI_VENDOR_API_KEY__GeminiLLM`; locally the env file's GeminiLLM line measures it; M-final.1 Step 4 records the run that measured it. |
| R-6 | PR 1 and PR 2 name a gate differently. | Whichever of PR 1 / PR 2 merges second | Both use `reference/gates.json` names; the validator rejects a title mismatch; M-final.5 (D-025). |
| R-7 | Agent runs (G0.2, 60 × 4 trainings) exceed the nightly budget. | PR 2 implementer (M6) | Measured in M6.2; if over 40 min, the plan's algorithms per run drop to the two the agent ranks first (§9 entry required). |
| R-b | **The honest W1 logistic model is graded Poor under the default rule.** C5.5's `noBetterThanMajority` (Core `trust.ts`, `TrustVerdicts.DeriveTrustVerdict`) finds a classifier whose holdout `accuracy` ≤ `baseline_accuracy` (C5.2, sidecar `classification_metrics` on the same rows). The W1-signal s42 logistic model's holdout accuracy is 0.7957, equal to the holdout renewal rate 0.7957 (Exp 73), so under the default `MajorityBaselineRule: 'enforce'` (D2-C5d) it becomes Poor with `canAct` false although its holdout AUC 0.723 (M5.8) alone would grade it Good (`AUC_BANDS` Good ≥ 0.70). A pipeline set to `"MajorityBaselineRule": "warn"` is graded by AUC: the same model is Good with `canAct` true and the finding (`majorityBaseline`, `enforced: false`, accuracy 0.7957 vs 0.7957) stays on the verdict (C5.5 unit test; C5.8 Step 4 measures both). Consequences under the default: its Predictions card is blocked (`canOpen` false); the Pipeline Builder leaves such a winner in Draft (its publish step, `maybePublish`, publishes only `canAct` winners and is unchanged by PR 2, D-030; agent-built pipelines are always `enforce`); C4.5's UI check (Step 4) must run before C5. The gates are unaffected: G0.4/G0.5/G0.6 use the Validated model made by the promote operation (the promotion gate does not read trust, A19) and G0.12 runs on the default, which it requires (§4.1). | PR 3 (M10, D11) | Accepted for the default: containment errs toward "not cleared" (B14 as written); a pipeline meant to be graded by AUC carries `warn` in its `ValidationStrategy` (set in the pipeline's JSON by a Studio user or by an Open App's metadata; agent-built pipelines stay `enforce`) (C5.7's guide text says how). PR 3's three-outcome gate (D11: lower bound over the best baseline, minority-class floor, intervals) replaces the rule and its setting and re-grades this model; PR 3 also owns F-REF-2 (the MoreCheese logistic model predicting "renews" for all 974 holdout members). |
| R-c | G0.6's 10 stories come from a live AI-model run of the Model Development Agent (D2-24); a run that ends without a user-facing message counts as a missing story and fails 10 of 10. | PR 2 implementer (C4.5, M-final.1) | `story-step.ts` records `finalStep` per story in the artifact; if a run ends on a sub-agent step, raise `absoluteMaxIterations` or tighten the request text, re-measure, and record the change in §9. |
| R-d | C1 makes an explicit cap an error; an external caller that used `maxRows`/`MaxRows` as a sample now fails. No MJ code passes either cap (open question 5). | PR 2 implementer | The refusal names the cap and the true count and says to narrow the filter; §10 lists the behaviour change. |
| R-e | C5.1 refuses plans with `AsOfStrategy` `column`/`offset`; agent plans and MoreCheese pipelines that use them stop training (open questions 6, 7). | PR 2 implementer; PR 6 for MoreCheese | The Goal Analyst prompt and example now emit `none`; PR 6's refresh checks MoreCheese metadata for `column`/`offset`. |
| R-f | **Resolved (D2-32).** Was: PR 1's five bridged gates (M-final.5) need bizapps-common and no CI lane installed it, so CI would report them `not-run` even when `required`. Now the `nightly` and `weekly` lanes install it at `BIZAPPS_COMMON_REF` and set `TRUTH_BIZAPPS_COMMON=1` (M6.1). Residual: a bizapps-common pin that no longer installs on MJ `next` (a core migration or metadata change it conflicts with) turns those lanes red at the install step. | PR 2 implementer (M6.2); then the PR that bumps the pin (M-final.5 order A, or PR 1's M7.5 in order B) | The install step fails loudly with its own name and row checks, never `not-run`; the pin is a full sha, and a bump is kept only when a nightly dispatch runs the install step green at it (D2-38); §8 A22 re-checks the repository and its `mjVersionRange` at every refresh. |
| R-g | **Until PR 4, the automated publish path can still publish noise or leaky models.** PR 2 leaves the Pipeline Builder's publish step and opt-in auto-train as `next` has them (program D-030), so a model whose holdout interval contains 0.5 or that rests on a leak the single-feature guard misses can reach `Published` with no sign-off (F-SEL-2, F-L4-1, F-LK-1, F-TR-9; G0.3 measured 1 of 2 W3 runs published). This is today's behaviour, accepted by D-030; MoreCheese's daily `autoTrain` keeps publishing. C5 narrows it only where a verdict becomes Poor (`canAct` false). | PR 4 (gated automatic publish; flips G0.2/G0.3); PR 3 (leakage audit D7, three-outcome gate D11) | C2.1's guide text states the behaviour; G0.2/G0.3 run in every `nightly` (G0.3 also `pr`) and their counts are recorded for PR 4. |

### Product-direction questions (each has an implemented default; no task waits on an answer)

1. W8 on a larger GitHub runner? Default (implemented): no larger runner; W8 stays `not-run` (`sidecar-16gb`, D2-12)
   until PR 3's memory fix (F-L4-5), and PR 3's plan sets W8's lane when it writes that gate's body.
2. Resolved by D2-33: the weekly lane takes its live-model key from `INTEGRATION_LIVE_MODEL_KEYS`, else
   `GEMINI_API_KEY`; G0.6 is flipped to `required` after a measured `pass` (M-final.1 Step 4).
3. Should the PR lane also run on `next` pushes? Default (implemented): no (nightly covers `next`).
4. Should `Validated` models score? Default (implemented): yes — C3 lets them (preview before publishing; D2-C3). The
   alternative is a one-line change of `ModelNotScorableError.CanScore` to `status === 'Published'` plus a Published fixture model
   for G0.1's scoring half, the UI-gate artifact, G0.6's stories and G0.7's dry run (`W1S42ValidatedModel` promoted one
   step further by the promote operation); G0.7 is unaffected (it names Draft and Archived). PR 4's lifecycle gate (F1)
   owns the final rule.
5. Explicit caps (C1): no MJ code passes `maxRows` today (verified at `c92d4a47f9`: the only writers are the
   operation/action pass-throughs, `train-model.operation.ts:90-91`, `train-model.action.ts:48-53`); external callers
   that used a cap as a sample must narrow the filter. Default (implemented): refuse (risk R-d).
6. Agent plans with point-in-time intent: after C5.1 a plan with `AsOfStrategy` `column`/`offset` fails at training
   with the refusal message. Default (implemented): refuse (honest). Alternative rejected for now: the Pipeline Builder rewrites it
   to `none` with a `FeatureStepWarning` (hides the gap).
7. MoreCheese pipelines with `column`/`offset` as-of: not verifiable from the MJ repo; PR 6's refresh runs
   `rg '"Mode": *"(column|offset)"' more-cheese/metadata` and moves any hit to `none` in its companion before MoreCheese
   is re-trained on a PR 2 build. Default (implemented): PR 6's refresh handles it (risk R-e).

### Harness extensions made by later PRs (recorded here; implemented in the named PR's plan)

- PR 4 (G0.2, program D-032): replaces the bodies of `ContainmentProbe.ReadStoredGateDecision` (read the stored
  gate outcome of the model's training run) and `ContainmentProbe.ReverifiesStoredDecision` (call
  `PublishRules.ReverifyPublish`), §5.8; flips G0.2 and G0.3 to `required`.
- PR 3 M10.4: `ContainmentProbe.GradedAbovePoorOrActionable` and `ReadStoredWithheldVerdict` read PR 3's rewritten
  verdict; `StoredWithheldVerdict.Grade` becomes PR 3's `OutcomeTitleText` union (ruling SR-3).
- PR 3 (TrainModel's structured refusal, program D-044): `TrainAttempt` gains `Refusal: { Kind: string } | null`, filled
  from the operation's structured refusal, so gate bodies check a kind, never error text.
- PR 3 M2.7: `TruthHarness.ReadWorldTruth(dataset)` — a loaded W1–W8 seed's `truth.csv` keyed by `MembershipYearID` (`src/harness/harness-extensions.ts`, wired in `RunFixtures.GetRunHarness()`).
- PR 3 M4.6: `TruthHarness.SampleRowIds(dataset, n, seed)` — a seeded sample of the dataset row table's primary keys.
- PR 3 M4.6: `TruthHarness.ResolveProvenance(p, value)` — resolves one assembled value's `ValueProvenance` to its source (`src/fixtures/provenance-resolver.ts`).
- PR 3 M4.6: `TruthHarness.UseSuiteSidecar()` — points the gate process's in-process engine calls at `.run/sidecar.url` (sets `PREDICTIVE_STUDIO_SIDECAR_URL`).

## 10. PR description draft

**Title:** PS PR 2 — Planted-truth suite, dev environment and containment

**Summary**

Predictive Studio gets a permanent planted-truth suite: seeded Loom worlds and planted scenarios whose true answers are
known, loaded into a test-only `pstruth` schema, run through PS exactly as a user would (MJAPI, the Pipeline Builder
agent, scoring), and judged against the truth. All 111 acceptance gates exist as named tests with an owning PR
and a status; later PRs flip their gates instead of writing new tests. This PR also fixes the install path (Python
3.11/3.12 probing, `PREDICTIVE_STUDIO_PYTHON`, documented turbo build), three platform tooling defects met while
installing (CodeGen duplicate virtual-entity fields, CodeGen dropping layered CRUD procs, `mj sync push` without
`filePattern`), and contains PS's most dangerous behaviours so the ten Phase-0 gates it owns pass. It does not change
how models get published: the agent and opt-in auto-train keep publishing without a human, as on `next`, until PR 4
replaces that path with gated automatic publishing (program D-029, D-030).

**What's in it**

- `packages/AI/PredictiveStudio/TruthSuite` (private): gate registry (111), Wilson/400-seed helpers, generators pinned
  to a Loom commit (byte-identical to the assessment's data), `pstruth` migration + entities, bulk loaders, harness,
  judges and reference pipeline (20/20 reference results reproduced), Phase-0 gate bodies.
- `.github/workflows/ps-truth-suite.yml`: `pr` / `nightly` / `weekly` lanes; `nightly` and `weekly` install
  bizapps-common (pinned sha, public repository, no secret) so PR 1's bridged gates run in CI.
- Sidecar: interpreter probing, `PREDICTIVE_STUDIO_PYTHON`, scipy pin, `.venv` symlink ignore.
- CodeGenLib (F-ENV-12, F-ENV-7), MetadataSync (F-L2-1).
- Containment (plan §6, C1–C6), each proven by its Phase-0 gate (§4.1 gate map):
  - C1 row caps (G0.1): training, filter/list/view scoring and maintenance re-scoring read every matching row; an
    explicit `maxRows` that would truncate fails naming the cap and the true count.
  - C2 publication (no gate; guide only): the guide now says what the automated path does — the Pipeline Builder
    publishes a winner whose point-estimate trust grade clears the bar, directly and without a per-model Action, and
    opt-in auto-train (#5295) publishes without reading the trust verdict. The code is unchanged (D-030); PR 4 gates it
    and owns G0.2/G0.3.
  - C3 scoring (G0.7): Draft and Archived models are refused before any record is scored; `ScoreRecordSet` honours
    `dryRun`.
  - C4 UI semantics (G0.4, G0.5, G0.6): driver badges follow the displayed risk; the At-Risk list, export and agent
    context use the grid's polarity; global driver lists show only coefficient importance; no causal or "lever" copy
    in the UI, reports or the agent's prompt (one phrase list in Core, scanned by a unit test and by the gate).
  - C5 training (G0.8–G0.12): no-op as-of settings refused before training; `kfold`/`holdout` report out-of-sample
    metrics (K honoured); single-threaded determinism kept; a declared time index withholds the verdict ("not
    evaluated as a forecast", stored in `Lineage.evaluation`); a classifier at or below the majority rate is Poor
    under the pipeline's `ValidationStrategy.MajorityBaselineRule` (default `enforce`; `warn` keeps the finding on the
    verdict and grades by AUC; the rule in force is recorded in `Lineage.evaluation`; set through the pipeline's JSON,
    no Studio control yet).
  - C6: experiment sessions (which trained nothing) are switched off server-side and in the Studio; the maintenance job
    is labelled "(not wired)" and stays Disabled.
- Behaviour changes to note: none to publishing (the automated path, including MoreCheese's daily scoring process
  that trains and publishes its renewal model, works as before); the honest W1 logistic
  model and any classifier no better than always predicting the majority are graded Poor under the default
  majority-baseline rule until PR 3's three-outcome gate (a pipeline set to `"MajorityBaselineRule": "warn"` is graded
  by AUC with the finding shown); explicit row caps and `column`/`offset` as-of settings are refused instead of silently ignored.
- Guide corrections for the S0/S1 claims and the Remote Operation / Action counts.
- Companion: MemberJunction/loom `ps/pr-2-truth-suite-containment` (F-LOOM-1/2/3/4/6, `filePattern`); merge it first.

**Gates:** PR 2's ten — G0.1, G0.4–G0.12 — `required` and passing (measured values: see the final handoff entry);
G0.2 and G0.3 (PR 4's, program D-030) registered with bodies as `expected-fail`, their measured counts recorded for
PR 4; 99 others registered as `not-implemented` stubs owned by PRs 1, 3, 4, 5 — or 94, if PR 1 merged first and this PR
bridged its five `mj test` gates (D-025; the `nightly` and `weekly` lanes install bizapps-common and run them).

**Release notes, regression strategy and remediation** (coding standards §5; conventions §5a — each item is filled
from the task that owns it):

- One-time changes operators see on deploy: trust verdicts of existing models are re-derived on read (C5.8 Step 5:
  accuracy-only and pre-C5 validation-only verdicts become "unknown", at-or-below-majority classifiers become Poor and
  their cards lock; no model's status changes); scoring processes bound to Draft/Archived models fail before their
  first record (C3.4 Step 4); per-member badges flip for renewal models and the At-Risk export header becomes
  `Risk %` (C4.5 Step 5); explicit `maxRows` caps that would truncate fail (C1.4 Step 5); as-of `column`/`offset`
  pipelines are refused (C5.8 Step 5); experiment sessions are switched off (C6.6 Step 5).
- Removed exports (no compatibility shims, program D-042): the deprecated camelCase aliases `isErrorMetric`,
  `deriveTrustVerdict`, `trustEvidenceLine`, `trustDots` (`@memberjunction/predictive-studio-core`),
  `buildProductionExperimentDeps` (`@memberjunction/predictive-studio`), `MLSidecar.train`
  (`@memberjunction/predictive-studio-sidecar`) and `toBusinessPredictionCard`, `buildBusinessCatalog`, `parseRowDrivers`
  (`@memberjunction/ng-dashboards`) — use the PascalCase names; `AtRiskRules.ParseRowDrivers` now requires
  `invertedRisk` (and `LoadScoreHistoryParams` requires `InvertedRisk`); the unreachable `ps-run-experiment-modal`
  component, the Experiments panel's Pause/Resume/Cancel controls and the then-unused `ps-confirm-modal` are deleted. Every in-repo caller is updated; an out-of-repo caller of these names breaks at compile time.
- Free functions moved to their owner classes (program D-052, ruling CQ-1; this PR changes them, and no alias keeps the
  old name): `DeriveTrustVerdict` and `TrustEvidenceLine` → `TrustVerdicts.*` (`@memberjunction/predictive-studio-core`),
  `ParseRowDrivers` and `ParseAtRiskRows` → `AtRiskRules.*` (`@memberjunction/ng-dashboards`),
  `BuildProductionExperimentDeps` → `ExperimentDepsBuilder.BuildProductionExperimentDeps` (`@memberjunction/predictive-studio`).
  Every in-repo caller moves; an out-of-repo caller breaks at compile time — the fix is the qualified name. Every other
  deprecated alias in a file this PR modifies is removed with its callers (program D-053) and listed here at M-final.
- Naming (program D-039): the new `TrustVerdict` members `withheldReason`/`majorityBaseline` (with
  `MajorityBaselineFinding`) and the `evaluation` key added to the model's `Lineage` JSON keep the camelCase of those
  shipped shapes — a deliberate deviation from standards §1, disclosed here; every other new exported shape has
  PascalCase members.
- Prevents new damage, does not heal old: scores already written by Draft/Archived models, At-Risk lists built before
  the deploy, and models published on in-sample or accuracy-only verdicts remain; the remediation queries are in C3.4,
  C4.5 and C5.8.
- Long-stable code changed, with its regression strategy: CodeGen's execution of layered entities (M1.8 Step 6) and
  its metadata refresh before the virtual-entity sync (M1.6: at most one extra refresh per run, only after fields were
  inserted; the full CodeGenLib suite plus the M1.6 repro), MetadataSync validation's file-pattern default (M1.7: only
  folders without `filePattern`, which crashed before, change), trust grading and validation (C5.8 Step 5).

**Verification (run by AI, ruling S1 / D-035):** every guard this PR adds has a recorded mutation check (§6 shared
notes; the tables in M1.1–M1.8, M2.3–M2.5, M3.1–M3.5, M4.3–M4.4, M5.6, M5.9–M5.10, M6.5, C1.4, C3.4, C4.5, C5.6,
C5.8, C6.6). The rows a mutation could not expose are listed here with their reasons (copied from §11 at M-final.6).
All verification — unit, integration, gate runs, mutation checks, browser/component UI checks — was run by AI
agents; no person ran or reviewed it.

**Test results:** (filled at M-final: unit counts per package, integration tier, the three lanes' report lines,
measured runtime per lane.)

**Findings closed (39):** environment and tooling — F-ENV-1, F-ENV-2, F-ENV-3, F-ENV-7, F-ENV-9, F-ENV-12, F-L2-1,
F-L2-2, F-DOC-25; Loom — F-LOOM-1, F-LOOM-2, F-LOOM-3, F-LOOM-4, F-LOOM-6; containment — F-L3-1 (with F-MC-7), F-L3-2
(C1), F-SCO-1, F-SCO-2 (C3), F-UI-1, F-UI-3, F-UI-4 (C4), F-SC-1, F-TR-3 (C5), F-EXP-1 (C6); guide — F-DOC-19 (C2),
F-DOC-23 (C3), F-DOC-4, F-DOC-35 (C5), F-DOC-7, F-DOC-8 (C6), F-DOC-2, F-DOC-3, F-DOC-5, F-DOC-11, F-DOC-17, F-DOC-18,
F-DOC-21, F-DOC-36 (M-final). Contained for their later owners: 24 (plan §3.2). Transferred: F-ENV-5 → PR 1, F-LOOM-5
→ PR 6 (D-022, D-023).

**Plan:** `plans/predictive-studio/PR-2-truth-suite-containment.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## 11. Progress and handoff log (append-only; newest at the bottom)

### 2026-10-20 — session 1 (kickoff refresh + adversarial review remediation) — Antigravity

- **Completed:** Kickoff refresh (`program/conventions.md` §1 & §7 triggers `a` and `b` after PR 1 `#5540` merged at `141d8d065c`) and full adversarial audit against `coding_standards.md`, `AGENTS.md`, and `journal/2026-10-20-PR-1-lessons-learned.md`. Applied decisions `D2-43`–`D2-47` across the plan, updated anchors to `141d8d065c`, created branch `ps/pr-2-truth-suite-containment` from `origin/next` (`141d8d065c`), and copied the refreshed plan into `$MJ/plans/predictive-studio/PR-2-truth-suite-containment.md`.
- **Next step:** Start Milestone M1 (`Task M1.1` — Python 3.11/3.12 probe module and unit tests in `packages/AI/PredictiveStudio/Sidecar`).

## 12. Refresh log (append-only)

### 2026-10-12 — refresh (written; tier Ready) — Claude Opus 5.5 (plan author)

- **Checked against:** MJ `origin/next` @ `c92d4a47f9` (read-only worktree `/Users/arieglazier/repos/MJ_psnext`; anchors
  verified with `tools/check-anchors.mjs` against `/Users/arieglazier/repos/MJ_20260925` `origin/next` = `c92d4a47f9`);
  Loom `63aec01f61` (= `MemberJunction/loom` HEAD on 2026-10-12); ps-review `d47dfb86f1`.
- **Anchors:** `node tools/check-anchors.mjs plans/PR-2-truth-suite-containment.md /Users/arieglazier/repos/MJ_20260925
  origin/next` → `# ok 34 · moved 0 · changed 0 · missing 0 · skipped 9` at `origin/next` = `ac24ffeb8a` (it moved 65
  commits past `c92d4a47f9` while this plan was written; none of them touches an anchored file — the only overlap,
  `packages/TestingFramework/integration-test-suite`, gained realtime-session checks) and the same result at
  `c92d4a47f9`. The 9 skipped anchors were checked with `git -C <repo> show <atCommit>:<file>`: Loom `63aec01` lines 652, 16, 295, 140, 160, 1135 and
  ps-review `d47dfb8` lines 98, 25, 74 — all as recorded.
- **Assumptions:** A1–A14 hold at `origin/next` = `ac24ffeb8a` (A1 `1`; A2 0 matches; A3 numpy 1.26.4, scikit-learn
  1.4.2, no scipy pin; A4 `1`; A5 `1`; A6 Loom `next` HEAD = `63aec01f61`; A7 E404; A8 `0`; A9 `1`; A10 `5`; A11 `1`;
  A12 `1`; A13 `d47dfb86f1`, 0 modified tracked files; A14 `1`).
- **Evidence gathered while writing:** W1-signal s42–s44 + 9042 regenerated from Loom `63aec01` in 0.89 s — rows,
  truth and manifest byte-identical to the review's data; C2, T4 regenerated identical; D2's rows/truth hashes equal the
  review's determinism log; the 400-seed rule numbers (≤ 28 / 372–388 / ≥ 372; P(pass) 0.9693 / 0.0235 / 0.9502 /
  0.5499) and the T2 60-seed 0.9834 recomputed independently; this machine's `python3` is 3.14.4 with 3.11.15 and
  3.12.11 also present (F-ENV-2 reproduces here).
- **Dependency changes consumed (trigger b):** none (no dependency).
- **Plan edits:** initial write; Ready tier. The containment milestones C1–C6 were drafted separately (same date and
  commit) and merged into §6 by the next entry.
- **Decisions recorded:** §9 D2-01 … D2-21; D2-17 proposes program decisions D-022 (F-ENV-5 → PR 1) and D-023
  (F-LOOM-5 → PR 6) to be appended at kickoff.

### 2026-10-12 — refresh (trigger d: plan assembly) — Claude Opus 5.5

- **Checked against:** MJ `origin/next` @ `7189fcd4b4`.
- **Anchors:** ok 159 · moved 0 · changed 0 · missing 0 · skipped 9 (the 34 infrastructure anchors, the 118 containment
  anchors drafted at `c92d4a47f9`, and 7 new anchors for the M-final.5 bridge and the M5.6 story step; skipped = the
  Loom and ps-review anchors, unchanged since the previous entry).
- **Assumptions:** the MJ-side checks hold at `7189fcd4b4` (A1 `1`; A2 0 matches; A3 numpy 1.26.4, scikit-learn 1.4.2,
  no scipy pin; A4 `1`; A5 `1`; A8 `0`; A9 `1`; A10 `5`; A11 `1`; A12 `1`; A14 `1`; A6, A7, A13 are Loom/npm/ps-review
  checks, not re-run); new A15–A20 hold (A15 `1`; A16 `0`; A17 `1`, `1`; A18 `0`; A19 `0`; A20 `1`).
- **Dependency changes consumed (trigger b):** none. PR 1's plan (M7.5, Q-5) consumed: its bridge proposal and its
  `'bizapps-common'` requirement request.
- **Plan edits:** containment milestones C1–C6 merged into §6 below M6 with dependency/parallelism headers and shared
  notes; their interface assumptions checked against M1–M6 and replaced by **Interfaces: Consumes** lines; M2.3/M2.5
  (`bizapps-common` requirement, `recordGate` titles), M5.6 (`ReadModel` trust from the entity, `Train` failure shape,
  `LastTimeIndexDeclared`, `story-step.ts`/`GenerateStory`), M5.7 (`--gate` filtering for the UI gates), M5.9 (one
  phrase list, story helpers, G0.10 promote), M5.10 (`recordGate`) changed so the containment milestones' assumptions
  hold; §3.2 and §4.1 gate/finding maps; M-final.1, M-final.4, M-final.5 (D-025 bridge), M-final.6; §5.2, §5.7, §5.8,
  §5.10, §5.11 (second anchors block), §7, §8 (A15–A20), §9, §10.
- **Decisions recorded:** §9 D2-C1 … D2-C6 (containment) and D2-22 … D2-31 (assembly); risks R-a … R-f; open questions
  4–9. D2-22/D2-23 change PR 1's M7.5 (requirement name and bridge code); no new program decision (D-025 covers the
  bridge form).


### 2026-10-12 — plan edit (owner decisions: configurable majority rule; CI installs bizapps-common) — Claude Opus 5.5

- **Checked against:** MJ `origin/next` @ `4ff478ad98` (anchors and A21); bizapps-common `main` @ `172b99a5fe`
  (`next` @ `de6a09a1b5`, 21 commits ahead of `main`; repository `PUBLIC`).
- **Anchors:** ok 163 · moved 1 · changed 0 · missing 0 · skipped 9 (moved: `story-agent-run-message`, hint 46026 →
  46032, same code; 5 new `ctn-c5-*` anchors for the pipeline's `ValidationStrategy` column, the Pipeline Builder's
  `buildValidation`, the Studio editor's load/save and the wizard's rebuild).
- **Assumptions:** new A21 holds (`MajorityBaselineRule` 0 matches in `pipeline-spec.ts`; editor save `1`, load `1`);
  new A22 holds (bizapps-common `main` resolves; `PUBLIC`; pin `mj-app.json` `mjVersionRange` `">=6.1.5 <7.0.0"` vs
  MJ `next` `6.2.0-edge.3`; `mj migrate` reads no app manifest — 0 matches for `mj-app`/`mjVersionRange`/`manifest`
  in `packages/MJCLI/src/commands/migrate/index.ts`). At the pin: 41 migration SQL files, 12 job functions, 8 seniority
  levels, record process `7E030001-…` and prompt `7C46041F-…` present in its metadata.
- **Dependency changes consumed (trigger b):** none.
- **Plan edits:** C5 header and decisions (D2-C5d), C5.4 (rule type, parser, refusal before the run row, lineage
  record; tests), C5.5 (`MajorityBaselineFinding`, `TrustVerdict.majorityBaseline`, the `warn` branch; tests and failure
  counts), C5.7 (guide text: the setting, its default, how to set it), C5.8 (G0.12 `enforce` check,
  `scripts/majority-rule-check.mts`, exit counts), C4.5 note; §4.1 (G0.12 on the default); §5.2, §5.3, §5.9, §5.10;
  §5.11 anchors; M6.1 (workflow: `BIZAPPS_COMMON_*` env, integration-test-suite build, the bizapps-common step; its
  credentials, pin, time and caching), M6.2, M6.4; M-final.1, M-final.5 Steps 4–5 (pin bump, CI measurement, PR 1's
  M7.5 text); §7; §8 A21–A22; §9 (D2-C5d, D2-32; R-b rewritten; R-f resolved; open questions 5 and 9 removed, the rest
  renumbered); §10.
- **Decisions recorded:** §9 D2-C5d, D2-32. D2-32 changes PR 1's M7.5 in order B (the `BIZAPPS_COMMON_REF` bump; text
  in M-final.5 Step 5) — to be added to PR 1's plan §9/M7.5.

### 2026-10-12 — plan edit (owner decisions D-029, D-030, D-032: automated publishing stays; G0.2/G0.3 → PR 4) — Claude Opus 5.5

- **Checked against:** MJ `origin/next` @ `4ff478ad98`; `reference/gates.json` (G0.2/G0.3 `ownerPR: 4`; G0.2 amended by
  D-032, `statRule: noise-publish-60`; owners PR 2: 10, PR 4: 30); `program/decisions.md` D-029–D-032 (D-012
  superseded by D-029/D-030; D-031 needs no PR 2 change).
- **Anchors:** ok 156 · moved 1 · changed 0 · missing 0 · skipped 9 (moved: `story-agent-run-message`, as before).
  Removed with the deleted C2 tasks: `ctn-c2-build-autopublish`, `ctn-c2-outcome-message`, `ctn-c2-report-trust-line`,
  `ctn-c2-autotrain-ensure`, `ctn-c2-agent-promote-link`, `ctn-c2-prompt-promote-tool`, `ctn-c2-prompt-promoted`,
  `ctn-c2-prompt-block-promotion`. Renamed `ctn-c2-agent-status-filter` → `ctn-c6-agent-status-filter` (C6.3 uses it).
  Added `ctn-c2-guide-model-action` (guide §15.3). Kept `ctn-c2-agent-publish` and `ctn-c2-autotrain-publish`: they
  back C2.1's guide sentences.
- **Assumptions:** A11 and A15 rewritten (the builder's direct publish and auto-train's publish stay; auto-train reads
  no trust verdict: `canAct|TrustVerdicts.DeriveTrustVerdict` 0 matches at `4ff478ad98`).
- **Plan edits:** C2 rewritten — the stop-at-Validated containment of the Pipeline Builder and auto-train (old C2.1,
  C2.2: `validateIfCleared`, `ModelAwaitingPublicationError`, `trainAndValidate`), the `Promote ML Model` revoke and
  prompt edits (old C2.3) and the gate run (old C2.5) are deleted; C2.1 is now the guide correction (§6.x, §12.4, §13
  item 4, §15.3) stating `next`'s behaviour, which still closes F-DOC-19 and contains the guide text of F-DOC-6 and
  F-DOC-37. C6.3 creates `agent-tool-containment.test.ts` (C2.3 no longer does) and its prompt text says the builder
  publishes a cleared winner. C4.3's report line no longer claims a person publishes. §1, §3.1–§3.4 (19 contained;
  F-TR-9, F-L4-1/F-SC-9, F-LK-1, F-SEL-2 no longer contained), §4.1 (ten owned gates; G0.2/G0.3 table with the amended
  thresholds), §4.2 (owner counts), §4.3 (keep-list: automated path unchanged), §5.2 (`amendedBy`, `p11Threshold`,
  `StatRule` `noise-publish-60`), §5.3, §5.8 (`ReachedPublishedUnattended(m)` without `humanPromoted`;
  `ReadStoredGateDecision`, `ReverifiesStoredDecision` for PR 4), §5.10, M2.2–M2.4 (registry and seed-rule tests),
  M5.9 (G0.2 two-half body, G0.3 body, expectations), M6.2–M6.3, shared C notes, C6 exit, M-final.1 (`required 10,
  expected-fail 100`; with PR 1's bridge `required 15, expected-fail 95`; `pr` lane `pass 9 · xfail 1`), M-final.4–6,
  §7, §8, §9 (D2-C2 rewritten, D2-30, R-a deleted, R-g added, R-b), §10.
- **Decisions recorded:** §9 D2-C2 (rewritten for D-030). Findings that PR 2 no longer contains — F-TR-9, F-L4-1
  (+ F-SC-9), F-LK-1, F-SEL-2 — still carried `containedInPR: 2` in `reference/findings.json` (since updated: all five read `containedInPR: null`,
  verified 2026-10-12 in the human-fallback audit entry below).

### 2026-10-12 — plan edit (human-fallback audit: no step depends on a person) — Claude Opus 5.5

- **Checked against:** MJ `origin/next` @ `4ff478ad98`; `program/decisions.md` D-006, D-007, D-029–D-032;
  `gh secret list -R MemberJunction/MJ` (13 repository secrets: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, no
  `INTEGRATION_LIVE_MODEL_KEYS`); `gh api repos/MemberJunction/MJ/actions/organization-secrets` (`APP_PRIVATE_KEY`,
  `TURBO_REMOTE_CACHE_SIGNATURE_KEY`, `TURBO_TOKEN`); `reference/findings.json` (F-TR-9, F-L4-1, F-SC-9, F-LK-1, F-SEL-2:
  `containedInPR: null`).
- **Anchors:** ok 175 · moved 1 · changed 0 · missing 0 · skipped 9 (moved: `story-agent-run-message`, as before).
  Added 19 `auto-*` anchors (the G0.6 model and key, the Playwright harness and sign-in script, the Predictions and
  Studio selectors the spec uses, the promotion gate's sign-off rule, and the guide and run-note sentences C2.1/C5.4
  correct). The 9 non-MJ anchors pass §8's scripted check against a Loom clone and ps-review (`# non-MJ anchors not
  found: 0`).
- **Plan edits (each replaces a step that relied on a person):** §2.1 prerequisite check — "ask the owner for an
  archive" → per-line automatic remedies and D2-36; §2.5 Explorer row — private Explorer on 4221 pointed at the
  agent's MJAPI, with a ready check; §5.3 "manual dispatch" → `workflow_dispatch`; M6.1 — live-model keys from
  `GEMINI_API_KEY` when `INTEGRATION_LIVE_MODEL_KEYS` is absent, written before MJAPI boots, red when neither yields the
  GeminiLLM key (D2-33); bizapps-common "reviewed commit" → nightly-green rule (D2-38); M6.2 Step 2 — G0.6 measured;
  M6.5 — "README reviewed against a fresh terminal" → `truth:readme` walkthrough + `src/readme` tests (D2-35); C2.1 —
  the guide's "stays Draft for a human" states the gate's sign-off rule; C4.2 — `ps-row-driver-label` test id; C4.5
  Step 3 — G0.6 measured locally with the GeminiLLM key or by the weekly dispatch; C4.5 Step 4 and C6.6 Step 4 —
  "manual UI check" → `truth:ui-fixture` + Playwright spec + component DOM tests, tier chosen by `prime-auth.mjs`'s
  output (D2-34); C5.4 — the run note and guide §6.4 no longer say a person must confirm; C3 — product copy and
  comments no longer say "review"; M5.6/M5.9/C1.4/C3.4/A19 — "human promote" → the product's promote operation;
  M-final.1 Step 4 — G0.6 rule; M-final.2 Step 3 — no stop on an unmerged Loom PR (D2-37); M-final.3 Step 4 — README
  walkthrough re-run; M-final.5 — PR 1's follow-ups go to PR 1's executing agent through its plan's §11; M-final.6 —
  `gh pr ready`, no review step (D2-39); §7 note; §8 — scripted check for non-MJ anchors; §9 — D2-03, D2-18, D2-32
  wording, D2-33–D2-39, R-3, R-5 (resolved), R-b, R-f, the open questions become product-direction questions with
  implemented defaults.
- **Decisions recorded:** §9 D2-33 (G0.6 key source), D2-34 (two-tier automated UI check), D2-35 (README walkthrough),
  D2-36 (ps-review host rule), D2-37 (unmerged Loom companion), D2-38 (bizapps-common pin bump rule), D2-39 (ready
  without review).

### 2026-10-13 — plan edit (coding-standards audit, D-035) — Claude Opus 5.5

- **Checked against:** `reference/coding-standards.md` (D-035) with the PR 1 controller's rulings S1–S4, the MJ rules
  `.claude/rules/typescript-style.md` and `data-access.md`; MJ code at `c92d4a47f9` for every API a fix depends on
  (`MLSidecar` statics and `Port`/`start`/`stop`, `ManageMetadataBase` new-field registry, MetadataSync config helpers,
  `ProductionScoreRecordSetRunner` scope resolution, `MLModelInferenceProcessor.loadModel`/`Preflight`, `AIEngine.Config`'s
  provider parameter, `IntegrationBootstrapContext.Provider`, `TestRunResult`, entity `Status` unions, trust bands,
  `main.py`'s import convention). Anchors: `node tools/check-anchors.mjs … ~/repos/MJ_PR1 origin/next` (`c2f9f59900`) →
  `ok 175 · moved 1 · changed 0 · missing 0 · skipped 9` (unchanged; no anchor edited).
- **Plan edits:** code blocks and the prose that names them, so implementers transcribe compliant code — static
  members on owning classes instead of new exported free functions (`PythonProbe`, `MLSidecar.ResolvePython`,
  `GateRegistry`/`GateRegistryValidator`, `ConfidenceInterval`/`Binomial`/`SeedRule`, `GateResults`/`GateSelection`,
  Loom `ChildIndex`/`LogisticRefit`/`LatentDialDeclarations`, `DataCache`, `CausalCopyScan`, `ReadmeSteps`,
  `ReadCapExceededError`, `ModelNotScorableError.CanScore`, `ImportanceDisplay`, `CausalCopy`,
  `AsOfSettingHasNoEffectError.WouldBeIgnored`, `EvaluationLineage`); PascalCase for new protected members (S4) and
  camelCase for module-internal functions; typed error classes with structured fields instead of plain `Error`
  messages; strict equality; `||` fallbacks (`??` only with a comment); derived status unions; the passed provider in
  the agent/story steps; `NormalizeUUID` matching; top-level `await` script tails; a fail-closed allow-list for scorable
  statuses (D2-C3's own wording); shared `w-world.ts` lists; a cached Angular getter; mutation-check tables in every
  task that adds a guard (with new tests where a guard had none — test counts swept: registry 6, outcomes 4, csv 5,
  test:db 2, containment-probe 4 + 3, Engine C3 +11); release notes, remediation paths and the "run by AI"
  disclosure in §10; §6 shared notes; §9 "Standards rulings pending" (SR-1…SR-6) for the items that would change a
  name another plan consumes or a recorded decision.
- **Decisions recorded:** none changed. SR-1…SR-6 each carry their implemented default. The header's "Last refresh" is
  unchanged: this edit ran the anchor check but not the §8 assumption checks.


### 2026-10-15 — plan edit (D-058 prediction materialization, D-060 gate G5.6) — Claude Sonnet 5.5

- **Checked against:** `reference/gates.json` (111 gates; `node -e` counts: phases 0: 12, 1: 12, 2: 41, 3: 11, 4: 9, 5: 6, 6: 12, 7: 8; owners PR 1: 5, PR 2: 10, PR 3: 53, PR 4: 31, PR 5: 12); `program/decisions.md` D-058–D-060.
- **Anchors:** ok 153 · moved 23 · changed 0 · missing 0 · skipped 9 (identical to the count before the edit).
- **Plan edits:** gate totals and owner/phase counts in the header, §1, §4.2, §5.2, M2 outcome, import step, registry tests, validator, CLI text and package description, M5 and M-final expected lines, §10; the import step carries G5.6 (`OwnerPR: 4`, `amendedBy`, `p11Threshold: null`) with its check.
- **Decisions recorded:** none new in this plan.

### 2026-10-20 — refresh (triggers a & b: PR 2 kickoff after PR 1 `#5540` merge + adversarial coding-standards audit) — Antigravity

- **Checked against:** MJ `origin/next` @ `141d8d065c` (PR 1 `#5540` merge commit); Loom `63aec01f61` (`/Users/arieglazier/repos/ps-review/src/loom`); ps-review `d47dfb86f1` (`/Users/arieglazier/repos/ps-review`); `MemberJunction/bizapps-common#354` @ `76809d340e450905f1c80730a62ad3485aabeca0`; `coding_standards.md`, `AGENTS.md`, and `journal/2026-10-20-PR-1-lessons-learned.md`.
- **Anchors:** `node tools/check-anchors.mjs plans/PR-2-truth-suite-containment.md /Users/arieglazier/repos/MJ_20260925 origin/next` → `# ok 169 · moved 0 · changed 0 · missing 0 · skipped 9` at `141d8d065c` (after updating `atCommit` to `141d8d065c`, updating moved line hints, and removing the 7 `CodeGenLib`/`MetadataSync` modification anchors per D2-43). Non-MJ anchors: `# non-MJ anchors not found: 0` (all 9 `ok`).
- **Assumptions:** A1–A22 verified at `141d8d065c`: A1 `1`, A2 `0`, A3 `numpy==1.26.4` + `scikit-learn==1.4.2`, A4 `1`, A5 `1`, A6 `63aec01f61` (0 new commits), A7 `1` (`E404`), A8 `≥ 1` (`F-ENV-12` upstream on `next`), A9 `≥ 1` (`F-L2-1` upstream on `next`), A10 `5`, A11 `2`/`1`, A12 `1`, A13 `d47dfb86f1` (`0` dirty), A14 `1`, A15 `1`/`0`, A16 `0`, A17 `1`/`1`, A18 `1` (PR 1 merged → order A), A19 `0`, A20 `1`, A21 `0`/`1`/`1`, A22 `PUBLIC` (`>=6.1.5 <7.0.0` vs MJ `6.3.0`).
- **Dependency changes consumed (trigger b):** PR 1 (`#5540`) merged on `origin/next` (`141d8d065c`):
  1. PR 1 extracted `@memberjunction/feature-pipelines-engine` (`packages/AI/Knowledge/FeaturePipelinesEngine`), so `.github/workflows/ps-truth-suite.yml` (M6.1) adds `packages/AI/Knowledge/FeaturePipelinesEngine/**` to its `paths` trigger.
  2. PR 1 shipped 4 of its 5 Phase-7 gates (`G7.1`, `G7.2`, `G7.3`, `G7.5`) as `MJ: Tests` rows with ASCII `->` in `Name` and extracted `G7.8` (`C1 → C3.3`) into patch 04 (`patches/04-agent-framework-strict-parameters.md`); M-final.5 bridges those 4 rows, maps `→` to `->` in `runMJTest`, and leaves `G7.8` as `Kind: "stub"` (`D2-45`).
  3. PR 1's companion `MemberJunction/bizapps-common#354` was opened from fork `arie-glazier-bcc/bizapps-common` at `76809d340e450905f1c80730a62ad3485aabeca0`; M-final.5 queries PR `#354` directly via `gh pr view 354` (`D2-47`).
- **Plan edits (adversarial review against `coding_standards.md`, `AGENTS.md`, and PR 1 lessons learned):**
  - Converted M1.6 (`F-ENV-12`), M1.7 (`F-L2-1`), and M1.8 (`F-ENV-7`) to read-only verification tasks since all three landed upstream on `origin/next` (`D2-43`).
  - Moved `AtRiskRules` pure functions to `@memberjunction/predictive-studio-core` (`packages/AI/PredictiveStudio/Core/src/at-risk-rules.ts`) and moved `G0.4`/`G0.5` into `TruthSuite/gates/containment.gates.test.ts` as `Kind: "body"` so `@memberjunction/ng-dashboards` contains zero TruthSuite test-harness files and `run-truth.mjs` runs a single vitest invocation (`D2-44`).
  - Scoped `D-053` (`@deprecated` alias removal) strictly to files touched by PR 2 (`D2-46`).
  - Replaced `JSON.parse(...) as T` with `SafeJSONParse<T>` from `@memberjunction/global` across TruthSuite and e2e code blocks (M2.3, M3.5, M5.6, C4.5, C5.6, M-final.5).
  - Enforced `coding_standards.md` §1 `PascalCase` and `ID` capitalisation on all new interfaces/methods (`WorldID`, `ScenarioID`, `RunID`, `Train(..., opts?: { MaxRows?: number; AsOf?: ... })`, `Interval { Lower, Upper }`, `AcceptanceRange { Min, Max }`, `TruthCsv.Parse { Header, Rows }`, `BulkLoader.Insert`, `LoadSummary { Table, Rows, People, Ms }`, `ContainmentProbe.StoryPromptFiles`/`TopDriverBadges`/`AtRiskListRecordIDs`, `RunFixtures.TrainedModel`/`W1S42Model`/`W1S42ValidatedModel`).
  - Passed explicit `provider` to `new AgentRunner(ctx.Provider)` (`agent-step.ts`, `story-step.ts`) and `new RunViewRecordLoader(provider)` (`run-experiment.deps.ts`), and added `// global-provider-ok:` on the fallback `new RunView()` in `score-record-set.runner.ts` (`C1.2`).
  - Chunked `resolveList` `ID IN (...)` queries in `score-record-set.runner.ts` (`C1.2`) into batches of 100 via `rv.RunViews` with `IgnoreMaxRows: true`.
  - Replaced the multi-line regex in `CausalCopyScan.UserFacingText` (`M5.9`) with a linear character scanner so CodeQL `js/polynomial-redos` cannot trigger, and replaced the `RegExp(key)` in `readme-walkthrough.mts` (`M6.5`) with `.split(/\r?\n/).find(...)`.
  - Fixed `PSRowDriversComponent.Drivers` input type (`readonly RowDriver[] | null | undefined`) for Angular `strictTemplates` (`C4.2`) and fixed C6.5 Step 3's diagram text to match `D-030`.
- **Decisions recorded:** §9 `D2-43`–`D2-47`; program decisions `D-022` and `D-023` confirmed in `program/decisions.md`.
