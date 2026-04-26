# Visitor-Merging Optimization Plan

**Status**: Planned (not started)  
**Created**: 2026-04-12  
**Priority**: Low — revisit when linting becomes a bottleneck  
**Prerequisite**: Phase 4 refactoring complete (all rules in individual files with self-registration)

## Problem

The component linter performs **~86 separate `traverse()` calls** per component lint. Each of the 70 rule files calls `traverse(ast, { ... })` independently, walking the full AST tree each time. For a typical 100-line component with ~300 AST nodes, this means ~25,800 node visits per lint.

### Current Performance
- **~31ms per component** (measured on 300 real production fixtures)
- Fixture suite: 300 components in 9.4s
- Most visited node types across all rules:
  - `MemberExpression`: referenced by 156 visitor handlers across 40+ rules
  - `CallExpression`: referenced by 113 handlers across 30+ rules
  - `VariableDeclarator`: referenced by 55 handlers across 20+ rules

### When This Matters
- Batch linting hundreds of components in CI/CD
- Component generation loop in Skip-Brain (lint → fix → re-lint cycles)
- Very large components (1000+ lines)
- Currently NOT a bottleneck for single-component interactive use

## Solution: Merged Visitor Traversal

Replace N independent `traverse()` calls with a single traversal that fans out to all rule handlers per node type.

### Target Architecture

```
Current:
  Rule 1: traverse(ast, { MemberExpression(p) { ... } })
  Rule 2: traverse(ast, { MemberExpression(p) { ... }, CallExpression(p) { ... } })
  Rule 3: traverse(ast, { CallExpression(p) { ... } })
  ... × 70 rules = ~86 traverse calls

Proposed:
  Orchestrator: traverse(ast, {
    MemberExpression(p) { rule1.onMember(p); rule2.onMember(p); ... },
    CallExpression(p)   { rule2.onCall(p); rule3.onCall(p); ... },
    ...
  })
  = 1 traverse call
```

### Expected Improvement
- **3-10x speedup** on rule execution phase
- Per-component lint: ~31ms → ~5-10ms
- Parse and type inference phases unchanged

## Interface Design

### New: VisitorRule (optional, additive)

```typescript
interface VisitorRule {
  /** Unique rule name */
  name: string;

  /** Which components this rule applies to */
  appliesTo: 'all' | 'child' | 'root';

  /**
   * AST visitor handlers. Each key is a Babel AST node type.
   * The orchestrator merges all rules' visitors into a single traversal.
   */
  visitors: Partial<Record<string, VisitorHandler>>;

  /**
   * Optional: called once before traversal starts.
   * Use for initializing per-lint state (tracked variables, maps, etc.)
   */
  setup?: (context: VisitorContext) => void;

  /**
   * Optional: called once after traversal completes.
   * Use for producing violations from accumulated state.
   */
  finalize?: (context: VisitorContext) => Violation[];
}

interface VisitorHandler {
  (path: NodePath, context: VisitorContext): void;
}

interface VisitorContext {
  ast: t.File;
  componentName: string;
  componentSpec?: ComponentSpec;
  typeContext?: TypeContext;
  violations: Violation[];
  /** Per-rule state storage — rules access their own state via rule name key */
  state: Map<string, unknown>;
}
```

### Backward Compatible: LintRule (existing)

The existing `LintRule.test()` interface continues to work. Rules that haven't been migrated run their own `traverse()` as before. The orchestrator runs merged visitors first, then falls back to `test()` for unmigrated rules.

```typescript
// In the orchestrator:
// Phase 1: Run merged visitor traversal (all VisitorRules)
const mergedViolations = runMergedTraversal(ast, visitorRules, context);

// Phase 2: Run legacy test() for unmigrated rules
for (const rule of legacyRules) {
  violations.push(...rule.test(ast, name, spec, options, typeContext));
}
```

## Migration Strategy

### Phase 1: Infrastructure (estimate: 1 session)
- Create `VisitorRule` interface in `lint-rule.ts`
- Add `registerVisitorRule()` to `RuleRegistry`
- Update orchestrator to merge and execute visitor rules before legacy rules
- Write 2-3 rules using the new interface to validate the pattern

### Phase 2: Migrate High-Impact Rules (estimate: 1-2 sessions)
Migrate the ~20 rules that visit `MemberExpression` and `CallExpression` — these account for most traversal overhead.

Priority rules (by traversal frequency):
1. `styles-invalid-path` / `styles-unsafe-access` — simple MemberExpression visitors
2. `prefer-jsx-syntax` / `prefer-async-await` — simple CallExpression + MemberExpression
3. `no-use-reducer` / `no-require-statements` — simple CallExpression visitors
4. `string-replace-all-occurrences` — simple CallExpression + MemberExpression
5. `utilities-api-validation` / `utilities-no-direct-instantiation` — CallExpression visitors

