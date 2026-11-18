---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/global": patch
"@memberjunction/video-studio": patch
"@memberjunction/video-studio-core": patch
"@memberjunction/video-studio-render-worker": patch
---

Execute the Video Studio post-release hardening workstreams (`plans/video-studio-hardening.md`): add shared real-render test gates (`VIDEO_STUDIO_RENDER_TESTS_REQUIRED=1`) and CI workflow (`.github/workflows/video-studio-render.yml`, WS1); fix `PayloadManager` dotted/bracketed keys and empty-array upstream merges, update `JSONValidator.CleanValidationSyntax` and `AIPromptRunner` so colon-bearing keys like `16:9` and unrecognized `:rule` suffixes stay intact (#4827), and remove all `INTERIM` workarounds across Video Studio including unused `RestoreStrippedFormatKeys` (WS2); record Consult & Handoff ownership and independent review findings (WS3); unify stage-name normalization in `gates.ts` and decompose long orchestrator methods in `VideoStudioAgent` (WS4); add the orchestrator Loop vs code-led decision record (WS5); and record shipped scope in `plans/video-studio.md` §15 (WS6-2).
