import path from 'node:path';
import type { PhaseId } from '../errors/InstallerError.js';

/**
 * Mock node:fs/promises before importing InstallState, since InstallState
 * imports fs at module load time.
 */
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
  },
}));

// Import the mocked fs so we can configure return values
import fs from 'node:fs/promises';
import { InstallState } from '../models/InstallState.js';

const mockedFs = vi.mocked(fs);

describe('InstallState', () => {
  const dir = '/test/install';
  const tag = 'v5.2.0';
  const stateFilePath = path.join(dir, '.mj-install-state.json');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set Tag from the second argument', () => {
      const state = new InstallState(dir, tag);
      expect(state.Tag).toBe('v5.2.0');
    });

    it('should set StartedAt as an ISO date string', () => {
      const before = new Date().toISOString();
      const state = new InstallState(dir, tag);
      const after = new Date().toISOString();

      // StartedAt should be a valid ISO string between before and after
      expect(typeof state.StartedAt).toBe('string');
      expect(state.StartedAt >= before).toBe(true);
      expect(state.StartedAt <= after).toBe(true);
    });
  });

  describe('GetPhaseStatus', () => {
    it('should return "pending" for an unrecorded phase', () => {
      const state = new InstallState(dir, tag);
      expect(state.GetPhaseStatus('preflight')).toBe('pending');
    });
  });

  describe('MarkCompleted', () => {
    it('should set phase status to "completed"', () => {
      const state = new InstallState(dir, tag);
      state.MarkCompleted('preflight');
      expect(state.GetPhaseStatus('preflight')).toBe('completed');
    });
  });

  describe('MarkFailed', () => {
    it('should set phase status to "failed"', () => {
      const state = new InstallState(dir, tag);
      state.MarkFailed('scaffold', 'Download timed out');
      expect(state.GetPhaseStatus('scaffold')).toBe('failed');
    });

    it('should record the error message in the phase data', () => {
      const state = new InstallState(dir, tag);
      state.MarkFailed('scaffold', 'Download timed out');

      const json = state.ToJSON();
      expect(json.Phases.scaffold).toBeDefined();
      expect(json.Phases.scaffold!.Error).toBe('Download timed out');
    });
  });

  describe('MarkSkipped', () => {
    it('should set phase status to "skipped"', () => {
      const state = new InstallState(dir, tag);
      state.MarkSkipped('database');
      expect(state.GetPhaseStatus('database')).toBe('skipped');
    });
  });

  describe('FirstIncompletePhase', () => {
    const allPhases: PhaseId[] = [
      'preflight',
      'scaffold',
      'configure',
      'database',
      'platform',
      'dependencies',
      'migrate',
      'codegen',
      'smoke_test',
    ];

    it('should return the first pending phase', () => {
      const state = new InstallState(dir, tag);
      expect(state.FirstIncompletePhase(allPhases)).toBe('preflight');
    });

    it('should return a failed phase (not completed/skipped)', () => {
      const state = new InstallState(dir, tag);
      state.MarkCompleted('preflight');
      state.MarkFailed('scaffold', 'error');
      expect(state.FirstIncompletePhase(allPhases)).toBe('scaffold');
    });

    it('should return null when all phases are completed', () => {
      const state = new InstallState(dir, tag);
      for (const phase of allPhases) {
        state.MarkCompleted(phase);
      }
      expect(state.FirstIncompletePhase(allPhases)).toBeNull();
    });

    it('should return null when all phases are completed or skipped', () => {
      const state = new InstallState(dir, tag);
      state.MarkCompleted('preflight');
      state.MarkCompleted('scaffold');
      state.MarkSkipped('configure');
      state.MarkCompleted('database');
      state.MarkSkipped('platform');
      state.MarkCompleted('dependencies');
      state.MarkCompleted('migrate');
      state.MarkCompleted('codegen');
      state.MarkSkipped('smoke_test');
      expect(state.FirstIncompletePhase(allPhases)).toBeNull();
    });

    it('should skip completed and skipped phases and return next pending', () => {
      const state = new InstallState(dir, tag);
      state.MarkCompleted('preflight');
      state.MarkSkipped('scaffold');
      state.MarkCompleted('configure');
      // database is still pending
      expect(state.FirstIncompletePhase(allPhases)).toBe('database');
    });
  });

  describe('ToJSON', () => {
    it('should return a deep clone (mutating clone does not affect original)', () => {
      const state = new InstallState(dir, tag);
      state.MarkCompleted('preflight');

      const clone = state.ToJSON();
      // Mutate the clone
      clone.Tag = 'MUTATED';
      clone.Phases.preflight = { Status: 'failed', Error: 'mutated' };

      // Original should be unaffected
      expect(state.Tag).toBe('v5.2.0');
      expect(state.GetPhaseStatus('preflight')).toBe('completed');
    });
  });

  describe('Save', () => {
    it('should call fs.writeFile with the correct path and JSON content', async () => {
      mockedFs.writeFile.mockResolvedValue(undefined);

      const state = new InstallState(dir, tag);
      state.MarkCompleted('preflight');
      await state.Save();

      expect(mockedFs.writeFile).toHaveBeenCalledTimes(1);
      const [filePath, content, encoding] = mockedFs.writeFile.mock.calls[0] as [string, string, string];
      expect(filePath).toBe(stateFilePath);
      expect(encoding).toBe('utf-8');

      // Content should be valid JSON with the correct structure
      const parsed = JSON.parse(content);
      expect(parsed.Tag).toBe('v5.2.0');
      expect(parsed.Phases.preflight.Status).toBe('completed');
    });
  });

  describe('Load', () => {
    it('should read file and return InstallState with correct data', async () => {
      const stateData = {
        Tag: 'v5.2.0',
        StartedAt: '2025-01-15T10:00:00.000Z',
        Phases: {
          preflight: { Status: 'completed', CompletedAt: '2025-01-15T10:01:00.000Z' },
          scaffold: { Status: 'failed', FailedAt: '2025-01-15T10:02:00.000Z', Error: 'timeout' },
        },
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(stateData));

      const loaded = await InstallState.Load(dir);

      expect(loaded).not.toBeNull();
      expect(loaded!.Tag).toBe('v5.2.0');
      expect(loaded!.GetPhaseStatus('preflight')).toBe('completed');
      expect(loaded!.GetPhaseStatus('scaffold')).toBe('failed');
      expect(loaded!.GetPhaseStatus('configure')).toBe('pending');
    });

    it('should return null when the file does not exist', async () => {
      const enoent = new Error('ENOENT: no such file or directory');
      (enoent as NodeJS.ErrnoException).code = 'ENOENT';
      mockedFs.readFile.mockRejectedValue(enoent);

      const loaded = await InstallState.Load(dir);
      expect(loaded).toBeNull();
    });

    it('should return null on malformed JSON', async () => {
      mockedFs.readFile.mockResolvedValue('not valid json {{{');

      const loaded = await InstallState.Load(dir);
      expect(loaded).toBeNull();
    });
  });

  describe('Exists', () => {
    it('should return true when fs.access succeeds', async () => {
      mockedFs.access.mockResolvedValue(undefined);

      const result = await InstallState.Exists(dir);
      expect(result).toBe(true);
      expect(mockedFs.access).toHaveBeenCalledWith(stateFilePath);
    });

    it('should return false when fs.access throws', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await InstallState.Exists(dir);
      expect(result).toBe(false);
    });
  });

  describe('Delete', () => {
    it('should call fs.unlink with the correct path', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      const state = new InstallState(dir, tag);
      await state.Delete();

      expect(mockedFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockedFs.unlink).toHaveBeenCalledWith(stateFilePath);
    });

    it('should not throw if the file does not exist', async () => {
      mockedFs.unlink.mockRejectedValue(new Error('ENOENT'));

      const state = new InstallState(dir, tag);
      await expect(state.Delete()).resolves.not.toThrow();
    });
  });
});
