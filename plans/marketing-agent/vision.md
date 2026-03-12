# Marketing Agent Product Vision

## The problem

Most BC portfolio companies have no one dedicated to marketing. The function gets handled in fragments by founders, sales leads, or whoever has a spare hour. People whose real jobs are elsewhere. The result: reactive marketing, no strategy, and no learning about what actually works. These companies need a full-function marketer, not a content tool.

## The vision

An autonomous marketing agent that runs as a complete marketing department for any BC portfolio company. Most of these companies don't know which channels work, what content resonates, or how to spend their budget and they don't have the bandwidth to figure it out. The agent treats these as open questions to answer through experimentation, not assumptions.

The agent takes the business's objectives, budget, and current state (including any performance data that exists) and builds a marketing strategy around experiments designed to validate assumptions and answer the biggest unknowns. It proposes the strategy to leadership, gets feedback, iterates, and executes. As experiments produce data, the plan evolves and baselines get replaced with proven approaches, and the agent surfaces recommendations to leadership backed by evidence.

Leadership's role shifts from doing the work (or managing someone who does) to setting objectives, approving strategy, and reviewing results. The agent handles everything in between.

The Marketing Agent is an independent product that integrates with the BC AIDP and each portfolio company's platforms (CMS, ad accounts, social media, email, analytics). Each portfolio company configures their own instance with their brand, products, budget, and objectives.

## Sidecar content production baseline

Sidecar's current blog content workflow is handled manually by Mallory, ~3-4 hours/week:
1. John and Mallory record a podcast episode
2. Transcript is available immediately after recording
3. Mallory runs the transcript through Claude to identify topics and shape blog posts
4. Claude writes ~3 blog posts per week
5. Mallory publishes them on HubSpot

Phase 1's core job is to automate and improve this workflow. "Improve" means: researching what topics are trending, checking what we've already written to avoid repetition and create cross-links, and expanding distribution to social media — things the manual process doesn't do consistently.

## Sidecar experimentation pilot status

Sidecar is the first company running the experimentation methodology manually (with Claude as the "agent" and a human marketing team executing). The manual operation started in March 2026 and is generating findings that directly inform the product design.

**What exists today (manual prototype):**
- Experimentation framework with experiment categories (Conversion, Awareness), subcategories, and KEEP/ITERATE/KILL decision thresholds
- 2-week sprint cadence with hard decision dates and structured sprint reviews
- Cumulative learnings database that prevents repeat mistakes and informs new experiment design
- Experiment lifecycle: Active → Decided → Evergreen (graduated winners run indefinitely with floor thresholds)
- Prioritized experiment backlog (19 experiments) organized by tier: exploit proven winners, fill strategic gaps, explore new channels
- Experiment tracker spreadsheet with per-subcategory ROI, CAC, and win rates
- Budget reallocation driven by experiment results (shifting from -91% ROI channels to proven ones)

**Key findings from manual operation that inform product design:**
1. **Scale-appropriate rigor is critical.** At portfolio-company scale (~74 D2C conversions/month for Sidecar), statistical significance is unachievable for individual experiments. The agent must make decisions based on directional signals and portfolio-level patterns, not p-values. A confidence-based framework needs to account for low-volume environments.
2. **Anti-pattern memory matters as much as performance data.** Knowing what NOT to do (e.g., "LinkedIn sponsored messaging produces 0 conversions," "boosted organic social doesn't drive direct conversion") is as valuable as knowing what works. The agent needs persistent negative learnings, not just metrics.
3. **Experiment lifecycle needs an "Evergreen" state.** Experiments that succeed don't just get a KEEP label — they graduate to ongoing automation monitored with floor thresholds. The agent needs to distinguish "keep experimenting" from "this is now a standard tactic."
4. **Channel drawdown requires a specific methodology.** Cutting underperforming paid channels can't be done cold — unattributable B2B pipeline effects may exist. The reverse drawdown pattern (gradual reduction with Sales pipeline monitoring) is a distinct experiment type the agent must support.
5. **Partner channels need a "monitor but don't optimize" posture.** Some channels (e.g., ASAE partnership generating $2-4.5K/month at $0 cost) should be tracked but never touched by the agent. Partners own their own marketing.
6. **Sprint cadence with decision forcing prevents drift.** Without hard decision dates, experiments sit in limbo for weeks while spending money. The 2-week review cycle with mandatory decisions is essential.
7. **Tier-based prioritization beats equal treatment.** Experiments exploiting proven winners ($0 cost, proven channels) should always run before experiments exploring new channels (unknown ROI, real cost).

## Key capabilities

- **Marketing strategy development** -- Takes business objectives (e.g., "grow revenue 20% this quarter," "launch new product in April"), the current state of the business, and whatever performance data the team has. Builds a marketing plan with channel mix, budget allocation, campaign calendar, and KPIs with experiments baked in to validate the biggest unknowns. Where data exists, the strategy builds on it. Where it doesn't, the agent proposes experiments to get answers fast. Presents the strategy to leadership, incorporates feedback, and finalizes. Proposes changes over time as experiments produce evidence. All strategic changes require human sign-off.

