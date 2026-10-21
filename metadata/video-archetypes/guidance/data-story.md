# Data Story Guidance

## Purpose
Use the Data Story archetype for 60 to 180 second analytical narratives that connect multiple datasets to explain why a trend happened, how segments compare, and what decision the evidence supports. Unlike a routine KPI check-in, a Data Story builds a structured argument from question to proof.

## Beat Intent
- **hook**: Open with a striking bound finding or counterintuitive delta in the first three seconds that frames the central analytical question.
- **baseline**: Show the historical baseline or segment distribution so the audience has context for what changed.
- **turning-point**: Reveal the primary time-series or cohort shift with a clear visual annotation on the inflection point.
- **comparison**: Contrast cohorts, regions, or categories using a clean ranked bar or table view backed by bound data.
- **implication**: Translate the quantitative pattern into the concrete operational or strategic lesson.
- **close**: Present the concluding recommendation and render the provenance line `Data as of {AsOf}` with the underlying source list.

## What to Avoid
- Never present raw tables with tiny text; highlight the top rows and summarize the tail clearly.
- Avoid switching color encodings mid-film; keep each series or cohort mapped to a consistent brand palette token throughout.
- Do not extrapolate trendlines beyond the bound dataset unless explicitly provided by a forecast binding.

## Facts Rule
Never invent numbers, cohorts, trends, product screens, logos, or people. Every chart series, table cell, and headline figure must resolve from `DataBindings`, and the closing beat must display `Data as of {AsOf}`. When data sources are missing or incomplete, stop and ask the caller instead of fabricating numbers.
