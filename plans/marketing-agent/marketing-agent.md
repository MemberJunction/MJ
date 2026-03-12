# Product Context: Marketing Agent

**Last updated:** 2026-03-11
**Product owner:** John Huisman (interim, via PO Copilot)
**Lead engineer(s):** Pranav (BC Labs fellow)
**Technical advisor:** Amith
**Pilot company:** Sidecar

---

## 1. What is this product?

An autonomous marketing agent that runs as a complete marketing department for BC portfolio companies. Most portfolio companies have no dedicated marketer -- the function gets handled in fragments by founders, sales leads, or whoever has a spare hour. The agent takes the business's objectives, budget, and current state, builds a marketing strategy around experiments designed to validate assumptions, proposes the strategy to leadership, gets feedback, iterates, and executes. As experiments produce data, the plan evolves -- baselines get replaced with proven approaches, and the agent surfaces recommendations backed by evidence. Leadership's role shifts from doing the work to setting objectives, approving strategy, and reviewing results. Each portfolio company configures their own instance with their brand, products, budget, and objectives.

## 2. Users and stakeholders

### Primary users

| User type | What they do with the product | What matters most to them |
|-----------|-------------------------------|--------------------------|
| Portfolio company leadership (Sidecar: Mallory, Zach) | Set marketing objectives, approve strategy, review experiment results, approve content | Clear recommendations backed by data. Not being buried in approvals. Knowing their marketing budget is being spent on things that work. |
| Marketing team / content reviewer | Reviews and approves generated content before publication, provides editorial feedback | Content that sounds like their brand, not generic AI output. Fast review cycle, not a bottleneck. Easy to approve/edit/reject with feedback. |
| Portfolio company sales team | Consumes marketing-sourced leads, uses sales enablement content | Quality leads with context. Content they can actually use in conversations without reformatting. |

### Internal stakeholders

| Stakeholder | Their interest |
|-------------|---------------|
| Amith | Technical architecture, GTM agent thesis (marketing + AI SDR + Voice SDR unified) |
| John | Product quality, experiment methodology rigor, proving the model across portfolio companies |
| Robert | Engineering execution, fellow allocation, sprint delivery |
| Johanna | Portfolio company adoption, strategic value to Blue Cypress |

## 3. User pain points and needs

| Pain point | Severity | Current workaround |
|------------|----------|-------------------|
| No dedicated marketer -- marketing gets fragmented across busy people whose real jobs are elsewhere | Critical | Founders and sales leads do marketing in spare hours, resulting in inconsistent output and no strategy |
| No marketing strategy -- reactive marketing with no experimentation or learning about what works | Critical | Assumptions drive channel spend. At Sidecar, 66% of paid budget went to channels with -62% to -91% D2C ROI before the manual experiment pilot caught it. |
| Blog content production is manual and time-consuming (~3-4 hrs/week for Mallory at Sidecar) | High | Mallory manually runs podcast transcripts through Claude, shapes blog posts, publishes to HubSpot. No trend research, no cross-linking, no social distribution. |
| No systematic way to know which marketing channels and tactics work | High | Gut feel and industry benchmarks. No experimentation, no cumulative learnings, same mistakes repeated. |
| Content published once and forgotten -- no redistribution or remix of high-performing content | Medium | Publish and move on. Older content that performed well stops driving traffic. |
| No connection between marketing content and other GTM functions (SDR, Voice) | Medium | Each system operates independently with no shared data or coordinated messaging |

**Primary urgency driver:** Budget waste. The manual experiment pilot revealed $12,900/month going to channels with negative ROI. Automating the experimentation framework is the path to scaling this discipline across portfolio companies -- the content pipeline is the foundation that makes experimentation possible.

## 4. What "done" looks like

### Definition of "shippable"

Every feature in the Marketing Agent must meet ALL of these before it's considered done:

- [ ] Error states are handled gracefully -- if HubSpot API is down, Buffer/Hootsuite is unreachable, or a content source fails to process, the user sees a helpful message and no data is lost
- [ ] The feature works with realistic data -- real Sidecar podcast transcripts, real blog posts, real brand voice, not just test fixtures
- [ ] Edge cases are identified and handled: empty transcripts, duplicate content, missing metadata, API rate limits, long-running content generation
- [ ] Generated content respects brand configuration -- voice, tone, terminology, and positioning match what the company provided
- [ ] Security: no exposed API keys, no cross-company data leakage, no PII in logs
- [ ] The feature has been tested by someone who was NOT involved in building it, using real Sidecar content
- [ ] The agent never fabricates facts, statistics, or claims not grounded in the source material
- [ ] Content generated is unique -- no plagiarism, no verbatim copying from source transcripts passed off as original writing

