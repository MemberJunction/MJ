# Release-time doc drift detection

## Status
- **Status**: Proposal, for review by the docs-site owner (Craig). Nothing here is built.
- **Created**: 2026-11-15
- **Scope**: what runs when a release is published, to find docs that release made stale and open a PR to fix them.

## The problem

The release path already publishes docs well:

| Piece | What it does |
|---|---|
| `docs.yml` | Builds one Starlight set per release line from a released ref, then deploys |
| `docs-site/scripts/ingest.mjs` | Pulls in every guide, package README, root doc and skill with no hand-listing |
| `generate-release-notes.yml` and `/notes` | Write `releases/v*.md` in the format `releases/README.md` defines |
| `/update-package-readme`, `/update-readmes-batch` | Rewrite READMEs, run by hand |
| `check:claude-md` | Checks that links and paths in **instruction files** resolve |

What nothing does: tell us **which** guides and READMEs a release made wrong. The docs site faithfully publishes whatever the docs say, including what stopped being true three releases ago. `/update-readmes-batch` either rewrites everything (costly, noisy diffs) or does not run.

### Measured on `next` at 2026-11-15

A one-off scan of the docs `ingest.mjs` publishes (guides, package READMEs and CLAUDE.md files, plus `.claude/rules`): 462 files, 1,694 file citations.

| Finding | Count |
|---|---|
| Citations to a file that no longer exists | **71**, in 24 docs |
| `path:line` citations past the end of the file | 3 |
| Worst docs | `REALTIME_BRIDGES_GUIDE.md` (21), `OPEN_APP_CI_CD_AND_RULESETS_GUIDE.md` (20) |

Some of the 71 are deliberate: illustrative names like `V…__My_New_Feature.sql`, and files that live in Open App repos, not here. So the real count is lower, and a gate needs an allow-list for those. Line citations that still fall inside the file but now point at the wrong code can't be counted without history. That is the larger, silent class.

## Proposal: three stages, each worth having alone

### Stage 1: a deterministic citation check (no new dependencies)

A Node script in the style of `check-claude-md.mjs`. Over the same doc set `ingest.mjs` publishes, it checks:

- every cited repo path exists
- every `path:line` / `#Lnn` citation is within the file
- every backticked exported symbol cited next to a path is still exported from that path

It also needs an allow-list for illustrative and cross-repo paths.

**Where it runs (Craig's call):**
- (a) as a report-only step in `docs.yml` on the release ref, posting a summary
- (b) as a PR check on changes to `guides/**` and `packages/**/README.md`
- (c) both

My suggestion: (b) report-only for a soak period, then gating, the same path `check:claude-md` took.

### Stage 2: what changed structurally between two release tags

The input to targeted doc refresh is "which exported things were added, removed or renamed since the last tag". Two ways to get it:

| | TypeScript compiler API, our own script | [Graphify](https://github.com/Graphify-Labs/graphify) `--code-only` |
|---|---|---|
| Runtime | Node, already in CI | Python 3.10+ in the docs job |
| What it sees | Exported TS symbols per package | A tree-sitter code graph, ~40 languages, clusters, a query CLI and an MJ-agnostic MCP server |
| Cost | No LLM | No LLM for code; docs and PDFs need one |
| Maintenance | Ours | A young third-party project (Apache-2.0 / MIT) |
| Blind spot | Metadata and string-keyed links (`@RegisterClass`, `DriverClass`, `EntityName: 'MJ: …'`) | The same blind spot: most real MJ coupling is metadata, not imports |

**Recommendation:** start with our own exported-symbol diff. MJ is almost entirely TypeScript, so it covers the need with nothing new in CI. We already walk the TS AST for `mj codegen manifest` and the standards checks. Keep Graphify as a time-boxed spike, worth it only if we want cross-repo graphs (MJ plus the BizApps repos) or its query tools for agents. Note the same blind spot under either option: MJ's metadata-level links are what the Canon semantic graph (`plans/canon-semantic-graph.md`) covers, and that graph could feed this step later.

**Spike, not yet run:** it needs approval to install and run a third-party Python tool against the repo, which I did not have in the session that wrote this.
1. In a scratch directory, `git archive` two release tags.
2. Run `graphify extract <dir> --code-only` on each.
3. Diff the two `graph.json` files.
4. Record runtime, output size, and whether it resolves our path aliases, decorators and re-exports.

Half a day.

### Stage 3: a targeted refresh PR after each release

After `publish.yml`, a job:
1. computes the Stage 2 diff since the previous tag;
2. finds the guides and READMEs that cite a changed symbol or path;
3. hands only those files to a Claude job, the same way `generate-release-notes.yml` already runs Claude, with `/update-package-readme`'s instructions;
4. opens one PR into `next`, titled `docs: refresh for vX.Y.Z`, listing each file and the symbol that triggered it.

People review it like any other PR. Nothing is published unreviewed, and the docs site picks it up on the next release (or the next line redeploy).

Optionally, the release notes gain a short **Docs touched by this release** section from the same list.

## What I'd like from you

1. Is Stage 1's report-only PR check the right first step, and should it share code with `check-claude-md.mjs`?
2. Python in the docs job: acceptable, or a hard no (which settles Stage 2 in favour of the TS script)?
3. Stage 3's trigger: a step at the end of `publish.yml`, or a `workflow_run` like `docs.yml`? It has to fit how line releases dispatch `docs.yml`.
4. Should the Open App repos run the same thing against their own READMEs?
5. Who owns reviewing the refresh PRs?

## Out of scope
- Writing docs from scratch, or auto-merging anything.
- Changing the site build, the ingest rules, or the release-notes format (`releases/README.md` stays the single definition).
