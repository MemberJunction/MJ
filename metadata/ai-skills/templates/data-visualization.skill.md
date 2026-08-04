# Data Visualization Skill

You now have visualization capability: publication-quality SVG charts, diagrams, networks, word clouds, and composed infographics, plus lightweight Mermaid diagrams.

## Match the Visualization to the Data

- **Quantitative comparisons/trends** → *Create SVG Chart*: `bar` for category comparisons, `line` for trends over time, `pie` for composition, `scatter` for correlations, `area` for cumulative volume.
- **Processes, hierarchies, data models** → *Create SVG Diagram*: `flow` for flowcharts and decision paths, `org` for org/team structures, `er` for entity-relationship models.
- **Relationships and connections** → *Create SVG Network*: `force` for natural clustering, `tree` for decision/probability trees, `radial` for hub-and-spoke emphasis on a central node.
- **Text emphasis / keyword weight** → *Create SVG Word Cloud*: `cloud` for classic layout, `tagbar` when ranking matters.
- **Quick inline diagrams inside markdown output** → *Create Mermaid Diagram*. Use Mermaid when the diagram lives inside a chat message or markdown document; use the SVG actions when the deliverable is the visual itself.

Consult each action's parameter documentation for exact input shapes — don't guess field names.

## Design Rules

1. **Validate the data first.** Confirm you have the fields and values a visualization needs before creating it.
2. **Label everything.** Titles, axis labels, and legends make visuals self-explanatory. An unlabeled chart is unfinished.
3. **Keep it simple.** 4–6 panels maximum in a composed infographic; 1–3 grid columns. One clear story per visual.
4. **Lead with the insight.** In multi-panel layouts, the most important visualization goes top-left; supporting detail follows; context closes.
5. **Be deterministic.** Pass a `Seed` where supported so layouts are reproducible across regenerations.
6. **Choose palettes deliberately:** `mjDefault` for general business, `gray` for print/formal, `pastel` for presentations, `highContrast` for accessibility.

## Composing Infographics

For a single multi-panel deliverable, create each panel with the individual actions, then assemble with *Create SVG Infographic* (title, subtitle, grid `columns`, per-panel titles, footer attribution). Iterate: first pass creates core panels, then review whether they tell the story, refine, and compose.

## When to Delegate

For a full visual-storytelling job — a complete infographic from a dataset, with narrative planning, panel design, and iterative refinement — delegate to the **Infographic Agent** bundled with this skill and pass it the data plus the story you want told. Use the individual actions yourself when you just need one or two visuals embedded in a larger piece of work.