### What "good enough for v1" means vs. "needs to be polished"

**Must be solid in v1 (these break trust if wrong):**
- Blog post quality -- if the first posts are obviously generic AI slop, Mallory won't use the system. The bar is "at least as good as what she produces manually with Claude"
- Brand voice consistency -- content must sound like Sidecar, not a generic marketing blog
- Factual accuracy -- product info, company claims, and any data referenced must be correct. ONE wrong claim erodes trust
- Blog post database integrity -- semantic search must return relevant results, not noise. Cross-linking must point to actually-related posts
- Content actually publishes to HubSpot correctly -- formatting, metadata, SEO fields, categories all correct. Not "close enough"
- Human approval workflow must be frictionless -- if reviewing content is harder than just writing it, the tool creates work instead of saving it

**Can be rough in v1 (iterate later):**
- Social media post sophistication -- basic LinkedIn posts are fine initially, optimization comes with data
- Newsletter content -- functional but not highly optimized
- Content calendar UI polish -- functional visibility is enough
- Trend research depth -- directional signals are fine, deep analysis comes later
- Multi-company support -- Sidecar-only is the right scope for Phase 1
- Performance analytics -- basic metrics first, detailed reporting later

## 5. Known risks and failure modes

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Generated content is generic / doesn't match brand voice | High (early on) | High -- Mallory stops using it, goes back to manual process | Invest heavily in brand configuration. Test against real Sidecar content. Get Mallory's feedback in Sprint 1, not Sprint 3. |
| Blog post database backfill is bigger than expected | Medium | Medium -- delays semantic search and cross-linking quality | Scope backfill early. Start with recent 6 months if full backfill is too large. |
| HubSpot API integration is fragile or limited | Medium | High -- publishing is the capstone of the Phase 1 workflow | Validate HubSpot API capabilities in Sprint 1 before building the full pipeline on assumptions. |
| Buffer/Hootsuite API doesn't support what we need for trend research + publishing | Medium | Medium -- may need to switch platforms or integrate directly | Pick one platform early, validate API capabilities before building. Sidecar has existing MJ actions for both. |
| Approval workflow creates more work than it saves | Medium | High -- adoption killer | Design for speed: one-click approve, inline editing, batch review. Watch time-per-review closely. |
| Content source quality varies (poor audio, unstructured webinars) | Medium | Medium -- garbage in, garbage out | Test with real Sidecar source material early. Define minimum input quality requirements. |
| Experiment framework (Phase 2) is too complex to automate well | Medium | High -- core differentiator fails | Manual prototype at Sidecar is de-risking this. Use manual operation as the spec. |
| Low-volume environments make experiment decisions unreliable | High | High -- wrong KEEP/KILL decisions waste budget | Scale-appropriate confidence framework is a first-class requirement, not an afterthought. Threshold-based decisions, not p-values. |

### Lessons from past BC Labs failures

| Product | What went wrong | Lesson for Marketing Agent |
|---------|----------------|---------------------------|
| Izzy | Released full of bugs, CS team couldn't get leverage from it | Get Mallory using it with real content early. Her feedback is the acceptance test, not an internal demo. |
| AI SDR | Performed so poorly it had to be turned off | Define minimum content quality threshold BEFORE calling Phase 1 done. If blog posts aren't at least as good as the manual process, the agent isn't ready. |
| Skip | Sold to three clients, still doesn't work a year later | Don't promise multi-company (Phase 2+) until Sidecar is solid. One company working well > three companies working poorly. |
| AIDP | Data issues erode trust | Blog post database integrity is non-negotiable. One broken cross-link or duplicate post = team stops trusting semantic search. |

