import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { writeFileIfChanged } from '../Misc/file-write';
import { EmitStats } from '../Misc/emit-stats';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe('writeFileIfChanged', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    EmitStats.Reset();
  });

  it('writes when the file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(writeFileIfChanged('/tmp/out.ts', 'hello')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'hello');
    expect(EmitStats.Snapshot().filesWritten).toBe(1);
    expect(EmitStats.Snapshot().filesSkipped).toBe(0);
  });

  it('skips the write when bytes are identical', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('hello');
    expect(writeFileIfChanged('/tmp/out.ts', 'hello')).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(EmitStats.Snapshot().filesWritten).toBe(0);
    expect(EmitStats.Snapshot().filesSkipped).toBe(1);
  });

  it('rewrites when bytes differ', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('old');
    expect(writeFileIfChanged('/tmp/out.ts', 'new')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'new');
  });
});
