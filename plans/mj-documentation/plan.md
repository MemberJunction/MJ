# MemberJunction Docs Site — Migration Plan

> **Status:** Prototype / draft for review.
> **Scope:** Replace the legacy `docs.memberjunction.org` site with a thin GitHub Pages hub that indexes content already living in our repos. Preserve the brand URL via CNAME.
> **Owner of this plan:** TBD
> **Target sunset of legacy site:** TBD (after content audit + CNAME flip)

---

## 1. Goals

1. **Single source of truth.** All long-form prose lives in the repo it documents (READMEs, `/guides/`, JSDoc). The site never owns content — it indexes, embeds, or renders content fetched from repos at build time.
2. **Preserve the brand URL.** `docs.memberjunction.org` continues to resolve to a useful, branded landing page.
3. **Multi-repo aware.** First-class surfacing of `MJ`, `Skyway`, `Forge`, `VSCode`, `bizapps-*` and other org repos.
4. **Auto-rebuild on release.** No manual sync step. Pushing to `main`/`next` (or cutting a tag) rebuilds the site.
5. **Cheap to run, cheap to maintain.** Free GitHub Pages hosting. < 30 minutes/month of human attention in steady state.
6. **Clear path for newcomers.** "Where do I start?" is answered in one click from the landing page.

## 2. Non-goals

1. **Not a CMS.** No editing UI. Edits happen via PRs in the source repo.
2. **Not a video host.** If video tutorials emerge, link to them externally.
3. **Not a tutorial library.** Tutorials live in repo READMEs or the `training` repo if that's revived.
4. **Not versioned.** One current cut. Historical snapshots are reachable via git tags on the source repos. (Re-evaluate if/when we hit a v6 with significant API churn.)
5. **Not a community forum.** Discussions stay on GitHub.
6. **Not a hand-curated copy of READMEs.** If you find yourself copy-pasting from a README into the site, stop — fix the build to render it instead.

---

## 3. Information Architecture (sitemap)

```
/                            Landing page — what is MJ + paths into the docs
                              (Includes a "Skip the ops — run MJ on MJC" CTA linking to central.memberjunction.com)
/getting-started             Prerequisites, install, first run, quick start
                              (Includes a "…or skip self-hosting — try MJC" callout next to the install steps)
/architecture                System overview, layers, design philosophy, links to deep dives
/guides                      Index of all /guides/*.md files in MJ repo (rendered)
  /guides/caching            Rendered from MJ:/guides/CACHING_AND_PUBSUB_GUIDE.md
  /guides/dashboards         Rendered from MJ:/guides/DASHBOARD_BEST_PRACTICES.md
  /guides/lazy-loading       Rendered from MJ:/guides/LAZY_LOADING_GUIDE.md
  /guides/uuid-comparison    Rendered from MJ:/guides/UUID_COMPARISON_GUIDE.md
  /guides/theming            Rendered from MJ:/guides/THEMING.md
  /guides/navigation         Rendered from MJ:/guides/NAVIGATION_AND_ROUTING_GUIDE.md
  /guides/taxonomy-tagging   Rendered from MJ:/guides/TAXONOMY_TAGGING_GUIDE.md
  /guides/content-autotagging  Rendered from MJ:/guides/CONTENT_AUTOTAGGING_GUIDE.md
  /guides/base-entity-server   Rendered from MJ:/guides/BASE_ENTITY_SERVER_PATTERNS.md
  /guides/app-color-architecture  Rendered from MJ:/guides/APP_COLOR_ARCHITECTURE.md
/packages                    Full package directory (mirrored from MJ root README)
/ai-and-agents               AI providers, agent framework, MCP/A2A, prompt engine
  /ai-and-agents/skills      Catalog of MJ-published Claude Code agent skills (install + usage)
/migrations                  Database migrations, Skyway, Flyway, schema evolution
/custom-apps                 Building applications on MJ
/ecosystem                   Skyway, Forge, VSCode, BizApps, sample apps
/community                   Discussions, contributing, issues, releases, support
/api/                        TypeDoc HTML output (auto-generated per release)
/404.html                    Custom 404 with "did you mean..." links
```