These are "simple" rules where the visitor handler is self-contained (no multi-pass patterns).

### Phase 3: Migrate Medium-Complexity Rules (estimate: 2-3 sessions)
Rules with two-pass patterns (collect state, then validate):
- `entity-field-access-validation` — discovers RunView calls, then validates field access
- `runview-result-null-safety` — tracks result variables, checks .Results access
- `child-component-prop-validation` — collects dependency info, then checks JSX

These need the `setup → visitors → finalize` lifecycle.

### Phase 4: Assess Remaining Rules (estimate: 1 session)
Some rules may not be worth migrating:
- Rules with complex multi-traverse patterns
- Rules that run rarely (deprecated rules)
- Rules where the performance gain is negligible

Leave these using `test()` — the hybrid approach still gets most of the benefit.

## Two-Pass Rule Pattern

Many rules need to collect state during one traversal pass and validate during another. The visitor-merging approach handles this with `setup` and `finalize`:

```typescript
const entityFieldRule: VisitorRule = {
  name: 'entity-field-access-validation',
  appliesTo: 'all',

  setup(ctx) {
    // Initialize per-lint state
    ctx.state.set('entity-field', {
      runViewEntities: new Map(),  // varName → entityName
      entityArrayVars: new Map(),  // varName → entityName
    });
  },

  visitors: {
    // Phase 1: Collect RunView result variables
    VariableDeclarator(path, ctx) {
      const state = ctx.state.get('entity-field');
      // Track const result = await utilities.rv.RunView(...)
      // ... (same logic as current rule, but without separate traverse)
    },

    // Phase 2: Validate field access (runs in same traversal, after VariableDeclarator)
    MemberExpression(path, ctx) {
      const state = ctx.state.get('entity-field');
      // Check if this accesses an entity field
      // ... validation logic
    },
  },

  finalize(ctx) {
    // Emit skip-with-warning for unresolved entities
    return ctx.violations;
  },
};
```

**Note**: Babel's `traverse` visits nodes in depth-first order. A `VariableDeclarator` for `const result = await rv.RunView(...)` will be visited BEFORE the `MemberExpression` for `result.Results.map(...)` that appears later in the code. So single-pass collection + validation works for most patterns.

**Exception**: Rules that need to collect information from the ENTIRE file before validating (e.g., `unused-libraries` which needs to see all code to determine if a library is used) would use `finalize` to check collected state after the full traversal.

## Performance Measurement

Before and after benchmarks should measure:

```typescript
// In test file or CLI:
const start = performance.now();
for (let i = 0; i < N; i++) {
  await ComponentLinter.lintComponent(code, name, spec, true);
}
const avgMs = (performance.now() - start) / N;
```

Target metrics:
- Average per-component lint time
- Total fixture suite time (300 components)
- Breakdown: parse time vs type inference time vs rule execution time

## Risks

1. **Visitor ordering** — When multiple rules handle the same node type, the order they execute could matter if one rule's handler affects shared state. Mitigation: rules should only write to their own namespaced state.

2. **Error isolation** — Currently, if one rule throws, it's caught and the next rule runs. With merged visitors, a throw inside a handler aborts the entire traversal. Mitigation: wrap each handler dispatch in try/catch.

3. **Debugging difficulty** — With 40 handlers firing on each `MemberExpression`, debugging which one produced a violation is harder. Mitigation: each handler sets `violation.rule` to its rule name (already required).

4. **Migration effort** — 70 rules is a lot to migrate. The hybrid approach (migrate high-impact rules first, leave the rest) reduces this significantly.

## Decision Criteria

Revisit this plan when any of these conditions are met:
- Linting is measurably slowing down Skip-Brain's component generation loop
- A CI/CD pipeline needs to lint 100+ components and takes >30 seconds
- A new feature requires multiple lint passes (e.g., incremental re-linting)
- The codebase grows to 100+ rules where the traversal overhead is more significant

## References

- [ESLint Rule Architecture](https://eslint.org/docs/latest/extend/custom-rules) — ESLint uses this exact pattern: rules export a `create()` function returning visitor handlers, and the engine merges them into a single traversal.
- [Babel Plugin Visitors](https://babeljs.io/docs/plugins#plugin-visitor) — Babel itself merges plugin visitors when multiple plugins are applied.
- Current linter architecture: [LINTER-ARCHITECTURE.md](LINTER-ARCHITECTURE.md)
