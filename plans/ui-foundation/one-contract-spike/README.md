# One Contract spike

Scripts behind section 6 of [ONE_CONTRACT_PLAN.md](../ONE_CONTRACT_PLAN.md). They are a proof, not product code, and nothing in MJ imports them.

## Run it

Run it **outside the repo**. MJ is a pnpm workspace and `npm install` must never run inside it.

```sh
MJ=/path/to/MJ                       # a checkout with origin/next and PR #6673 fetched as pr-6673
cp -r "$MJ/plans/ui-foundation/one-contract-spike" /tmp/one-contract-spike && cd /tmp/one-contract-spike
npm init -y
npm i typescript@5.9.3 @types/react react react-dom babel7@npm:@babel/standalone@7.24.4
```

| Step | Command | Shows |
|---|---|---|
| 1 | `node gen-types.mjs` | Declarations generated from `spec.json` |
| 2 | `node check.mjs widget.bad.tsx widget.good.tsx` | The TypeScript checker finds eight planted mistakes, then none |
| 3 | `node strip-and-run.mjs` | Babel 7.24.4 strips the types; the result runs through the runtime's factory shape on current React |
| 4 | `mkdir shipped && git -C "$MJ" archive origin/next metadata/components/code \| tar -x -C shipped && node compat.mjs` | Every shipped JSX component compiles identically with the TypeScript preset on |
| 5 | see below | The contract gates against the wave 0 `mj-surface` prototype |

Step 5:

```sh
cd contract
B=packages/Angular/Generic/ui-primitives-prototype/src/lib
git -C "$MJ" show pr-6673:$B/surface/surface.component.ts > surface.component.ts
git -C "$MJ" show pr-6673:$B/styles/primitives-prototype.css > primitives.css
node proof.mjs
```

## Files

| File | What it is |
|---|---|
| `spec.json` | A sample widget spec: properties, an event, data requirements, one child component |
| `contract.d.ts` | A simplified platform contract (`utilities`, `styles`, `callbacks`), all ambient |
| `gen-types.mjs` | Spec to declarations. Row types hold only the fields the spec declared |
| `check.mjs` | In-memory TypeScript check with cached library files |
| `widget.bad.tsx`, `widget.good.tsx` | The same widget with and without the planted mistakes |
| `strip-and-run.mjs` | Type stripping and a render through the injected-React factory |
| `compat.mjs` | Backward-compatibility run over the shipped components |
| `contract/surface.contract.json` | A hand-written contract for `surface` |
| `contract/proof.mjs` | Gates G2 to G6 from the plan, plus a drift test |

## Limits

- `contract.d.ts` is a cut-down contract, not the real `@memberjunction/interactive-component-types`.
- The Angular check reads source with the TypeScript parser. It does not render Angular.
- The DOM parity check renders the React binding only.
