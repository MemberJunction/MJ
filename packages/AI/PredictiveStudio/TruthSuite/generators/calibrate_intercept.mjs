// probes/scenarios/calibrate_intercept.mjs — usage: node calibrate_intercept.mjs specs/<X>.json [nDraws]
// Spec-writing step for binary scenarios with `targetRate` (C2). Draws nDraws feature vectors from the spec's feature
// distributions on a dedicated RNG stream (`<id>:calibration`, independent of the scenario stream), then uses Loom's
// calibrateIntercept (Newton-Raphson with bisection fallback, tolerance 1e-9) to solve mean(sigmoid(b0 + betas.x)) =
// targetRate. The printed intercept is written into the spec's `intercept`.
import fs from 'node:fs';
import { createRng, round } from './gen_lib.mjs';
import { engine } from './loom.mjs';
const { calibrateIntercept } = engine;
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const n = Number(process.argv[3] ?? 200000);
const rng = createRng(spec.seed, `${spec.id}:calibration`);
const scores = [];
for (let i = 0; i < n; i++) {
  let s = 0;
  for (const [f, d] of Object.entries(spec.features)) {
    const v = d.dist === 'normal' ? round(rng.normal(d.mean, d.sd), 4) : d.dist === 'bernoulli' ? (rng.bernoulli(d.p) ? 1 : 0) : rng.int(d.lo, d.hi);
    s += (spec.betas[f] ?? 0) * v;
  }
  scores.push(s);
}
const b0 = calibrateIntercept(scores, spec.targetRate, 1e-9, 200);
console.log(JSON.stringify({ id: spec.id, targetRate: spec.targetRate, nDraws: n, stream: `${spec.id}:calibration`, intercept: round(b0, 6) }));