## 6. Key product decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Sidecar as pilot company | Most engaged, existing content workflow to automate, manual experiment pilot already running | Pre-March 2026 |
| Podcast-to-blog as Phase 1 anchor workflow | This is what Mallory does manually today (~3-4 hrs/week). Clear baseline to beat. | March 2026 |
| Blog post database in CDP (not HubSpot) | HubSpot's search API is limited. Semantic search across full blog corpus requires independent storage. Blog posts written to CDP first; HubSpot publishing is downstream. | March 2026 |
| Buffer or Hootsuite for social media (not direct platform APIs) | These platforms handle auth to LinkedIn, Facebook, etc. -- one API integration instead of many. Sidecar has existing MJ actions for both. | March 2026 |
| Experiment-driven approach (not static best practices) | Manual pilot at Sidecar validated this. Experiments replaced assumptions with data, identified $12,900/month in wasted spend. | March 2026 |
| 2-week sprint cadence with hard decision dates | Validated at Sidecar manual pilot. Prevents experiment drift and forces decisions. | March 2026 |
| Human approval for all content initially | Trust must be earned. Companies can relax approval gates over time via configurable gates (Phase 2). | March 2026 |
| Independent product that integrates with AIDP | Not a module inside another system. Each portfolio company gets their own configured instance. | March 2026 |
Data model design decisions (brand config wide table, Content Source entity, DivisionName placeholder, polymorphic approvals/metrics, Blog Status separation) are documented in `roadmap.md` under each phase's "Data model requirements" and "Key design decisions" sections.

**Open decision:** Buffer vs. Hootsuite -- not yet decided. Pranav to evaluate both APIs in Sprint 1 (trend research capabilities + publishing support) and recommend.

## 7. What we don't know yet

- [ ] What's the right scope for the initial Sidecar blog post backfill? Full history or recent N months?
- [ ] How good is podcast transcript quality as source material? Will poor audio quality produce unusable content?
- [ ] What's the right approval workflow UX? Email-based? Dashboard? Slack notification?
- [ ] How much brand configuration is "enough" vs. diminishing returns? (Could over-engineer this)
- [ ] Can the agent produce blog posts that Mallory considers equal or better than her current manual Claude workflow?
- [ ] What's the right content plan cadence for Sidecar? (Currently ~3 posts/week from podcasts)
- [ ] How will Sidecar leadership want to interact with strategy and experiment reviews? (Format, frequency, depth)
- [ ] What's the right confidence threshold for experiment decisions in Sidecar's volume environment (~74 D2C conversions/month)?
- [ ] How will the blog post database handle content that exists in HubSpot but not CDP (and vice versa) during the transition?
- [ ] What's the right data model for the experimentation framework (Phase 2)? The manual prototype uses spreadsheets -- what tables are needed for experiments, variants, learnings, sprint cadence?
- [ ] Should Content Performance Metrics be pulled from HubSpot/analytics on a schedule, or pushed via webhooks?

**John's top unknowns (March 2026):**
- **Content quality bar** -- Can the agent produce blog posts that Mallory considers publishable without heavy editing? This is the make-or-break for Phase 1 adoption.
- **Technical integration risk** -- HubSpot API, social platform APIs, CDP setup. How much integration work is hiding under the surface? Pranav needs to validate API capabilities early (Sprint 1) before building on assumptions.

## 8. Success metrics

