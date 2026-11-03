# Executive Briefing Guidance

## Purpose
Use the Executive Briefing archetype for 90 to 180 second leadership presentations synthesizing strategic posture, financial or operational KPIs, key risks, and recommended decisions. Because leadership briefings carry high stakes, this archetype defaults to `ApproveStoryboard` so stakeholders review the narrative and data bindings at Gate G2 before rendering.

## Beat Intent
- **hook**: Open with the executive summary headline and primary bound metric in the first three seconds.
- **posture**: Present the macro scorecard across core strategic pillars using bound metrics and period comparisons.
- **deep-dive**: Examine the most critical trend or variance chart in detail, highlighting root causes backed by data.
- **risks-and-options**: Frame the key operational risks or trade-offs clearly alongside the evidence supporting each path.
- **decision**: State the recommended leadership action or resource allocation with explicit expected impact.
- **close**: Conclude on the decision summary card and display the required provenance footer `Data as of {AsOf}` with authoritative source names.

## What to Avoid
- Never use playful or bouncy motion curves; keep transitions restrained, deliberate, and editorial.
- Avoid visual clutter—never exceed two data visualizations or four metric tiles in a single frame.
- Do not obscure caveats or baselines; every comparison must clearly state the reference period.

## Facts Rule
Never invent financial figures, operational metrics, forecasts, logos, product screens, or people. Every number and chart must bind to `DataBindings` and resolve into `DataSnapshot`, and the `close` beat must display `Data as of {AsOf}`. If any executive metric or source binding cannot be verified, block at Gate G1 and ask.
