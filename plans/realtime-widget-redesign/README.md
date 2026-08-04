# Realtime Voice Widget — UX Redesign

Open **`index.html`** in a browser. Use the top bar to switch **Direction** (Calm Orb / Command Console / Floating Glass) × **Mode** (Overlay / Full screen) × **State** (Connecting / Listening / Speaking). The right rail explains each direction and the proposed widget API.

## The problem (from studying `realtime-session-overlay.component.*`)
The live widget is powerful but cramped in the chat overlay:
- **Connecting state clips** — the centered full-screen loader doesn't degrade gracefully in a narrow (~390px) overlay.
- **Control overload** — header (captions/gear/minimize/pure-audio/end) + bottom bar (mute/captions/details/type/end) + channel strip + resizable surface panel + focus pill = far too much for an overlay.
- **No way to hide things** — visibility is driven by an internal "disclosure ratchet," not by host-settable inputs, so the overlay can't slim it down for mobile/narrow.

## Three divergent directions (all in the mockup)
1. **Calm Orb (ambient).** The breathing orb *is* the UI. 2 visible controls (Mute, End); Captions/Type/Surface bloom from a single `•••`. Connecting = the orb dims + rising dots (same footprint at any width). Full screen auto-fades controls; optional slide-in conversation rail. *No two-pane console — staying ambient is the point.*
2. **Command Console (structured).** Tidy header, caption banner + transcript, a fixed **dock** with a grouped segmented cluster (mic·captions·type) + separated End. Advanced/dev settings in a **slide-in drawer**. Overlay = single column, no panel + one "Expand". Full screen = real **two-pane** (conversation | Whiteboard/Browser/Activity tabs).
3. **Floating Glass (spatial).** The surface is the **backdrop**; orb, transcript, captions, controls, activity are **floating frosted-glass islands**. One glass control pill; `•••` blooms chips. Full screen lets the islands breathe over the live surface. Made for touch.

## The shared fix — make controls declarative `@Input`s
Turn today's hard-coded/disclosure-driven controls into inputs so the **host** decides what shows. The overlay ships a lean set; the full-screen / dedicated route opts into the rich set.

```html
<!-- chat overlay: lean -->
<mj-realtime-overlay
    [Compact]="isNarrow"
    [Density]="'simple'"
    [ShowSurfacePanel]="false"
    [ShowActivityRail]="false"
    [ShowChannels]="false"
    [ShowDevLinks]="false"
    [ShowDensityPicker]="false"
    [AutoHideControls]="true">

<!-- full-screen / dedicated route: rich -->
<mj-realtime-overlay
    [Compact]="false"
    [Density]="'pro'"
    [ShowSurfacePanel]="true"
    [ShowActivityRail]="true"
    [ShowSettingsDrawer]="true"
    [ShowDevLinks]="devMode">
```

Plus: a **`Chrome`** input (`'orb' | 'console' | 'glass'`) if we want to keep more than one direction, and `[ControlLayout]` (`'cluster' | 'spread' | 'floating'`). Connecting-state should be a **size-independent, centered** treatment in every direction (the mockup shows each).

## Recommendation
- **Overlay default → Calm Orb.** It's the most beautiful at 390px and on mobile, and it makes "hide the advanced stuff" the natural state rather than a compromise.
- **Full-screen / dedicated route → Command Console.** When there's room, structured zones + the two-pane surface are the most *useful*.
- **Floating Glass** is the standout "wow" demo and the best fit if the surface (whiteboard/browser) is the star of the experience — great for sales demos / trainer agents.

A pragmatic path: build the **input-driven control model** once (benefits all directions), ship **Calm Orb** chrome for the overlay + **Console** chrome for full screen, and keep **Glass** as an opt-in `[Chrome]="'glass'"` for immersive surfaces.
