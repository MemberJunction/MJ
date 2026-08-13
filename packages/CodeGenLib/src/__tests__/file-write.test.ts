import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { writeFileIfChanged } from '../Misc/file-write';

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
  });

  it('writes when the file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(writeFileIfChanged('/tmp/out.ts', 'hello')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'hello');
  });

  it('skips the write when bytes are identical', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('hello');
    expect(writeFileIfChanged('/tmp/out.ts', 'hello')).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('rewrites when bytes differ', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('old');
    expect(writeFileIfChanged('/tmp/out.ts', 'new')).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/out.ts', 'new');
  });
});
