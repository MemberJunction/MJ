# @memberjunction/jit-catching

Catching JiTTests for MJ. Design: [`plans/catching-jittests-design.md`](../../../plans/catching-jittests-design.md).

Private, repo-local. `jit-catch run --pr <n>` runs the whole pipeline locally; `generate`, `execute` and `assess` are the three CI jobs.

Requirements: Docker, `git`, `gh` (logged in), `ANTHROPIC_API_KEY`; for judges also `OPENAI_API_KEY` and `GEMINI_API_KEY`.
Settings: `jit-catch.settings.json` in this folder.
Runs write to `<repo>/.jit-catch/runs/<RunID>/`.
