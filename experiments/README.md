# MemberJunction Experiments

This directory contains **experimental prototypes and proof-of-concept applications** that are **not part of the main MJ build**.

## Purpose

Experiments are standalone projects used to:
- Test new technologies before integration
- Validate architectural approaches
- Prototype features for review
- Benchmark performance characteristics
- Explore alternative implementations

## Current Experiments

### `transformers-demo/`
Client-side AI inference in an Angular app, two ways: (1) Transformers.js + ONNX Runtime on WebGPU (bring-your-own model), and (2) Chrome's **built-in Prompt API** (`LanguageModel`) — the Gemma 4 model that ships inside Chrome Canary under the Built-in AI Early Preview Program. Tests running language models entirely in the browser before integrating into MJ's AI provider system, including a "router probe" for the client-side pre-processor idea (local intent / target-agent classification ahead of a server-side agent).

**Status**: 🧪 Active experimentation
**Related PR**: [#1970](https://github.com/MemberJunction/MJ/pull/1970)
**Findings**: [`FINDINGS.md`](transformers-demo/FINDINGS.md) (Transformers.js, Feb 2026) · [`FINDINGS-CHROME-BUILTIN-AI.md`](transformers-demo/FINDINGS-CHROME-BUILTIN-AI.md) (Chrome built-in Gemma 4, Sep 2026)

## Guidelines

- Each experiment is self-contained with its own `package.json` and dependencies
- Experiments are **not included** in the workspace monorepo build
- Experiments are committed to git for collaboration and historical reference
- Document each experiment with a clear README explaining:
  - Purpose and goals
  - How to run it
  - What's being tested
  - Next steps for integration (if applicable)
- Clean up or archive experiments once they've served their purpose
