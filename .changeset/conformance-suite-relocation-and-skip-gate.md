---
"@memberjunction/ai": patch
"@memberjunction/unit-testing": patch
"@memberjunction/ai-azure": patch
"@memberjunction/ai-cerebras": patch
"@memberjunction/ai-groq": patch
"@memberjunction/ai-minimax": patch
"@memberjunction/ai-mistral": patch
"@memberjunction/ai-ollama": patch
"@memberjunction/ai-openrouter": patch
"@memberjunction/ai-zhipu": patch
"@memberjunction/integration-test-suite": patch
---

Move the shared LLM conformance suite out of the runtime `@memberjunction/ai` package, and gate silent skip-growth in the integration registry (review fixes for #3542).

**Conformance suite relocated to `@memberjunction/unit-testing`.** The shared BaseLLM
streaming/ChatResult conformance suite and its OpenAI-compatible seam mock previously lived in
`@memberjunction/ai/src/test-support/` and were consumed through a deep `@memberjunction/ai/dist/test-support/*.js`
import — reaching past the package's public API into its build output, which resolved only because
`@memberjunction/ai` has no `exports` map, and which shipped test code plus an optional `vitest`
peer dependency inside the runtime package. Both files (and the suite's own reference regression
test) now live in `@memberjunction/unit-testing`, are exported from its index
(`RunLLMConformanceSuite`, `CreateOpenAICompatibleSeamMock`, and their types), and the eight
provider conformance suites import them from `@memberjunction/unit-testing`. `@memberjunction/ai`
no longer ships `dist/test-support/*` and no longer declares the optional `vitest` peer. No runtime
behavior changes; test-only wiring.

**Skip-growth is now gated, not just reported.** `check-registry.test.ts` gained a snapshot of the
exact set of checks that self-skip out of the deterministic lane (every `RequiresMutation` and
`RequiresLiveModel` check across all bundles). A change that makes a check newly self-skip — or
silently un-gates one — now fails the unit tests with a paste-ready diff, instead of only shrinking
the CI step-summary. Also corrected a stale `task-graph-execution` count (26 → 27) in the
all-bundle coverage-loss guard that had drifted after a `next` merge added TX27.
