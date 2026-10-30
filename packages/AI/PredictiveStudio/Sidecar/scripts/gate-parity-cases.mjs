/**
 * Case generator for the gate parity tests (tests/test_gate_parity.py here, tests/test_gate_parity_refpipe.py in the
 * TruthSuite package): the reference pipeline's gate generator (same LCG, same draws, same order), calling the built
 * @memberjunction/predictive-studio-core, so the TypeScript decisions can be compared with the Python gates.
 * Usage: node scripts/gate-parity-cases.mjs <seed> <cases>   -> JSON {out, iv} on stdout.
 * Plain JavaScript outside tsc: the TypeScript under test is the built Core.
 */
import { EvaluationProtocol, GateRules } from '@memberjunction/predictive-studio-core';

let seed = Number(process.argv[2] ?? '7');
const N = Number(process.argv[3] ?? '5000');
const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const out = [];
for (let n = 0; n < N; n++) {
  const members = ['glm', 'oneFeature'].filter(() => r() < 0.9);
  const mb = {}, sc = {};
  for (const m of members) { mb[m] = r() < 0.5; sc[m] = Math.round(r() * 4) / 4; }
  const dm = r() < 0.3 && members.length ? members[Math.floor(r() * members.length)] : null;
  const i = { modelName: 'M', modelBeatsDummy: r() < 0.5, modelBeatsBestSimple: r() < 0.5, memberBeatsDummy: mb, memberScores: sc, deliveredMember: dm };
  const g = GateRules.DecideGate(i);
  out.push({ i, g: [g.outcome, g.branch, g.outcome === 'keep-simple-baseline' ? g.shipped : null] });
}

const iv = [];
const lower = () => Math.round((r() - 0.5) * 40) / 1000;
const itv = () => { const lo = lower(); return { value: lo + 0.01, lower: lo, upper: lo + 0.02 }; };
for (let n = 0; n < N; n++) {
  const margin = Math.round(r() * 10) / 1000;
  const members = ['glm', 'oneFeature'].filter(() => r() < 0.9);
  const mv = {}, sc = {};
  for (const m of members) { mv[m] = itv(); sc[m] = Math.round(r() * 4) / 4; }
  const dm = r() < 0.3 && members.length ? members[Math.floor(r() * members.length)] : null;
  const s = { modelName: 'M', modelVsDummy: itv(), modelVsBestSimple: members.length && r() < 0.95 ? itv() : null, memberVsDummy: mv, memberScores: sc, deliveredMember: dm };
  const gi = GateRules.GateInputsFromIntervals(s, EvaluationProtocol.ToNonNegative(margin));
  const g = GateRules.DecideGate(gi);
  iv.push({ s, margin, b: [gi.modelBeatsDummy, gi.modelBeatsBestSimple, gi.memberBeatsDummy], g: [g.outcome, g.branch, g.outcome === 'keep-simple-baseline' ? g.shipped : null] });
}

process.stdout.write(JSON.stringify({ out, iv }));
