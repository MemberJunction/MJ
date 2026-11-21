import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { WriteFileIfChanged } from '../Misc/file-write';
import { EmitStats } from '../Misc/emit-stats';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('writeFileIfChanged', () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    EmitStats.Reset();
  });

  it('writes when the file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw fsError('ENOENT');
    });
    expect(WriteFileIfChanged('/tmp/out.ts', 'hello')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'hello');
    expect(EmitStats.Snapshot().filesWritten).toBe(1);
    expect(EmitStats.Snapshot().filesSkipped).toBe(0);
  });

  it('skips the write when bytes are identical', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('hello');
    expect(WriteFileIfChanged('/tmp/out.ts', 'hello')).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(EmitStats.Snapshot().filesWritten).toBe(0);
    expect(EmitStats.Snapshot().filesSkipped).toBe(1);
  });

  it('rewrites when bytes differ', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('old');
    expect(WriteFileIfChanged('/tmp/out.ts', 'new')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'new');
  });

  it('reads the file directly instead of checking that it exists first', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('hello');
    WriteFileIfChanged('/tmp/out.ts', 'hello');
    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'utf-8');
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
  });

  it('surfaces read errors other than a missing file', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw fsError('EACCES');
    });
    expect(() => WriteFileIfChanged('/tmp/out.ts', 'hello')).toThrow('EACCES');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