**Top nav (persistent):** Home · Getting Started · Architecture · Guides · Packages · AI & Agents · Ecosystem · API Reference · GitHub · **MJC ↗** (visually distinct CTA link to central.memberjunction.com).

**Footer:** Discussions · Issues · Releases · npm · License · Contact · **Hosted MJ (MJC)**.

---

## 4. Content sourcing strategy

| Section | Source | Method |
|---|---|---|
| Landing page | This repo (`docs` repo's `index.md`) | Hand-authored, short |
| Getting Started | `MJ/README.md` + `MJ/UPGRADE-v5.0.md` + `MJ/DEPLOYMENT.md` | Excerpted via remark/MDX includes; never copy-pasted |
| Architecture | Hand-authored prose + Mermaid diagram from `MJ/README.md` | Authored once, mostly stable |
| Guides | `MJ/guides/*.md` | Pulled at build time, rendered as-is |
| Packages | `MJ/README.md` package directory section | Parsed from the README, rendered as table |
| Package READMEs | `MJ/packages/*/README.md` | Linked, not embedded (too much volume) |
| AI Providers | `MJ/packages/AI/Providers/*/README.md` | Linked |
| API Reference | TypeDoc on MJ release | Built artifact, deployed to `/api/` |
| Ecosystem | `Skyway/README.md`, `Forge/README.md`, `VSCode/README.md`, `bizapps-*` | Pulled at build time, brief excerpt + link |
| Community | Static, hand-authored | Updated rarely |

**Rule:** if content can be auto-pulled, it must be. Manual content is reserved for navigation, narrative connective tissue, and pages that don't have a natural home in a single repo.

---

## 5. Technology choice

### Recommended: **Astro Starlight** ([starlight.astro.build](https://starlight.astro.build))

**Why:**
- Markdown/MDX-first. Works directly with our existing `.md` files.
- Built-in nav, search (Pagefind), light/dark mode, mobile responsive.
- Static output. Deploys to GitHub Pages with no runtime.
- "Bring your own framework" components for the few interactive bits we want.
- Active community, MIT-licensed, low ceremony.
- Multi-repo content handled via either:
  - A pre-build step that `git clone`s/sparse-checks repos and copies markdown into the Astro project; or
  - The `@astrojs/starlight-remote-content` plugin (or a lightweight homebrew loader).

### Alternative considered: **Docusaurus**
- More batteries included (versioning, plugins).
- Heavier, more opinionated.
- React-only (we'd be carrying a React build in an Angular-first org).
- Suggested if/when we adopt versioning or plugin-heavy customization.

### Alternative considered: **Just GitHub-rendered markdown + GH Pages with a theme**
- No SSG, no build pipeline.
- Lower ceiling: no cross-repo aggregation, no search, less polish.
- Reasonable interim if we want to ship in a week.

### Decision tree
- **Need it shipped in 1 week?** Use just-the-docs Jekyll theme on GH Pages with the existing CNAME.
- **Need it shipped right and durable?** Astro Starlight.
- **Need versioned docs across major releases?** Docusaurus.

This plan assumes **Astro Starlight**.

### Component approach

Use **Astro components** by default. Reach for a framework integration (React, Vue) only when an existing component library justifies it — and isolate those imports. We're not optimizing for a future Docusaurus migration; we're optimizing for one clean, durable build.

---

## 6. Repository layout

### Recommended: separate `MemberJunction/docs` repo

```
MemberJunction/docs/
├── .github/workflows/
│   ├── build-deploy.yml       # builds + deploys on push and on schedule
│   └── refresh-content.yml    # manual workflow_dispatch to force-refresh
├── astro.config.mjs
├── package.json
├── public/
│   ├── CNAME                  # contains "docs.memberjunction.org"
│   ├── logo.svg
│   └── og-image.png
├── src/
│   ├── content/
│   │   ├── docs/              # hand-authored pages (index, architecture, etc.)
│   │   ├── guides/            # populated at build time from MJ/guides/
│   │   └── ecosystem/         # populated at build time from sibling repos
│   ├── components/            # custom Astro/React/Vue components
│   ├── styles/
│   └── pages/
├── scripts/
│   ├── fetch-content.mjs      # the cross-repo content aggregator
│   └── build-typedoc.mjs      # invokes TypeDoc against MJ checkout
└── README.md
```

**Why a separate repo:**
- Decouples site cadence from MJ release cadence.
- Cleaner permissions (docs editors don't need MJ write access).
- Smaller working set for site contributors.
- MJ repo doesn't gain a `/site/` directory that competes with `/packages/` mentally.

**Tradeoff:** content updates that span a guide *and* the site nav require two PRs (one in MJ, one in `docs`). In practice nav rarely changes, so this is fine.

### Alternative: `/site/` folder in MJ
- One PR for code + docs changes that cross both.
- But: MJ already has a 175-package monorepo. Adding a site to its build matrix increases CI time.
- And: not all docs come from MJ — Skyway/Forge contributors shouldn't have to PR into MJ.

**Decision:** separate `docs` repo.

---

## 7. GitHub Actions workflow

### `.github/workflows/build-deploy.yml`

```yaml
name: Build & deploy docs

on:
  # Rebuild when docs repo changes
  push:
    branches: [main]
  # Rebuild nightly to pick up upstream README/guide changes
  schedule:
    - cron: "0 9 * * *"   # 09:00 UTC daily
  # Rebuild on demand
  workflow_dispatch:
  # Rebuild when MJ cuts a release (via repository_dispatch trigger from MJ workflow)
  repository_dispatch:
    types: [mj-released, skyway-released, forge-released]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout docs repo
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install
        run: npm ci

      - name: Fetch upstream content
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/fetch-content.mjs

      - name: Build TypeDoc from MJ
        run: node scripts/build-typedoc.mjs

      - name: Build site
        run: npm run build
        env:
          PUBLIC_SITE_URL: https://docs.memberjunction.org

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### `scripts/fetch-content.mjs` (shape)

```js
// Sketch — clones (sparse) or fetches raw markdown from sibling repos
// and drops it into src/content/* in a normalized structure.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCES = [
  {
    repo: "MemberJunction/MJ",
    ref: "main",
    paths: ["guides/*.md", "README.md", "UPGRADE-v5.0.md", "DEPLOYMENT.md"],
    dest: "src/content/upstream/mj/",
  },
  {
    repo: "MemberJunction/Skyway",
    ref: "main",
    paths: ["README.md"],
    dest: "src/content/upstream/skyway/",
  },
  {
    repo: "MemberJunction/Forge",
    ref: "main",
    paths: ["README.md"],
    dest: "src/content/upstream/forge/",
  },
  {
    repo: "MemberJunction/VSCode",
    ref: "main",
    paths: ["README.md"],
    dest: "src/content/upstream/vscode/",
  },
  // ...bizapps-common, bizapps-tasks, committees, sample-app, etc.
];

for (const src of SOURCES) {
  for (const p of src.paths) {
    const url = `https://raw.githubusercontent.com/${src.repo}/${src.ref}/${p}`;
    const res = await fetch(url, {
      headers: process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {},
    });
    if (!res.ok) {
      console.warn(`SKIP ${url}: ${res.status}`);
      continue;
    }
    const body = await res.text();
    const dest = path.join(src.dest, path.basename(p));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }
}
```

### `scripts/build-typedoc.mjs` (shape)

```js
// Sketch — clones MJ at the latest release tag, runs TypeDoc against
// the public-facing packages, copies output to dist/api/.
// On a 175-package monorepo, this is non-trivial. Two strategies:
//
//   1. Run TypeDoc against an entry-point package set (e.g. @memberjunction/core,
//      @memberjunction/ai, @memberjunction/server, @memberjunction/global) and
//      lean on TypeDoc's "external" links for the rest. ~5-10 min build.
//   2. Move TypeDoc generation INTO the MJ repo's release workflow, publish
//      it to a release artifact, and have this script just download the artifact.
//      ~30 sec build. Recommended.
//
// Recommendation: option 2. Add a step to MJ's existing release workflow that
// uploads typedoc-output.zip as a release asset, then this script downloads
// the latest release's asset and unzips it into ./dist/api/.
```

### Triggering rebuilds from MJ on release

In `MJ/.github/workflows/release.yml` (or wherever the release is cut), add:

```yaml
- name: Notify docs site
  if: success()
  run: |
    curl -X POST \
      -H "Authorization: Bearer ${{ secrets.DOCS_DISPATCH_TOKEN }}" \
      -H "Accept: application/vnd.github+json" \
      https://api.github.com/repos/MemberJunction/docs/dispatches \
      -d '{"event_type":"mj-released"}'
```

`DOCS_DISPATCH_TOKEN` = a fine-grained PAT with `Contents: write` on `MemberJunction/docs`.

---

## 8. CNAME setup for `docs.memberjunction.org`

1. **Add CNAME file** to `MemberJunction/docs/public/CNAME` with one line:
   ```
   docs.memberjunction.org
   ```
2. **In the GH Pages settings** for the `docs` repo, set the custom domain to `docs.memberjunction.org` and enable "Enforce HTTPS".
3. **At the DNS provider** (whoever owns `memberjunction.org`):
   - Update the existing `docs` CNAME record from `<current-vendor>` to `memberjunction.github.io`.
   - TTL: drop to 300s a day before the cutover, raise back after.
4. **Verify** with `dig docs.memberjunction.org` — should resolve to GitHub Pages IPs.
5. **Wait for cert provisioning** (GitHub auto-provisions Let's Encrypt; usually < 1 hour).

> **Don't flip the CNAME until the soft-launch site has been QAed at the temporary `memberjunction.github.io/docs` URL.**

---

## 9. Phased migration

### Phase 0 — Audit (1-2 days, low effort)
- **Legacy site context:** `docs.memberjunction.org` is currently hosted on **readme.com**. The content there is significantly out of date and largely superseded by in-repo READMEs and `/guides/`. **Do not invest in a full content port** — it would slow Phase 1 down for little gain.
- **What to do instead:**
  - Export the readme.com project (their dashboard has an export button).
  - Skim the top-level page list and identify any page that contains content NOT already in this repo. Expected: a handful at most.
  - For each, decide: (a) move it into the appropriate repo as markdown, or (b) discard as stale.
  - Capture the URL list for the 301 redirect map in Phase 2.
- **Output:** a one-page memo listing legacy URLs and their disposition (new site path / 301 target / 410 Gone).

### Phase 1 — Build (1-2 weeks)
- Stand up `MemberJunction/docs` repo using this prototype as the IA reference.
- Wire up the content fetcher and TypeDoc pipeline.
- Deploy to default GH Pages URL: `memberjunction.github.io/docs/`.
- Internal review with the team.

### Phase 2 — Soft launch (1 week)
- Announce to internal team only.
- Monitor for missing content, broken links, search quality.
- Add 301 redirects in the new site for key legacy URLs (in `public/_redirects` if using Netlify-style, or as static HTML redirects per URL since GH Pages doesn't natively support server-side redirects).

### Phase 3 — CNAME flip (1 day)
- Drop DNS TTL the day before.
- Switch the `docs` CNAME from legacy vendor to `memberjunction.github.io`.
- Wait for cert provisioning.
- QA the live URL.
- Restore TTL.

### Phase 4 — Sunset (after 30 days minimum)
- Confirm zero traffic to legacy backend.
- Cancel legacy hosting subscription.
- Archive any legacy source files in a `MemberJunction/docs-legacy-archive` private repo for a rainy day.

---

## 10. TypeDoc integration

**Current state:** `typedoc.json` and `typedoc.base.json` exist at MJ repo root.

**Scope:** TypeDoc must cover **every package** matched by the `workspaces` globs in root `package.json` (currently ~175 packages, growing). The pipeline auto-discovers — never hand-list entry points, or new packages silently fall off the API reference. The `typedoc.json` `entryPoints` should glob the same paths that `workspaces` does, with a small `exclude` list for app packages (`MJAPI`, `MJExplorer`) that don't ship a public TS API.

**Recommended approach:** Generate TypeDoc as part of MJ's existing release workflow, upload as a release artifact, and have the docs site fetch the artifact at build time.

**Steps:**
1. Add a TypeDoc step to `MJ/.github/workflows/release.yml`:
   ```yaml
   - run: npx typedoc
   - run: cd typedoc-output && zip -r ../typedoc.zip .
   - uses: softprops/action-gh-release@v2
     with:
       files: typedoc.zip
   ```
2. In `docs/scripts/build-typedoc.mjs`, fetch the latest release's `typedoc.zip` from MJ via the GitHub API and unzip into `./public/api/`.
3. In Astro config, register `/api/*` as a passthrough route (Astro doesn't try to build/render those files).

**Why fetch from release artifact, not generate fresh:** TypeDoc on a 175-package monorepo takes 5-10 minutes. Doing it once per release in MJ's workflow (where MJ is already checked out and built) is dramatically faster than doing it in the docs build (which would need to clone and `npm install` the whole monorepo).

**Edge case:** if MJ skips a release without a docs change, the docs site uses the previous artifact — fine.

---

## 10a. Markdown link rewriting (the load-bearing detail)

When the docs site renders `MJ/guides/DASHBOARD_BEST_PRACTICES.md`, that file's internal links point at sibling paths in the MJ repo:

```markdown
See [the caching guide](./CACHING_AND_PUBSUB_GUIDE.md)
See [the Angular conventions](../packages/Angular/CLAUDE.md)
See [`mj-form-toolbar`](../packages/Angular/Generic/form-toolbar/src/lib/form-toolbar.component.ts)
```

None of those resolve on the deployed docs site without rewriting. The fetcher MUST run a **remark plugin** over every fetched markdown file that does this for each relative link:

| Link target | Rewrite to |
|---|---|
| Another file the docs site also renders (e.g. `./CACHING_AND_PUBSUB_GUIDE.md`) | Site-local URL (`/guides/caching`) |
| A file in the source repo we don't render (e.g. `../packages/Angular/CLAUDE.md`) | Absolute `https://github.com/MemberJunction/MJ/blob/<sha>/...` |
| A non-markdown source file (`.ts`, `.sql`, etc.) | Absolute GitHub URL pinned to the build's commit SHA |
| Already-absolute links (`https://...`) | Pass through unchanged |

Pin to the **build commit SHA**, not `main`, so a link rendered today still points at the same code six months from now. The fetcher already knows the SHA (it gets it from the GitHub API at fetch time).

Implementation note: write this as a unified/remark plugin operating on the MDAST, not regex on the raw markdown string — link syntax has too many edge cases (reference-style links, image links, links inside HTML blocks).

**This is the single biggest implementation footgun on the project.** Build and test the rewriter before wiring up the rest of the fetch pipeline.

---

## 11. Cross-repo aggregation

For each "ecosystem" repo, the docs site shows:
- Repo name + tagline (from repo description)
- A short excerpt from the README (first ~200 words)
- A "Read on GitHub" link
- Last release tag + date (fetched from GH API)
- **Optional `extraLinks`** — for repos that have their own dedicated docs (e.g. a wiki, a GitHub Pages site, a Confluence space, generated API reference). Rendered as one or more "For more info →" links beneath the excerpt.

Implementation: `scripts/fetch-content.mjs` calls `GET /repos/:owner/:repo` and `GET /repos/:owner/:repo/releases/latest` for each, plus pulls README.md raw.

**SOURCES schema** (per repo entry in `fetch-content.mjs`):

```js
{
  owner: 'MemberJunction',
  repo: 'Forge',
  // ...
  extraLinks: [
    { label: 'Forge Wiki', url: 'https://github.com/MemberJunction/Forge/wiki' },
    // additional dedicated-docs links as needed
  ],
}
```

**Do NOT** mirror entire ecosystem READMEs into the docs site. Excerpt + link (+ optional `extraLinks`) is the pattern.

---

## 12. Maintenance model

| Action | Where it happens | Who notices |
|---|---|---|
| Edit a guide | PR into `MJ/guides/*.md` | Site auto-rebuilds nightly + on dispatch |
| Add a new package | PR into MJ updates root README | Package directory auto-refreshes |
| Add a new guide | PR into `MJ/guides/*.md` + add nav entry in `docs/src/content/...` | Two PRs (one in MJ, one in docs) |
| Update landing copy | PR into `docs` repo | Auto-deploys |
| Add a new ecosystem repo | PR into `docs/scripts/fetch-content.mjs` SOURCES array | Auto-deploys |
| TypeDoc rebuild | Automatic on MJ release | Triggered by repository_dispatch |

**Steady-state cost:** negligible. Most edits are existing repo PRs that the site happens to render.

---

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legacy site has unique content we miss | Medium | Medium | Phase 0 audit; keep a private archive repo |
| Inbound deep-link breakage | High | Low-Medium | Custom 404 with "did you mean…" + 301s for top 20 URLs |
| TypeDoc build is slow / flaky | Medium | Medium | Use release-artifact strategy (§10), not in-line build |
| Brand URL DNS misconfig | Low | High | Drop TTL pre-flip; rehearse on a `docs-staging` subdomain first |
| GH Pages outages | Very low | Medium | Same SLA as github.com itself; no mitigation needed |
| `git`-checked content from sibling repos goes stale | Medium | Low | Nightly schedule + repository_dispatch from each repo's release |
| Search quality | Low | Medium | Pagefind (Starlight default) is solid for prose; tune later if needed |
| Loss of analytics from legacy vendor | Low | Low-Medium | Add a privacy-friendly analytics tool (Plausible / GoatCounter) on day 1 |

---

## 14. Open questions for the team

1. **Who hosts the legacy site today, and what's the export format?** Determines Phase 0 effort.
2. **Is the `training` repo (last touched Nov 2024) intended to be revived?** If yes, link from `/getting-started`. If no, archive it.
3. **Should `VSCodeExtensions-OLD` be archived now?** Reduces noise on the org page and search.
4. **Do we want a "What's new" page tied to MJ releases, or is GH Releases enough?** I'd vote enough — but a one-pager that aggregates the last 5 release notes would be a small lift.
5. **Analytics?** Plausible vs. GoatCounter vs. nothing.
6. **Branded social card / OG image?** Need a designed asset for `/og-image.png`.
7. **Sample app showcase page** — do we want a `/showcase` listing apps built on MJ? Could pull from `committees`, `sample-app`, `mj-sample-open-app`, `bizapps-tasks`, demo apps.
8. ~~**Where does the `CLAUDE.md` content surface, if at all?**~~ **Resolved:** `CLAUDE.md` is an internal contributor handbook (norms for developers *of* MJ) and will not be surfaced on the public docs site. Instead, **agent skills** (the `.claude/skills/` and plugin skills we ship) get a first-class section at `/ai-and-agents/skills` with a published catalog and copy-paste install instructions — these are useful to developers *using* MJ in their own projects with Claude Code. Source of truth: skills are auto-discovered from `.claude/skills/` and `packages/*/skills/` in MJ at build time and rendered into the catalog page.

---

## 15. Success criteria

We'll know this worked when:
- ✅ `docs.memberjunction.org` resolves to a GitHub Pages site with no manual content sync.
- ✅ A new guide added to `MJ/guides/` appears on the site within 24 hours with no other action.
- ✅ TypeDoc on `/api/` reflects the latest MJ release.
- ✅ Search returns results from across all aggregated content.
- ✅ Lighthouse: ≥ 95 on Performance, Accessibility, Best Practices, SEO for the landing page.
- ✅ Legacy site has been sunset and the hosting subscription cancelled.
- ✅ Total monthly maintenance < 30 minutes (steady state).

---

## 16. Appendix: this prototype

The HTML files in `plans/mj-documentation/html/` (plus `index.html` at this directory's root) are static, hand-coded approximations of the final site. The prototype is intentionally **high-fidelity** so reviewers and the agent implementing the real site can ship without misinterpretation.

The prototype demonstrates:
- **Information architecture** — the page set we'd ship and the navigation between them.
- **Content sourcing model** — every long-form section explicitly cites its source repo file. The prototype never copies content in; it shows where rendered content would land.
- **Visual language** — typography scale, color tokens (light + dark mode), component patterns (cards, code blocks, callouts, sidebar nav, on-this-page rail). The final Astro Starlight build inherits this design system by overriding theme tokens.
- **Real content** — package names, guide titles/excerpts, AI provider list, architecture layers, and skill catalog are pulled from the actual MJ repo. What a reviewer sees in the prototype is what they'll see in the deployed site, modulo full long-form body content.

These files are throwaway. After review and Phase 1 sign-off, the actual implementation lives in `MemberJunction/docs` and `plans/mj-documentation/` is deleted.