- **Campaign design and execution** -- Designs and runs the campaigns a marketer would: product launches, lead gen, nurture sequences, event promotion, brand awareness, re-engagement. Campaign design is experiment-driven. The agent tests campaign types, formats, and approaches against each other, scales what works, and kills what doesn't.

- **Content creation** -- Produces the content the strategy calls for: blog posts, social media, video, email copy, newsletters, landing pages, ad creative, sales enablement materials. The agent tests messaging, formats, and topics to learn what resonates with each audience rather than following a fixed production schedule. Initial focus: the podcast-to-blog content workflow.

- **Social media management** -- A distinct capability from content creation. While content creation produces new assets, social media management is an ongoing remix and distribution function: monitoring all existing content assets, tracking social media trends and performance data, and creating new creatives (images, videos, posts) from existing high-performing content to repost and redistribute. This includes leveraging trending topic data from social media management platforms (e.g., Buffer, Hootsuite) to identify what's gaining traction and match it to existing content in the library.

- **Media spend management** -- Allocates budget based on experimental results, not industry benchmarks. The agent runs channel and spend experiments to figure out where dollars drive the most value, then shifts allocation as data comes in. Includes a reverse drawdown methodology for cutting underperforming channels: gradual spend reduction with sales pipeline monitoring at each step, rather than cold cuts that could destroy unattributable B2B pipeline value. The agent must also handle partner channels (tracked but not optimized — partners own their own marketing) and distinguish between D2C attribution and higher-value B2B/Team pipeline effects. Long-term: directly manages ad platform campaigns (Google, LinkedIn, etc.) in real time. Initially: recommends spend decisions that a human executes.

- **Experimentation framework** -- The methodology behind all of the above. Designs and runs marketing experiments with proper controls: A/B tests on messaging, channel tests, offer tests, audience tests, spend allocation tests. Uses a KEEP/ITERATE/KILL decision framework with predefined thresholds set at experiment launch. Experiments are categorized (Conversion with 6 subcategories, Awareness with 3) and prioritized by tier (exploit proven winners first, then fill strategic gaps, then explore new channels). The agent maintains a cumulative learnings database — both positive findings and anti-patterns — that it checks before proposing any new experiment. Successful experiments graduate to "Evergreen" status with floor thresholds for ongoing monitoring. The framework must handle low-volume environments where statistical significance isn't achievable, making decisions based on directional signals and portfolio-level patterns.

- **Performance measurement and optimization** -- Tracks results across campaigns, channels, and experiments. Reports show what happened and what was learned. Experiment results feed back into strategy, replacing baselines with proven approaches. When something isn't working, the agent identifies why and adjusts the plan -- with leadership approval for strategic shifts.

## Human approval gates

The agent operates autonomously within the approved strategy but requires leadership sign-off for:
- Marketing strategy and significant strategic changes
- Budget allocation and spend thresholds
- Campaign launches
- Content publication (initially; may relax as trust builds)
- Experiment decisions at decision dates (KEEP/ITERATE/KILL)

The agent enforces a sprint cadence (2-week cycles validated at Sidecar) with hard decision dates. At each sprint review, the agent presents experiment results with recommendations and leadership decides. This prevents experiments from drifting in limbo while spending money.

## Long-term: unified marketing orchestration

As individual marketing capabilities mature (content creation, social media management, experimentation, media spend), the long-term vision is a single marketing entry point — a "CMO agent" — that understands the full portfolio of marketing capabilities and can coordinate across them. The first interaction with a new company should be strategic ("let's talk about your marketing objectives and what you have today") rather than tactical. The CMO layer proposes which capabilities to activate and how they work together, rather than requiring the company to configure each one independently.

This is a long-term architectural direction, not a Phase 1-3 deliverable.

## What it is not

- **Not a content tool** -- Content creation is one capability in service of a broader marketing strategy, not the point
- **Not assumption-driven** -- The agent doesn't execute a static plan based on best practices. It runs experiments to figure out what works for each portfolio company and evolves as data comes in
- **Not set-and-forget** -- Requires ongoing strategic input from leadership and adapts based on feedback and results
- **Not limited to one company** -- Configured per portfolio company with different brands, products, objectives, and budgets

## How we measure success

| Metric | What it tells us |
|--------|-----------------|
| Marketing-sourced pipeline / revenue | Whether the agent is driving business results |
| Cost per lead / cost per acquisition | Spend efficiency over time |
| Experiment velocity and win rate | How fast the agent learns what works |
| Time from baseline to proven approach | How quickly assumptions get replaced with data |
| Human hours per week on marketing | How much of the function is automated |
| Campaign ROI by type and channel | Which investments are paying off |
| Strategy adoption by leadership | Whether recommendations are trusted |