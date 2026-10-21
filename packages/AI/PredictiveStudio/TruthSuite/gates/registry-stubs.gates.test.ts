import { it } from 'vitest';
import { GateRegistry } from '../src/registry/load';
import { GateResults } from '../src/gates/results';

// One named test per gate whose owner has not written its body yet. Replacing a stub = one literal
// TruthGate.Define('<TestName>', …) in a gate file named by subject, and Implementation.Kind "body" (or "external").
for (const gate of GateRegistry.Load().filter((g) => g.Implementation.Kind === 'stub')) {
  it(gate.TestName, () => {
    GateResults.Write(gate, 'not-implemented', { Measurement: null, Error: null, DurationMs: 0, Note: `owner PR ${gate.OwnerPR} implements this gate's body` });
  });
}
