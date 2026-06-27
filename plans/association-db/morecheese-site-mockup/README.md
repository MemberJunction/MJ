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

| Page | Purpose |
|---|---|
| `index.html` | Homepage — hero, six pillars, Betty showcase, upcoming events, membership / education / advocacy / community teasers, big CTA |
| `about.html` | The federation's story, mission, history, leadership, financials |
| `membership.html` | Five tiers, benefits, join flow (member application → order → payment confirmation) |
| `events.html` | Calendar + event listing with filters |
| `event-detail.html` | One detailed event with registration flow visible (registration → cart → checkout) |
| `education.html` | Courses, certifications (Apprentice through Master Cheesemaker), continuing education |
| `awards.html` | National Cheese Awards — competitions, finalists, judges, past winners |
| `standards.html` | Standards library — published standards, draft standards under review, the plenary process |
| `advocacy.html` | Legislative tracking — active positions, advocacy actions, position papers |
| `chapters.html` | The 15 chapters worldwide — chapter directory, officer rosters, regional events |
| `community.html` | Public preview of the member forums |
| `committees.html` | Public-facing committee information (Standards, Education, Awards, Advocacy, etc.) |
| `resources.html` | Resource library — research, white papers, the bundled Content Source PDFs |
| `portal.html` | Member portal (mock signed-in view) — subscription status, certifications, courses in progress, upcoming registrations, recent messages, Sonar engagement score, recommended actions |
| `messaging.html` | Secure messaging (mock signed-in) — threads with staff, committee discussions, peer-to-peer messages |
| `betty-voice.html` | Standalone Betty voice-agent showcase — the conversational/voice surface in full-screen demonstration mode |
| `contact.html` | Contact info, office locations, Betty as primary entry point |

> Some pages may ship in later iterations of this mockup as the design firms up. `index.html`, `membership.html`, `events.html`, `event-detail.html`, `education.html`, `portal.html`, `betty-voice.html`, `about.html` are the priority set.

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
