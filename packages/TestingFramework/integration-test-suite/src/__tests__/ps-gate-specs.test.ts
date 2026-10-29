import { describe, it, expect } from 'vitest';
import { PsGateSpecs } from '../checks/ps-gates/ps-gate-specs';

describe('PsGateSpecs.Ref', () => {
  it('narrows catalog codes to dataset references and refuses anything else', () => {
    expect(PsGateSpecs.Ref('world', 'W1-signal', 42)).toEqual({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    expect(PsGateSpecs.Ref('scenario', 'T3-lag', 2203)).toEqual({ Kind: 'scenario', ID: 'T3-lag', Seed: 2203 });
    expect(() => PsGateSpecs.Ref('world', 'C2', 1)).toThrow(/not a dataset/);
  });
});
