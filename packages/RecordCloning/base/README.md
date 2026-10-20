# @memberjunction/record-cloning-base

Client-safe foundation for MemberJunction Entity Record Cloning.

## Overview

`@memberjunction/record-cloning-base` provides the core contracts, types, policy resolution, key classification, name templates, JSON remapping, and configuration validation for the record cloning subsystem.

It has **zero database dependencies** and **no server-only dependencies**, making it safe for use in both browser environments (such as Angular Explorer UI) and server environments (MJAPI).

## Key Components

1. **Contracts and Types (`types.ts`)**:
   - `RecordCloneRequest`, `CloneRequestOptions`
   - `ClonePlan`, `ClonePlanNode`, `ClonePlanEdge`
   - `CloneFieldChange`, `CloneWarning`, `RecordCloneResult`
2. **Deterministic Plan Hash (`ClonePlanHash.ts`)**:
   - Builds the canonical form of a plan (nodes, edges, actions, field transformations; generated target keys ignored). The engine hashes it with SHA-256, so this package stays dependency-free.
3. **8-Tier Policy Precedence (`ClonePolicyResolver.ts`)**:
   - Evaluates whether an edge is traversed as `Deep`, `Reference`, or `Skip` based on built-ins, database constraints, entity config, relationship config, presets, and request overrides.
4. **Name Template Engine (`NameTemplate.ts`)**:
   - Formats copy names using tokens (`{Name}`, `{n}`, `{Date}`, `{User}`).
5. **Unique Key Classifier (`UniqueKeyClassifier.ts`)**:
   - Categorizes single-column, parent-scoped, and live-state unique constraints.
6. **JSON Remap Engine (`JsonRemapEngine.ts`)**:
   - Rewrites nested JSON documents and structures, with built-in presets (`dashboard-ui-config`, `scheduled-job-configuration`).
7. **Field Mapping Pipeline (`CloneFieldMapper.ts`)**:
   - Pure, ordered field transformation pipeline (exclude, copy, reset, ownership, rename, FK and JSON remap, overrides, prompted values, rules).
8. **Configuration Validator (`CloneConfigValidator.ts`)**:
   - Validates `.clone-configurations.json` metadata rules.
