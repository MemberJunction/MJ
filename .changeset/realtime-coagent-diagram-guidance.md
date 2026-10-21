---
"@memberjunction/ai-agents": minor
---

The Realtime Co-Agent system prompt now tells the agent how to work visually on the shared whiteboard. The guidance applies only when the session has `Whiteboard_*` tools.

- **Choosing a medium for diagrams.** Simple sketches (about six boxes or fewer, one flow, notes on the user's drawing) use native board items: shapes, connectors, notes and text. Medium and complex diagrams (architecture, sequence, ER and org diagrams, timelines, charts, anything with roughly eight or more nodes or that needs precise layout) go in a single `Whiteboard_AddHtml` widget holding a hand-written inline SVG. That SVG uses a `viewBox` that scales, suits the widget's white background, labels nodes and edges, and is revised in place with `Whiteboard_UpdateContent`.
- **A creative partner out of the box.** The prompt describes what HTML widgets make possible (clickable mockups, step-through explainers, slider-driven what-if playgrounds, quizzes and drag-to-sort exercises, mind maps and option cards, and charts of real data the target agent fetched) and encourages the agent to offer a visual when one would help. Any made-up figures in a mockup must be labeled as sample data.
- **Sandbox rules a widget must follow.** Vanilla code only with no network; no `alert`, `confirm`, `prompt`, pop-ups or storage; `MJWhiteboard.submit` for input the agent needs; labeled controls so background interaction notes make sense; and carrying the user's current choices into a revised widget, because `Whiteboard_UpdateContent` resets its state.
- **Conversation habits.** Narrate while a large widget generates, then walk the user through it, react to submissions without commenting on every click, and never read markup aloud.

Metadata only (`metadata/prompts/templates/Voice Co-Agent - System Prompt.template.md`), no code change.
