# Functional decomposition — small, focused functions

MJ codebases tend toward long methods that do too much. The rule is simple
and aggressive: **functions stay around 30–40 lines, and nesting stays
shallow.** If a function is getting long, decompose it *now*, not after
you've finished writing it.

## The rule

- **Maximum function length: ~30–40 lines** (excluding comments)
- **Maximum nesting: 2 levels** of loops / conditionals
- **If you need a comment to explain a section of a function, that section
  should probably be its own function.**

## Why

Aggressive decomposition pays off in five ways:

1. **Readability.** Each function has a single clear purpose. Reading the
   parent function reads like prose — "first do X, then Y, then Z" — and
   you can drill into a specific step when you need detail.

2. **Testability.** Small functions are trivial to unit test. Long
   functions force integration tests because the assertions span too many
   side effects.

3. **Maintainability.** When something breaks, the function it broke in
   is small enough to read fully and understand. Stack traces with named
   helpers (`buildColumnDefs`, `applyVisualConfig`) are far more useful
   than stack traces full of anonymous arrow functions inside a 500-line
   `ngOnInit`.

4. **Reusability.** Small functions tend to be reusable; large functions
   never are. Once you decompose, you find the pieces useful elsewhere.

5. **Debugging.** Set a breakpoint on a helper and you see exactly what
   it produces. A breakpoint in the middle of a long function gives you
   a confusing local-variable soup.

## Concrete example

```typescript
// ❌ BAD: 200-line function with deep nesting and "section comments"
protected generateCascadeDeletes(entity: EntityInfo): string {
    let result = '';
    // Find all related entities
    for (const rel of metadata.Relationships) {
        if (rel.RelatedEntityID === entity.ID) {
            // ... 30 lines determining which deletes apply
            for (const op of operations) {
                if (op.Type === 'delete') {
                    // ... 50 lines generating one delete
                } else if (op.Type === 'nullify') {
                    // ... 50 lines generating one nullify
                }
            }
        }
    }
    // Append cleanup
    // ... 30 lines
    return result;
}

// ✅ GOOD: decomposed into focused helpers
protected generateCascadeDeletes(entity: EntityInfo): string {
    const operations = this.findRelatedOperations(entity);
    const sqlBlocks = operations.map(op => this.generateOperation(op));
    const cleanup = this.generateCleanup(entity);
    return [...sqlBlocks, cleanup].join('\n');
}

protected findRelatedOperations(entity: EntityInfo): Operation[] {
    // 15 lines — finds related entities
}

protected generateOperation(operation: Operation): string {
    switch (operation.Type) {
        case 'delete':   return this.generateDelete(operation);
        case 'nullify':  return this.generateNullify(operation);
    }
}

protected generateDelete(operation: Operation): string {
    // 20 lines — one specific case
}

protected generateNullify(operation: Operation): string {
    // 20 lines — one specific case
}

protected generateCleanup(entity: EntityInfo): string {
    // 15 lines — final cleanup SQL
}
```

The decomposed version is longer in total lines but **shorter per
function**, and any one piece can be understood and tested in isolation.

## When to decompose

Stop and refactor when **any one** of these is true:

- Function exceeds ~30–40 lines (your editor scrolls)
- You're about to write a comment that says "now we do X"
- You have nested loops or conditionals beyond 2 levels
- You're repeating similar code patterns within the function
- The function name would need "And" to be accurate ("`loadAndValidate`",
  "`fetchAndProcess`")
- You're using local variables that act as "phase markers" (`isProcessing`,
  `phaseTwoDone`)

## When NOT to decompose

Don't shred a coherent algorithm into a dozen one-line helpers just
because the parent broke 30 lines. If a 50-line function is *one cohesive
algorithm* with no obvious decomposition points (e.g. a custom hash
function, a parser routine, a tight numeric loop), leave it.

The rule is "stays around 30–40 lines"; "around" is the operative word.
A 45-line function with three logical sections that resist splitting
is fine. A 45-line function with seven distinct chunks is not.

## Class-level decomposition: shared base classes

The same principle applies one level up. **When you see three or more
classes with similar structure, extract a shared base class.**

Common patterns to watch for in MJ code:

- Multiple Action subclasses with similar parameter extraction → extract
  a `BaseAction` helper method
- Multiple components with the same "load + transform + display" structure
  → a base component with `protected async load()` hook
- Multiple validators returning the same error shape → a `BaseValidator`
  with shared error formatting

Benefits of getting class-level decomposition right:

- Fix a bug in one place, get it everywhere
- New subclasses inherit the shared behavior automatically
- Tests for the base class cover all subclasses
- Clear "is-a" relationships in the type system

When in doubt, make it a method first. Promote to a base class when the
third copy of the same code appears — that's the inflection point.

## The mental test before writing the next line

When you're about to add code to a function and it's already 30 lines,
stop. Ask:

> "Does this new code belong **in this function**, or is it a different
> step that this function should **call**?"

If the answer is "different step", extract a helper *first*, then add the
new code there. Doing this consistently keeps the codebase from sliding
into 500-line `ngOnInit`s.
