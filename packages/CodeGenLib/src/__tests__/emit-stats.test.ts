import { describe, it, expect, beforeEach } from 'vitest';
import { EmitStats } from '../Misc/emit-stats';

describe('EmitStats', () => {
  beforeEach(() => {
    EmitStats.Reset();
  });

  it('starts at zero', () => {
    expect(EmitStats.Snapshot()).toEqual({
      filesWritten: 0,
      filesSkipped: 0,
      schemasEmitted: 0,
      schemasSkipped: 0,
      assembleMs: 0,
    });
  });

  it('records writes, skips, schema emit, and assemble time independently', () => {
    EmitStats.RecordFileWrite(true);
    EmitStats.RecordFileWrite(true);
    EmitStats.RecordFileWrite(false);
    EmitStats.RecordSchemaEmit(true);
    EmitStats.RecordSchemaEmit(false);
    EmitStats.AddAssembleMs(12);
    EmitStats.AddAssembleMs(8);
    expect(EmitStats.Snapshot()).toEqual({
      filesWritten: 2,
      filesSkipped: 1,
      schemasEmitted: 1,
      schemasSkipped: 1,
      assembleMs: 20,
    });
  });

  it('reset clears a prior pass so two CodeGen runs do not share counters', () => {
    EmitStats.RecordFileWrite(true);
    EmitStats.Reset();
    expect(EmitStats.Snapshot().filesWritten).toBe(0);
  });
});
