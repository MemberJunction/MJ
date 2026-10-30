import { describe, it, expect } from 'vitest';
import { AssemblyRefused } from '../refusal';

describe('AssemblyRefused', () => {
  it('carries its refusal and reports it as an assembly-stage training refusal', () => {
    const e = new AssemblyRefused({ kind: 'unresolved-column', entity: 'Years', field: 'Nope' });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AssemblyRefused');
    expect(e.Refusal).toEqual({ kind: 'unresolved-column', entity: 'Years', field: 'Nope' });
    expect(e.TrainingRefusal).toEqual({ stage: 'assembly', reason: { kind: 'unresolved-column', entity: 'Years', field: 'Nope' } });
  });
});
