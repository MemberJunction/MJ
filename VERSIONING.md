# MJ Versioning: Edge and LTS, in plain language

> The complete policy lives in [`plans/lts-process.md`](plans/lts-process.md) (canon, adopted 2026-08-03).
> This page is the distillation: what the release channels mean and what to do about them —
> for users running MJ, contributors changing MJ, and LLM agents working in this repo.
> Release **operators** should read the [Release Engineering Runbook](guides/RELEASE_ENGINEERING_RUNBOOK.md).

## The problem this solves

MJ ships fast, often several times a week. That's great for development speed and terrible
for anyone running production: there was previously no way to tell a solid release from one
carrying yesterday's experiment. We're not slowing down. Instead the firehose is split into
two channels.

## Edge: the fast lane

Edge is what every MJ release has always been — continuous releases off the `next` branch,
several per week. Version numbers now say so explicitly: **`6.1.0-edge.4` means "a preview
of what will eventually become 6.1.0"** (the counter starts at 0 and ticks per release). If
you build against Edge you get features
the day they land, and you accept that stability isn't promised. Edge is opt-in on purpose.

## LTS: the certified lane

Periodically, we take a snapshot of the fast lane and call it a **candidate**. The candidate
then has to *earn* the LTS label by passing **certification** — a checklist, not a feeling,
where every item produces evidence someone can go look at:

1. All automated tests green: unit, integration, database migration checks.
2. A full UI regression suite against a fresh install.
3. Fresh installs on clean machines work end to end.
4. Real environments upgrade to the candidate and run it for days (the "soak").
5. Humans hammer the core flows: navigation, search, views, forms, auth.
6. Zero open blocker bugs, and a named person signs off.

If testing finds bugs, fixes go in and the candidate gets patched. When the checklist passes,
that exact build is certified: it becomes the new LTS, npm's `latest` points at it, and a
scorecard in `certifications/` documents what was tested. If a candidate can't pass, it's
withdrawn and the next cycle starts fresh. Slipping a date is fine; certifying weak is not.

After certification, an LTS line barely changes — that's the point. Each LTS lives on its own
branch (`lts/6.1`) and only ever receives patches: bug fixes and security fixes, never
features. Fixes always land on `next` first and are copied to the line branch, so nothing
exists only on an old line. Every LTS patch declares whether it touches your database
(`dbImpact`), so "safe to apply" is something you read, not guess.

**Support windows:** full maintenance while a build is the newest certified release; critical
and security fixes only for one further cycle after it's superseded; then end of life. Dates
measure from actual certification, so a delayed release never silently shortens support.

## Quick reference

### Version grammar

| You see | It means |
|---|---|
| `6.1.0-edge.4` | Edge: the 5th preview build streaming toward line 6.1. Not certified. |
| `6.1.0` | The candidate for line 6.1 — the Edge stream's tip, renumbered. Under certification. |
| `6.1.2` | A patch on line 6.1. If line 6.1 is certified, this is an LTS build. |
| `6.0.0` | Era baselines (`x.0.0`) are never published. If you see one, something is wrong. |

Plain semver versions are only ever candidates or certified builds. Anything experimental
carries an `-edge.N` suffix. The machine-readable source of truth for what's certified,
maintained, or end-of-life is [`release-lines.json`](release-lines.json).

### "Does this update touch my database?" — read `dbImpact`, not the digits

**Never infer a schema change from the version number.** On a certified line **everything is a
patch**, migrations included — a metadata migration, a CodeGen repair, and (rarely) a schema
migration all ship as `6.1.5` → `6.1.6`. So a patch tells you nothing about your database either
way, and a minor is a new certified line rather than an announcement about DDL.

The signal is [`dbImpact`](release-lines.json), carried per release and surfaced by `mj versions`
and the release notes — deliberately, as the honest replacement for smuggling that signal into
version digits:

| `dbImpact` | Means |
|---|---|
| `none` | Code only. |
| `metadata` | Data-only migration — metadata and config tables. |
| `repair` | CodeGen-owned procs/views/indexes re-created. Your schema does not change. |
| `schema` | DDL. Rare on a line, and security-driven when it happens. |

**Do not read MJ's `minor` as "new API", or its `patch` as "no new API" either.** Every package
shares one `fixed` group (`.changeset/config.json`), so all ~300 move to the same version whether or
not they changed — a consumer of one package already receives bumps driven entirely by packages they
do not use. The version number cannot carry per-package semver meaning; `dbImpact` and the release
notes are where the meaning lives.

Authoring side, for contributors and agents: [`.claude/rules/changesets.md`](.claude/rules/changesets.md).

### npm dist-tags

| Tag | Meaning |
|---|---|
| `latest` | The newest **certified** build. Moves only at certification. The safe default. |
| `edge` | The newest Edge build. Explicit opt-in. |
| `lts-6.1` | The newest build on line 6.1 (bootstrap era: `lts-5`). Pin this to follow one line. |

### Branches and labels

| Thing | Meaning |
|---|---|
| `next` | Development. All PRs target it. Runs in Edge prerelease mode. |
| `main` | The release mirror: merging `next → main` triggers the Edge publish. |
| `lts/6.1` (bootstrap: `lts/5`) | A certified (or in-certification) line. Patches only. |
| Label `backport lts/6.1` | Put on a **merged** `next` PR; a bot opens the cherry-pick PR to the line. |
| Label `cert-blocker` | This bug blocks a certification; it jumps every queue. |
| Labels `metadata-migration` / `codegen-repair` / `security-exception` | The three kinds of DB-touching change allowed on a line, in escalating rarity. See §12 of the process doc. |

## What this means for you

**Users running production:** use LTS. `latest` and MJ tooling default to the newest certified
build, so the safe choice is the lazy choice. Upgrading LTS → LTS is the supported, tested
path, including skipping everything that happened on Edge in between. Want the newest stuff?
Opt into Edge deliberately (`releaseChannel: 'edge'` in `mj.config.cjs` — a committed,
review-visible team decision).

**Contributors:** day to day, nothing changes. PRs target `next`, you add changesets as usual,
Edge ships as fast as ever. The visible difference is the `-edge.N` suffix on versions. If your
merged fix should reach an LTS line, add the `backport lts/<line>` label and a bot does the
rest. You never run `changeset pre enter` or `exit` — those are release choreography.

**LLM agents working in this repo:**

- Never edit version numbers, `.changeset/pre.json`, or `release-lines.json` by hand;
  never run `changeset pre enter`/`exit` or `changeset version` unless the task explicitly
  is release engineering (then follow the [runbook](guides/RELEASE_ENGINEERING_RUNBOOK.md)).
- `lts/*` branches accept patches only, via `next`-first backports. Features never.
- Policy questions resolve in this order: [`plans/lts-process.md`](plans/lts-process.md)
  (canon) → the runbook → this page.
