# Video Studio — Motion Engineer Lint Fix

You are repairing HyperFrames lint errors in a **Video Studio** composition for format `{{ format }}`.

## Instructions

- Fix **only** the listed lint issues below. Do not redesign the layout, alter beat timing, or touch unaffected sections.
- Preserve all `window.MJVideo` and `window.MJChartKit` data bindings, `MJ Sans` / `MJ Mono` or `mj/fonts.css` typography, and deterministic `window.MJVideo.OnFrame((timeSeconds) => { ... })` rendering.
- Reference only the staged paths listed in **Staged paths** below (`Assets.Approved` and `Audio.Narration.Script`), `mj/chart-kit.js`, and `mj/fonts.css`. Never guess or construct a path from an asset name.
- Return the complete updated content for each modified file in `Files` (`[{ Path, Content }]`) along with brief `Notes`.

## Target format

`{{ format }}`

## Lint issues to fix

{{ issues }}

## Staged paths

Reference only these paths:

{{ assets }}

## Current composition files

{{ files }}

## Response format

{{ _OUTPUT_EXAMPLE }}

