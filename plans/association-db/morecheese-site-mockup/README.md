# MoreCheese.org — Public Site Mockup

A full-resolution HTML mockup of the proposed redesign of **morecheese.org** (the International Cheese Federation public website), as specified in Phase 14 of [`v2-plan.md`](../v2-plan.md).

This is a static, self-contained design comp. Open any HTML file directly in a browser — no build step, no server. All pages share `assets/css/tokens.css` + `assets/css/main.css` and a floating Betty voice-agent widget (`assets/js/betty-widget.js`).

## How to view

```bash
# From the mockup directory:
open index.html
# or
python3 -m http.server 8000   # then visit http://localhost:8000
```

Best viewed at desktop width (≥1200px). Responsive breakpoints handle tablet/mobile cleanly.

## What's modeled

The mockup reflects the **public-facing surface** of the redesigned morecheese.org as a real production demo site (per Phase 14 of the plan — backed by a single production deployment of the `@memberjunction/demo-morecheese` Open App).

### Pages in this mockup

| Page | Purpose | Status |
|---|---|---|
| `index.html` | Homepage — hero, six pillars, Betty showcase, upcoming events, membership/education/advocacy/community teasers, big CTA | ✅ |
| `about.html` | The federation's story, mission, 9-event timeline, leadership/board, committees, financials w/ 990s, sponsor policy | ✅ |
| `membership.html` | Five tiers, benefits, "what dues pay for", 3-step join flow with form, FAQ | ✅ |
| `events.html` | Format + region filters, featured Annual Conference card, 9-event grid, "host an event" CTA | ✅ |
| `event-detail.html` | ICF Annual Conference 2026 deep dive — hero, sticky tab bar (overview / schedule / speakers / venue / sponsors / FAQ), full 4-day session schedule, speakers grid, sticky registration sidebar with tier selection + add-ons + live subtotal | ✅ |
| `education.html` | Four certification tracks (Apprentice / Specialist / Master / Educator), 10-course CE library, institutional partners CTA | ✅ |
| `awards.html` | National Cheese Awards — 4-stat hero, how-it-works, 12-category grid, 9 finalist cards (with Best in Show), 8-judge panel | ✅ |
| `advocacy.html` | 12 active positions panel, 5 detailed position cards across FDA / EU / US Congressional / CFIA / Codex with status pills + comment CTAs, recent 5-action timeline | ✅ |
| `community.html` | Forum preview — 11-category sidebar, hot tags, pinned banner, 8 representative threads with reply counts | ✅ |
| `portal.html` | Member portal (signed-in as Elena Rodriguez, Producer-tier) — side nav, KPI tiles, renewal nudge, Sonar engagement gauge w/ 6-signal breakdown, upcoming events, certifications in progress, recent messages, Betty contextual prompts | ✅ |
| `messaging.html` | **Secure messaging** (signed-in) — TitanFile / Cisco Secure Messaging-style surface. Mapped to `@memberjunction/bizapps-secure-messaging`. 3-column layout: portal nav / 7 secure-rooms list with E2EE + files + unread + expiration pills / active room with header (encryption / confidential / retention / compliance pills), tab strip (Files · Messages · Activity · Participants · Permissions), file-centric body with 4 detailed file cards showing per-recipient read receipts, watermark / view-only / no-download / expiration policies, and a 5-event audit-log preview (IP / geo / device / action recorded) | ✅ |
| `betty-voice.html` | Standalone full-screen voice showcase — animated orb with pulse rings, status line, sourced-answer transcript, mic + side controls, 8 try-these prompts, technical footer explaining the Caliber stack | ✅ |
| `committees.html` | **Committees** (public) — Mapped directly to the 14-table `@memberjunction/bizapps-committees` schema. Type-filter tabs (Board / Standing / Standards WG / Ad Hoc / Workgroup) and 10 committee cards covering all types. Deep-dive on Standards Committee: meetings (upcoming + past), recent motions & votes with tallies, open action items with owners + due dates, artifacts linked from SharePoint/Drive/Box/OneDrive, full roster with chair / vice chair / secretary / voting members / non-voting liaisons, "open seats — apply" CTA | ✅ |
| `standards.html` | Standards Library — how-it-works 4-step plenary process, 6 published standards cards (cheddar / alpine / aging caves / sensory rubric / raw-milk / labeling), 4 drafts-under-review cards with status pills (Drafting / Going to Plenary), international-recognition section | ✅ |
| `chapters.html` | All 15 chapters — gradient-banner cards by region (North America / Europe / Asia–Pacific / Latin America / At-Large) with member counts, events/yr, and chapter-chair attribution per chapter | ✅ |
| `resources.html` | Resources & Research library — 12 representative resources (research papers, practical guides, video lectures, datasets, white papers) with access-tier pills (Open / Member / Producer), Research Council grants CTA | ✅ |
| `contact.html` | Two offices (Madison + Annecy), 9 functional desks each with purpose + email, prominent Betty CTA as the fastest path, general contact form | ✅ |

