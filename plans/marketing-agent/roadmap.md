# Marketing Agent Product Roadmap

## Current state

No agent built. The product vision defines the full scope (strategy, content, campaigns, media spend, experimentation) and a rasa.io FRD provides detailed content production specs as reference.

**Team:** Pranav (BC Labs fellow / developer), John Huisman (product owner), Amith (technical architect / advisor). Sprint cadence: 1-2 week sprints. Kickoff week of March 10, 2026.

**Baseline to automate:** Mallory currently handles blog content manually (~3-4 hrs/week): podcast transcript → Claude → ~3 blog posts/week → publish on HubSpot. Phase 1 replaces this process and adds research, cross-linking, and social distribution that the manual process doesn't do.

The experimentation framework (Phase 2's core capability) is running manually at Sidecar with Claude acting as the "agent" and a human marketing team executing. This manual prototype has been operating since March 2026 and is producing real data that validates the product design and surfaces requirements the original plan didn't anticipate.

**Manual prototype artifacts (in `companies/sidecar/product_launch/marketing_experiments/`):**
- `framework.md` — Experiment methodology, categories/subcategories, lifecycle rules, sprint cadence
- `learnings.md` — Cumulative findings and anti-patterns from 25+ experiments
- `backlog.md` — 19 prioritized experiment proposals organized by tier
- `experiment_tracker.xlsx` — Subcategory-level performance tracking with per-sprint detail
- `sprints/` — Sprint plans with experiment proposals, decisions, and budget reallocation

**What the manual operation has validated:**
- The experiment-driven approach works: Sidecar identified email and rasa.io as proven channels, is cutting $12,900/month from underperforming channels (LinkedIn, Google), and has a structured pipeline of 19 experiments prioritized by expected ROI
- The sprint cadence (2-week cycles with hard decision dates) prevents experiment drift
- KEEP/ITERATE/KILL thresholds set at launch force clear decisions
- Cumulative learnings database prevents repeat mistakes across sprints
- Tier-based prioritization (exploit winners → fill gaps → explore new channels) focuses resources

**What the manual operation has surfaced that the product must handle:**
- Low-volume environments where statistical significance is unachievable (most BC companies)
- Multi-pipeline attribution (D2C conversions vs. unattributable B2B/Team pipeline)
- Partner channels that should be monitored but never optimized by the agent
- Anti-pattern memory (negative learnings) as a first-class data type alongside performance metrics
- Experiment lifecycle management including Evergreen graduation for proven tactics
- Reverse drawdown methodology for safely cutting underperforming paid channels

## Phase 1: Content production pipeline

**Milestone:** The agent takes source content (podcast episodes, webinar recordings, existing materials) and produces derivative marketing content for Sidecar -- blog posts, social media posts, and newsletter content. A human reviews and approves before publication. The agent publishes approved content to the company's CMS and social channels.

**Capabilities delivered:**
- Brand and product configuration: company provides brand voice, product positioning, target audience, and content guidelines. The agent uses this to maintain consistency across all content it produces.
- Content plan configuration: the company defines what content types they want produced (blog posts, social posts, newsletter content), how much of each, and how often. The agent follows this plan rather than deciding output on its own. The company can adjust the plan as they learn what's working.
- Content source ingestion: agent processes podcast transcripts, webinar recordings, and existing marketing materials as raw input for content creation
- Blog post database: all blog posts (current and historical) stored in CDP with metadata (date, division, company, tags, full text). Enables semantic search across the entire blog corpus independent of HubSpot's API. New blog posts are written to this table; publishing is a downstream step. This is foundational infrastructure — topic research, internal linking, and de-duplication all depend on it.
- Blog post generation: agent writes blog posts from source content, optimized for SEO and the company's brand voice. Includes meta descriptions, suggested titles, and multiple title variations. Before writing, the agent researches existing blog posts (via semantic search on the blog post database) to avoid repeating recent topics, continue ongoing themes where appropriate, and identify opportunities for internal cross-linking.
- Internal cross-linking: when a new blog post is created, the agent identifies related existing posts and adds links in both directions — new posts link to relevant older posts, and older posts are updated with links to the new post. This builds the internal link structure that improves SEO and helps readers discover related content.
- Social media trend research: agent queries social media management platforms (Buffer, Hootsuite, or similar — Sidecar has existing MJ actions for both) for trending keywords and topics relevant to the company's space. This data informs topic selection alongside podcast transcripts and existing blog analysis.
- Social media post generation: agent creates social posts from blog content, optimized per platform (LinkedIn initially). Generates multiple variations for testing.
- Newsletter content generation: agent drafts newsletter introductions and content sections that tie to the week's published content
- Content calendar: agent maintains a rolling content schedule, tracks what's been produced, approved, and published, and flags gaps against the content plan
- Human approval workflow: all content goes through a review step before publication. Reviewer can approve, edit, or reject with feedback the agent incorporates.
- CMS publishing: approved blog content published to the company's website (HubSpot for Sidecar). Blog post status in the database moves from pending → approved → published.
- Social media publishing: approved social posts scheduled and published via social media management platform API (Buffer or Hootsuite — these handle authentication to LinkedIn, Facebook, etc. so the agent integrates with one API rather than each social network directly)
- Basic content performance tracking: page views, social engagement, newsletter metrics collected and reported weekly

**Data model requirements:**

The CDP `[marketing]` schema currently has only a `Blog` table and a `Blog Status` lookup. The following schema additions are needed to support Phase 1 capabilities. These are Sprint 1 prerequisites — the feature work depends on this infrastructure being in place.

- **Brand Configuration table** — One row per company storing brand voice, product positioning, target audience, and content guidelines. Columns map directly to the brand-guardian-agent.template.md variables (`BrandName`, `BrandValues`, `BrandPriorities`, `BrandVoiceAndTone`, `BrandPersonalityTraits`, `KeyMessagingPillars`, `VisualIdentityGuidelines`, `BrandDosAndDonts`) plus `TargetAudience` and `ProductPositioning`. This table feeds all marketing agents, not just the brand guardian. One config per company enforced by unique constraint. Includes a nullable `DivisionName` string as a placeholder until MJ has a Division entity.
- **Content Type lookup** — Defines the types of marketing content the system handles: Blog, Social Post, Newsletter, Video Script, Email Campaign, Podcast Show Notes. Used by Content Plan, Content Calendar, Content Approval, and Content Performance Metric tables.
- **Content Source Type lookup** — Categorizes ingested source materials: Podcast Transcript, Webinar Recording, Document, URL, RSS Feed.
- **Content Source table** — Replaces the single `SourcePodcastURL` string field on Blog with a proper entity. Stores ingested source materials with full transcript text, source type, source URL, speaker, tags, and a processed flag. One source can produce multiple blogs. The existing `SourcePodcastURL` field on Blog stays for backward compatibility; new content should reference Content Source via FK.
- **Content Plan + Content Plan Item tables** — Parent/child structure. Content Plan is company-level (name, description, date range, active flag). Content Plan Items define what content types to produce, how many, and how often (daily/weekly/biweekly/monthly). This is the data model behind the "content plan configuration" capability.
- **Blog table enhancements** — Add `MetaDescription` (SEO), `URLSlug`, `FeaturedImageURL`, `ContentSourceID` (FK to Content Source), and `DivisionName` to the existing Blog table.
- **Content Calendar table** — Tracks planned, in-progress, and published content across all content types. Links to Blog and Content Source when applicable. Status values: Planned, In Progress, Ready for Review, Approved, Published, Cancelled.

**Key design decisions:**
- Brand configuration is a wide table (not key-value) so agent prompt templates can be hydrated without JOINs. Columns map 1:1 to template variables.
- Content Source is a first-class entity because storing full transcripts and supporting multiple source types (not just podcast URLs) is foundational for the research and content generation pipeline.
- `DivisionName` is a nullable string, not a FK. No Division entity exists in MJ yet. Easy to migrate to a FK when one is created.
- Blog Status stays as-is for backward compatibility. A separate Content Status lookup will be added in Phase 2 for Social Posts and Newsletters.

**Key decisions / risks:**
- Content source quality: The agent's output is only as good as its input. Podcast transcripts with poor audio or unstructured webinars will produce weaker content. Need to test with real Sidecar source material early.
- Blog post database: CDP table needs to be created and backfilled with existing Sidecar blog posts before the research and cross-linking capabilities work well. Initial backfill scope and approach needs to be determined.
- Social media platform choice: Buffer and Hootsuite both have APIs and Sidecar has existing MJ actions for both. Need to pick one and scope the integration for both publishing and trend research.
- Approval workflow design: Too much friction and the agent creates work instead of saving it. Too little and content goes out that shouldn't. Getting the right balance matters for adoption.

**Dependencies:** Sidecar marketing team involvement for brand configuration and content review, HubSpot CMS API access, Buffer or Hootsuite API access, CDP database tables (schema work is a Sprint 1 prerequisite)

## Phase 2: Strategy-driven experimentation

**Milestone:** The agent connects content production to business objectives through a marketing strategy and runs experiments to figure out what works. Leadership sets objectives (e.g., "grow inbound leads 20% this quarter"), the agent proposes a strategy and experiments to get there, and adapts its content approach based on results.

**Sidecar pilot input:** This phase has been prototyped manually at Sidecar. The framework, experiment templates, learnings database, and sprint cadence are all field-tested and can serve as the design specification for the automated version. See `companies/sidecar/product_launch/marketing_experiments/framework.md` for the full methodology.

**Capabilities delivered:**
- Marketing strategy development: agent takes business objectives and current performance data, proposes a content and channel strategy with experiments designed to test assumptions. The strategy determines what content gets created, on what topics, in what formats, promoted through which channels. Leadership reviews and approves.
- Content experimentation: agent runs structured experiments on the content it produces -- testing topics (which subjects drive the most engagement), formats (long-form vs. short-form, listicles vs. deep dives), length, posting frequency, and promotion approaches (organic vs. boosted, timing, channel). Each experiment has a clear hypothesis and success criteria.
- Promotion experimentation: beyond creating content, the agent tests how content is distributed and amplified -- organic posting schedules, cross-promotion across channels, email distribution timing, and audience targeting for promoted posts
- Strategy-driven content planning: the content plan from Phase 1 is now generated by the agent based on the approved strategy rather than manually configured. The agent decides what topics, formats, and cadence best serve the current objectives and experiments.
- Experiment lifecycle management: experiments follow a structured lifecycle from proposal → active → decided (KEEP/ITERATE/KILL) → Evergreen (for graduates). The agent tracks each experiment's state, enforces decision dates, and graduates successful experiments to ongoing automation with floor thresholds. Sidecar validated this lifecycle with 25+ experiments across 4 Evergreen graduates.
- Cumulative learnings database: the agent maintains a persistent knowledge base of findings from all completed experiments — both positive (what works) and negative (anti-patterns). Before proposing any new experiment, the agent checks this database to avoid repeating known failures and to build on proven approaches. At Sidecar, this prevented re-running LinkedIn sponsored messaging ($3K, 0 conversions) and boosted organic social for direct conversion ($1K, 0 conversions).
- Experiment prioritization: the agent organizes its experiment backlog by tier — Tier 1 (exploit proven winners at $0 cost), Tier 2 (fill strategic gaps with high learning value), Tier 3 (explore new channels with small bets). This ensures resources go to the highest-expected-value experiments first.
- Sprint cadence and decision forcing: the agent operates on a 2-week sprint cycle with mandatory experiment reviews and hard decision dates. At each review, the agent presents results with KEEP/ITERATE/KILL recommendations. Leadership decides. No experiment runs past its decision date without an explicit extension. This prevents the "thinking of killing" limbo that costs money.
- Performance analytics: detailed reporting on which topics, formats, channels, and promotion approaches drive the most engagement and conversions. Goes beyond basic metrics to surface actionable patterns tied back to experiments. Includes subcategory-level ROI, CAC, and win rates across the full experiment portfolio.
- Strategy adaptation: as experiment results come in, the agent proposes strategy adjustments backed by evidence. Proven approaches replace initial assumptions. All strategic shifts require leadership sign-off. Budget reallocation recommendations are grounded in cumulative experiment data (e.g., shifting from -91% ROI channels to proven ones).
- Multi-company configuration: a second portfolio company can be onboarded with their own brand, products, objectives, and content preferences
- Social media management (remixer): a distinct capability from content creation. Continuously monitors the full library of existing content assets, tracks social media performance data and trending topics, and creates new creatives (images, copy variations, short-form video) from high-performing existing content for redistribution. This is an always-on function that gets more valuable as the content library grows — it ensures older high-performing content continues to drive traffic rather than being published once and forgotten.
- Campaign design: agent designs targeted campaigns (product launches, lead gen, event promotion) as part of the broader strategy, beyond recurring content production
- Configurable approval gates: human stays in the loop by default for strategy changes, content publication, and experiment decisions. As trust builds, the company can selectively automate approvals (e.g., auto-publish social posts while still reviewing blog posts) up to full automation where the agent executes without human review

**Data model requirements (Phase 2 additions):**

- **Social Platform lookup** — LinkedIn, Twitter/X, Facebook, Instagram, YouTube, TikTok
- **Content Status lookup** — Draft, In Review, Approved, Scheduled, Published, Archived. Used by Social Posts, Newsletters, and any non-blog content types. Blog keeps its own Blog Status for backward compatibility.
- **Approval Decision lookup** — Approved, Rejected, Revision Requested
- **Social Post table** — Links to Blog (nullable, for derivative posts), Social Platform, and Content Status. Tracks content, image URL, hashtags, scheduled/published dates, and external platform post ID/URL.
- **Newsletter table** — Company-level, links to Content Status. Tracks title, subject line, preheader text, content, planned/sent dates, and external platform ID.
- **Newsletter Blog junction table** — Links newsletters to the blog posts they feature, with display order and optional custom summary.
- **Content Approval table** — Polymorphic design using ContentTypeID + ContentID to support approvals for any content type (blogs, social posts, newsletters) without separate tables per type. Tracks reviewer, decision, feedback, and timestamps.
- **Blog Cross Link table** — Directional: SourceBlogID links to TargetBlogID with anchor text. Unique constraint prevents duplicates, check constraint prevents self-links. Query both directions to find all related posts.

**Key decisions / risks:**
- Experiment design quality: poorly designed experiments waste time and produce misleading results. The agent needs to design clean tests with proper controls and enough volume to draw real conclusions.
- Low-volume decision making: most BC portfolio companies will have low conversion volumes (Sidecar averages ~74 D2C conversions/month). The confidence framework must support directional decision-making based on portfolio-level patterns, not per-experiment statistical significance. This is a fundamental design constraint — the agent cannot wait for p<0.05.
- Leadership engagement model: the strategy layer requires regular leadership input. If leadership doesn't engage with strategy reviews, the agent can't improve. The Sidecar pilot shows this works when the review cadence is short (2 weeks) and the format is structured (recommendations with data, not open-ended discussions).
- Multi-pipeline attribution: companies may have both direct (D2C) and indirect (B2B/Team) revenue pipelines. The agent must handle situations where a channel appears to underperform on direct metrics but may contribute to a higher-value pipeline that can't be directly attributed. The reverse drawdown pattern (gradual reduction with sales monitoring) addresses this.
- Partner channel boundaries: some revenue channels (partnerships, referral programs) should be monitored for performance but not optimized by the agent because partners own their own marketing. The agent needs a "track but don't touch" designation.
- Multi-company adds complexity to every layer. Each company has different platforms, brand guidelines, and objectives.

**Dependencies:** Phase 1 live with real content performance data, Sidecar leadership involvement for strategy review

## Phase 3: Full marketing operations

**Milestone:** The agent operates as a complete marketing function across multiple portfolio companies. It manages spend recommendations, coordinates with other GTM agents, and optimizes based on accumulated data.

**Capabilities delivered:**
- Media spend recommendations: agent identifies top-performing content for paid amplification and recommends budget allocation by channel. Generates ad creative briefs. Initially recommends; a human executes. Includes reverse drawdown capability — when data shows a channel is underperforming, the agent proposes a staged spend reduction (e.g., 50% cut → full cut over 4 weeks) with sales pipeline monitoring at each step, rather than cold cuts. At Sidecar, this methodology is being used to safely cut ~$12,900/month from LinkedIn and Google Paid while monitoring for B2B pipeline impact.
- Partner channel monitoring: agent tracks revenue from partner-driven channels (partnerships, referral programs) without attempting to optimize them. Partners own their own marketing; the agent reports on partner revenue as inbound and flags if partner performance drops below historical baselines.
- Sales enablement content: converts marketing content into sales-ready formats (one-pagers, talking points, objection handling) that feed into the sales team's workflow
- AIDP cross-agent integration: marketing content and experiment results shared with AI SDR (for nurture content) and Voice SDR (for conversation context) through the AIDP
- Advanced analytics and optimization: cross-channel attribution, content ROI by type and topic, experiment velocity and win rate reporting. Multi-pipeline attribution that distinguishes D2C conversion metrics from higher-value B2B/Team pipeline indicators.
- Multi-channel expansion: additional social platforms, video distribution, community engagement beyond LinkedIn
- Cross-company performance benchmarking: compare marketing effectiveness across portfolio companies to identify and share best practices. Includes sharing anti-patterns across companies (e.g., "LinkedIn sponsored messaging produced 0 conversions at Company A — don't repeat at Company B").

**Key decisions / risks:**
- Media spend management is a different risk profile than content production. Budget decisions require tighter approval gates and clearer guardrails. The reverse drawdown pattern provides a safety mechanism, but the agent must also handle the case where a drawdown reveals pipeline impact — it needs a "restore spend" path, not just a "cut" path.
- Cross-agent data sharing requires AIDP maturity and a shared data model across all three GTM agents.
- Multi-channel expansion multiplies integration complexity. Each new platform has its own API, content formats, and best practices.

**Data model requirements (Phase 3 additions):**

- **Content Performance Metric table** — Polymorphic (ContentTypeID + ContentID, same pattern as Content Approval). Daily granularity via MetricDate. Columns for page views, unique visitors, avg time on page, bounce rate, social shares/likes/comments/clicks, newsletter opens/clicks, conversions, and source (analytics platform name). Supports tracking performance across all content types from multiple analytics sources.

**Dependencies:** Phase 2 complete with proven experimentation framework, AIDP cross-agent data model, ad platform API access (for media spend)

## Capabilities from rasa.io FRD to consider (not yet phased)

The rasa.io Marketing Automation Agent FRD (in `context/`) contains detailed functional requirements that go beyond the current roadmap. The following capabilities are worth incorporating as the product matures:

- **Content refresh identification** — Scanning older blog posts (6+ months) for update opportunities: posts with declining search rankings, previously high-performing content on evergreen topics with new developments, or content that could benefit from updated statistics or examples. This is a distinct capability from creating new content and helps maintain the value of the existing content library over time.
- **AI news/RSS feed monitoring** — Configurable industry news feeds and RSS sources as a content research input, beyond social media trends and podcast transcripts. Helps the agent identify timely topics and emerging trends in the company's industry.
- **Brand voice consistency scoring** — Automated scoring of generated content against brand guidelines before human review. Scores on tone, vocabulary, sentence structure, and value focus. Flags content that deviates from brand standards. This would reduce the reviewer's burden by catching brand voice issues before they reach the approval queue.
- **Image generation for social posts** — Custom branded images (1-2 per blog post) with brand-consistent colors, fonts, and style. Includes key quotes or statistics from the blog. Optimized for LinkedIn feed dimensions. Distinct from text-only social posts.
- **Follow-up email nurture sequences** — 3-5 email drip sequences per blog topic, segmented by audience (new prospects, trial users, existing customers). Formatted for import into email tools or the AI SDR. Goes beyond newsletter content into structured nurture campaigns.
- **Webinar promotion workflow** — Automated content generation 2-3 weeks before a webinar (blog post, social posts, email invitation, reminder series) and post-webinar follow-up (thank you email, recording announcement, key takeaways blog). Triggered by upcoming webinar schedule.
- **Community engagement suggestions** — Identifying relevant LinkedIn discussions, groups, or posts where the company could engage with thoughtful comments or share relevant blog content. Tracking community engagement activity. Distinct from posting — this is about participating in existing conversations.

## Future vision (not phased)

- **AI SDR content integration.** The Marketing Agent produces nurture content that the AI SDR uses in its outreach to lower-intent prospects. Engagement data from AI SDR outreach flows back to marketing as a signal for which content resonates.
- **Voice SDR context sharing.** Marketing campaign activity and content engagement data are available to the Voice SDR so inbound conversations can reference what the visitor has already seen and engaged with.
- **Unified marketing intelligence.** All three GTM agents share data through the AIDP, creating a closed loop where marketing experiments inform outbound messaging, outbound engagement informs marketing strategy, and inbound conversations validate what's working across both.