| Metric | Target | How measured | Current baseline |
|--------|--------|-------------|-----------------|
| Blog posts produced per week | >= 3 (match current output) | Blog post database count | ~3/week (Mallory manual process) |
| Mallory's hours/week on content | < 1 hr (review + approve only) | Time tracking / self-report | ~3-4 hrs/week |
| Content approval rate (first draft) | > 70% approved without major edits | Approval workflow data | N/A |
| Blog post quality (Mallory's assessment) | "At least as good as manual process" | Qualitative review | Manual Claude-assisted posts |
| Social posts published per week | >= 3 (1 per blog post, LinkedIn) | Social media platform data | 0 (not done currently) |
| Newsletter content generated | Not a Phase 1 success criterion | Newsletter platform data | Unknown |
| Content performance (page views, engagement) | Baseline TBD -- Erica to provide current numbers | HubSpot analytics | Ask Erica for current Sidecar blog traffic |
| Experiment velocity (Phase 2) | >= 6 experiments per sprint (match manual pilot) | Experiment tracker | Manual pilot: ~6 experiments per sprint |
| Marketing-sourced pipeline / revenue (Phase 2+) | Baseline TBD -- Erica to provide current numbers | CRM attribution | Ask Erica for current marketing-sourced revenue |

**Action item:** Get current Sidecar blog traffic and marketing-sourced revenue baselines from Erica before Sprint 2 so we can set meaningful performance targets.

## 9. Competitive context and differentiation

**What this is NOT:**
- Not a content generation tool (Jasper, Copy.ai, Writer) -- those produce content without strategy, experimentation, or learning
- Not a marketing automation platform (HubSpot, Marketo) -- those are workflow tools that require a human marketer to drive them
- Not a social media scheduler (Buffer, Hootsuite) -- those are distribution tools, not marketing departments

**What makes this different:**
- Operates as a complete marketing function, not a point solution for one task
- Experiment-driven -- treats "what works" as an open question, not an assumption
- Learns and adapts -- cumulative learnings database prevents repeating mistakes and builds on proven approaches
- Designed for companies with no marketer -- leadership sets objectives, agent handles everything in between
- Multi-company -- learnings from one portfolio company can benefit others (anti-pattern sharing, benchmarking)

No specific competitor tools to study beyond what's listed above. The "What it is not" framing is sufficient context for Pranav.

## 10. Quality standards specific to this product

**Content quality:**
- Blog posts must pass Mallory's editorial review -- the bar is "would I publish this without significant rewriting?"
- Generated content must be factually accurate -- no fabricated claims, statistics, or product details
- Brand voice must be consistent across all content types (blog, social, newsletter)
- SEO optimization must be real (proper meta descriptions, title tags, keyword usage) not token gestures

**Data integrity:**
- Blog post database must have zero duplicates and accurate metadata
- Semantic search must return relevant results -- irrelevant matches erode trust in the system
- Content status (pending/approved/published) must always be accurate across CDP and HubSpot
- No content published without human approval (until approval gates are relaxed in Phase 2)

**Integration reliability:**
- HubSpot publishing must be idempotent -- retrying a failed publish doesn't create duplicates
- Social media publishing must handle API failures gracefully (queue and retry, not silent failure)
- Content source ingestion must handle various input quality levels without crashing

**Performance:**
- Content generation should complete within a reasonable time (minutes, not hours) for a single blog post
- Semantic search on the blog post database should return results in < 2 seconds
- Approval workflow notifications should be near-real-time

**Scalability (Phase 2+):**
- Multi-company configuration must prevent data leakage between companies
- Experiment framework must handle 20+ concurrent experiments per company
- Cumulative learnings database must scale across companies without performance degradation

---

## Reference documents

| Document | Location | Purpose |
|----------|----------|---------|
| Product vision | `vision.md` | Full vision, capabilities, success metrics |
| Roadmap | `roadmap.md` | Phased delivery plan with milestones, data model requirements, and risks |
| Backlog | [GitHub Project: Marketing Agent](https://github.com/users/johnhuisBC/projects/1) | 53-feature prioritized backlog organized by sprint |
| Marketing agent templates | `metadata/prompts/templates/marketing/` | Agent prompt templates (brand guardian, copywriter, editor, publisher, SEO) |

---

## Changelog

| Date | What changed | Why |
|------|-------------|-----|
| 2026-03-11 | Initial creation, pre-populated from vision, roadmap, backlog, and architecture conversation | PO Copilot kickoff for Marketing Agent |
| 2026-03-11 | Added data model decisions (brand config wide table, Content Source entity, DivisionName placeholder, polymorphic approvals/metrics, Blog Status separation). Added 2 unknowns (Phase 2 experimentation data model, performance metrics ingestion method). Updated backlog reference from 39 to 53 features. | CDP schema comparison revealed gaps in product plans -- schema work items and rasa.io FRD features added to backlog and roadmap. |
| 2026-03-11 | Reorganized: moved vision, roadmap, backlog, and context from `product_plans/gtm/marketing/` into `po-copilot/products/marketing-agent/`. Removed data model design decisions from Section 6 (now single-sourced in roadmap). Updated all reference paths. | Colocate product context with its supporting planning artifacts. Eliminate duplication between product context and roadmap. |
| 2026-03-12 | Copied product docs (marketing-agent.md, vision.md, roadmap.md) to MJ repo `plans/marketing-agent/`. Updated reference docs to point to GitHub Project for backlog and marketing agent templates. | Share product context with Pranav in the MJ repo where he works. |
