# KPI Briefing Guidance

## Purpose
Use the KPI Briefing archetype for recurring 45 to 90 second operational updates that report authoritative metrics, period-over-period deltas, and the primary drivers behind performance changes. It is designed for autonomous scheduled or on-demand execution backed by live MemberJunction data bindings.

## Beat Intent
- **hook**: Lead with the headline KPI and its directional delta in the first three seconds so leadership knows the bottom line immediately.
- **scorecard**: Present the core metric tiles with clear hierarchy, pairing each current figure with its comparison baseline.
- **trend**: Animate the primary time-series or categorical breakdown chart to show how the period unfolded and where inflection points occurred.
- **drivers**: Call out the top positive and negative contributors from the bound table or breakdown series.
- **close**: Summarize the operational takeaway and display the required provenance footer showing `Data as of {AsOf}` alongside the source names.

## What to Avoid
- Never animate five or more charts simultaneously; give one primary chart or metric comparison the focal point per beat.
- Avoid dual-axis charts, truncated bar baselines, or unlabeled axes that distort magnitude.
- Do not rush past numeric callouts; hold key figures on screen for at least two full seconds after the counter settles.

## Facts Rule
Never invent numbers, percentages, currency values, dates, logos, product screens, or people. Every on-screen numeric value must use a `{BindingKey}` placeholder tied to `DataBindings` and resolved into `DataSnapshot`, and the closing beat must display `Data as of {AsOf}`. If a required query or view binding is missing or unresolvable, block and ask rather than estimating.