**All 17 pages shipped.** Every link in the top nav, top utility bar, and footer resolves. The two BizApps surfaces (`committees.html` and `messaging.html`) are built against the actual `@memberjunction/bizapps-committees` and `@memberjunction/bizapps-secure-messaging` open apps.

### BizApps open-app fidelity

| Mockup page | Open app modeled | Notes |
|---|---|---|
| `committees.html` | [@memberjunction/bizapps-committees](https://github.com/MemberJunction/bizapps-committees) | 14-table schema, 5 committee types, 7 roles, 9 artifact types — all reflected. Document-linking from SharePoint/Drive/Box/OneDrive shown. |
| `messaging.html` | [@memberjunction/bizapps-secure-messaging](https://github.com/MemberJunction/bizapps-secure-messaging) | End-to-end encrypted messaging + secure file rooms, per-recipient read receipts, watermarking, expiration, audit trail, access policies (view-only / no-download / print-disabled). Repo is private — mockup based on stated repo description ("end-to-end encrypted messaging with read receipts") + product idiom from TitanFile / Cisco Secure Messaging. |

## Design language

**Palette** — Warm artisan tones:
- **Gold** (`--mc-gold-500`, `#c2941e`) — butter, primary brand
- **Rind** (`--mc-rind-500`, `#6b1f1c`) — burgundy / wine, secondary
- **Sage** (`--mc-sage-500`, `#547139`) — pastoral green, accent
- **Oak** (`--mc-oak-500`, `#7a5930`) — warmth, depth
- **Cream / Paper / Ivory / Bone** — paper-warm backgrounds
- **Ink** — charcoal text, never pure black

All colors defined as semantic tokens in `tokens.css`. Dark sections (`.section-rind`, `.section-dark`) auto-invert.

**Typography**:
- **Display** — [Fraunces](https://fonts.google.com/specimen/Fraunces) (modern variable serif, has personality without being precious)
- **Body** — [Inter](https://fonts.google.com/specimen/Inter) (clean, legible, professional)
- **Mono** — JetBrains Mono / system mono for eyebrows, metadata, technical attribution

**Tone**: warm but professional. Confident, sources-everything, not chatty. The site is for adults who run businesses around making cheese — not a hobbyist forum and not a luxury food magazine.

## Betty (voice agent)

Betty is the on-page conversational agent — powered by **MJ Caliber** (MemberJunction's realtime voice + agent stack). She floats on every page as a discoverable FAB in the bottom-right, expanding to a chat panel on click.

- **Voice** — tap the mic for full-duplex voice (mockup simulates with mic-state animation)
- **Text** — type into the input for written exchange
- **Sourced** — every response cites the event / standard / position / resource it pulled from (mockup shows representative replies; production reads live from the demo DB)
- **Member-aware** — once signed in, knows the user's renewal date, certifications, registrations, messages

Suggested prompts in the widget exercise representative scenarios from the plan: certifications, events near me, federation position on a legislative item, member-portal questions.

## What's NOT mocked here

- The signed-in flow uses fixed mock data; no real auth or session
- Forms don't submit anywhere (alerts on subscribe)
- Skip components, predictive models, and rich AI surfaces appear on the team-facing `app.morecheese.org` Explorer (different mockup; not in this folder)
- Apollo enrichment, Sonar scoring details, agent administration — same; live in the Explorer surface
- Real images — placeholder gradients used throughout for crisp rendering without external image deps. Production design will swap in commissioned photography (cheesemakers, aging caves, events, member portraits).

## Relationship to the v2 plan

This mockup is the visual realization of **Phase 14.A (morecheese.org redesign)** and **Phase 14.B (Betty embedded as voice agent)** from `v2-plan.md`. It also gives the design partner a concrete starting point rather than a blank canvas.

The companion team-facing Explorer surface (`app.morecheese.org`) is Phase 14.C — that's the standard MJ Explorer with MoreCheese theming and would be mocked separately if needed.

## File structure

```
morecheese-site-mockup/
├── README.md                     this file
├── index.html                    homepage
├── about.html, membership.html, events.html, …  (sub-pages)
└── assets/
    ├── css/
    │   ├── tokens.css            design tokens
    │   └── main.css              shared stylesheet
    └── js/
        └── betty-widget.js       floating voice/chat agent
```
