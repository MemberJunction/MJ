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
Client-side AI inference using Transformers.js with Angular. Tests running language models entirely in the browser before integrating into MJ's AI provider system.

**Status**: 🧪 Active experimentation
**Related PR**: [#1970](https://github.com/MemberJunction/MJ/pull/1970)

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
