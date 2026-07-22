# @memberjunction/context-crush

Dependency-light, framework-agnostic **token-optimization primitives** for AI
agents and any TypeScript code that ships large payloads into a model's context
window. Every primitive is a pure function over plain strings/objects — no
MemberJunction entity coupling, no AI calls, deterministic output.

## What's inside

| Export | Purpose |
|---|---|
| `CrushJSON(value, opts?)` | Structural JSON compression — collapses arrays-of-objects to a `columns`/`rows` table, elides null/empty fields, interns repeated long strings, and emits byte-stable minified output. |
| `DescribeCrush(result)` | Renders a compact, model-readable legend explaining a `CrushJSON` result so the meaning is recoverable. |
| `PartitionStablePrefix(messages, opts?)` | Splits a conversation into a byte-stable `stable` prefix and a mutable `volatile` tail, so callers can prune/compact without invalidating a provider's KV-cache prefix. |
| `CrushCode(source, lang, opts?)` *(subpath `@memberjunction/context-crush/code`)* | AST-aware source reduction — keeps signatures/structure, collapses non-focal function bodies. Behind a subpath export so the base import stays parser-free. |

## Usage

```ts
import { CrushJSON, DescribeCrush } from '@memberjunction/context-crush';

const result = CrushJSON(largeArrayOfRecords, { MaxChars: 8000 });
const prompt = `${DescribeCrush(result)}\n${result.Text}`;
// result.OriginalChars / result.CrushedChars report the savings.
```

```ts
// Code reduction lives behind a subpath so the base package stays zero-dep.
import { CrushCode } from '@memberjunction/context-crush/code';
```

## Determinism

`CrushJSON` produces **byte-identical** output for the same logical input
(stable key ordering, no `Date.now`/random). This is load-bearing: it lets
`PartitionStablePrefix` keep a re-rendered payload from breaking provider
KV-cache hits across turns.

## Credits & prior art

Several primitives here are independent TypeScript re-implementations of
*concepts* from **[Headroom](https://github.com/chopratejas/headroom)**
(`chopratejas/headroom`), an Apache-2.0 context-compression system for AI
agents:

- `CrushJSON` / `DescribeCrush` ← Headroom's **SmartCrusher**
- `PartitionStablePrefix` ← Headroom's **CacheAligner**
- `CrushCode` ← Headroom's **CodeCompressor**

These are clean-room implementations written from the published algorithm
descriptions — **no Headroom source is copied, vendored, or depended upon**, and
this package does not use the "Headroom" name in its own identity. See the
[`NOTICE`](./NOTICE) file and the canonical attribution record in
[`plans/agent-token-optimization.md`](../../../plans/agent-token-optimization.md)
(§0).
