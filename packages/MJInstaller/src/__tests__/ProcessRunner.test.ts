import { EventEmitter } from 'node:events';
import type { ProcessResult } from '../adapters/ProcessRunner.js';

// ---------------------------------------------------------------------------
// Mock child_process
// ---------------------------------------------------------------------------
let lastSpawnedChild: MockChildProcess;

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 12345;
  killed = false;

  kill() {
    this.killed = true;
  }
}

function createMockChild(): MockChildProcess {
  const child = new MockChildProcess();
  lastSpawnedChild = child;
  return child;
}

const mockSpawn = vi.fn(() => createMockChild());
const mockExecSync = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Import AFTER mock is installed
const { ProcessRunner } = await import('../adapters/ProcessRunner.js');

describe('ProcessRunner', () => {
  let runner: InstanceType<typeof ProcessRunner>;

  beforeEach(() => {
    runner = new ProcessRunner();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Run', () => {
    it('should return stdout, stderr, and ExitCode on normal completion', async () => {
      const promise = runner.Run('echo', ['hello']);
      const child = lastSpawnedChild;

      child.stdout.emit('data', Buffer.from('hello world\n'));
      child.stderr.emit('data', Buffer.from('some warning\n'));
      child.emit('close', 0);

      const result: ProcessResult = await promise;
      expect(result.ExitCode).toBe(0);
      expect(result.Stdout).toBe('hello world\n');
      expect(result.Stderr).toBe('some warning\n');
      expect(result.TimedOut).toBe(false);
    });

    it('should default ExitCode to 1 when close code is null', async () => {
      const promise = runner.Run('cmd', []);
      const child = lastSpawnedChild;

      child.emit('close', null);

      const result = await promise;
      expect(result.ExitCode).toBe(1);
    });

    it('should call OnStdout callback with each non-empty line', async () => {
      const lines: string[] = [];
      const promise = runner.Run('cmd', [], {
        OnStdout: (line) => lines.push(line),
      });
      const child = lastSpawnedChild;

      child.stdout.emit('data', Buffer.from('line1\nline2\nline3\n'));
      child.emit('close', 0);

      await promise;
      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('should call OnStderr callback with each non-empty line', async () => {
      const lines: string[] = [];
      const promise = runner.Run('cmd', [], {
        OnStderr: (line) => lines.push(line),
      });
      const child = lastSpawnedChild;

      child.stderr.emit('data', Buffer.from('warn1\nwarn2\n'));
      child.emit('close', 0);

      await promise;
      expect(lines).toEqual(['warn1', 'warn2']);
    });

    it('should filter out empty lines from OnStdout callbacks', async () => {
      const lines: string[] = [];
      const promise = runner.Run('cmd', [], {
        OnStdout: (line) => lines.push(line),
      });
      const child = lastSpawnedChild;

      child.stdout.emit('data', Buffer.from('line1\n\n\nline2\n'));
      child.emit('close', 0);

      await promise;
      expect(lines).toEqual(['line1', 'line2']);
    });

    it('should set TimedOut: true and kill the process tree on timeout', async () => {
      // On Windows, killTree uses execSync('taskkill ...')
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const promise = runner.Run('slow-cmd', [], { TimeoutMs: 5000 });
      const child = lastSpawnedChild;

      // Advance past the timeout
      vi.advanceTimersByTime(5001);

      // The timeout handler should have called killTree, which calls execSync
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('taskkill'),
        expect.anything()
      );

      // Now let the child close
      child.emit('close', null);

      const result = await promise;
      expect(result.TimedOut).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should resolve with ExitCode 1 and error message on spawn error', async () => {
      const promise = runner.Run('nonexistent', []);
      const child = lastSpawnedChild;

      child.emit('error', new Error('spawn nonexistent ENOENT'));

      const result = await promise;
      expect(result.ExitCode).toBe(1);
      expect(result.Stderr).toBe('spawn nonexistent ENOENT');
      expect(result.TimedOut).toBe(false);
    });

    it('should pass cwd and env to spawn options', async () => {
      const promise = runner.Run('cmd', ['--flag'], {
        Cwd: '/custom/path',
        Env: { MY_VAR: 'value' },
      });
      const child = lastSpawnedChild;
      child.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd',
        ['--flag'],
        expect.objectContaining({
          cwd: '/custom/path',
          env: expect.objectContaining({ MY_VAR: 'value' }),
        })
      );
    });

    it('should spawn with shell: true on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const promise = runner.Run('npm', ['install']);
      const child = lastSpawnedChild;
      child.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({ shell: true })
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should spawn with shell: false on non-Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const promise = runner.Run('npm', ['install']);
      const child = lastSpawnedChild;
      child.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({ shell: false })
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should accumulate multiple stdout chunks', async () => {
      const promise = runner.Run('cmd', []);
      const child = lastSpawnedChild;

      child.stdout.emit('data', Buffer.from('chunk1'));
      child.stdout.emit('data', Buffer.from('chunk2'));
      child.stdout.emit('data', Buffer.from('chunk3'));
      child.emit('close', 0);

      const result = await promise;
      expect(result.Stdout).toBe('chunk1chunk2chunk3');
    });

    it('should clear the timeout handle when the process closes normally', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = runner.Run('cmd', [], { TimeoutMs: 60000 });
      const child = lastSpawnedChild;

      child.emit('close', 0);
      await promise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('RunSimple', () => {
    it('should return trimmed stdout on success', async () => {
      const promise = runner.RunSimple('node', ['--version']);
      const child = lastSpawnedChild;

      child.stdout.emit('data', Buffer.from('  v22.0.0  \n'));
      child.emit('close', 0);

      const result = await promise;
      expect(result).toBe('v22.0.0');
    });

    it('should throw an Error on non-zero exit code', async () => {
      const promise = runner.RunSimple('bad-cmd', ['--fail']);
      const child = lastSpawnedChild;

      child.stderr.emit('data', Buffer.from('command not found'));
      child.emit('close', 127);

      await expect(promise).rejects.toThrow('failed (exit 127)');
    });

    it('should include command and args in the error message', async () => {
      const promise = runner.RunSimple('npm', ['run', 'build']);
      const child = lastSpawnedChild;

      child.stderr.emit('data', Buffer.from('build error'));
      child.emit('close', 1);

      await expect(promise).rejects.toThrow('npm run build');
    });
  });

  describe('CommandExists', () => {
    it('should return true when the command is found (exit 0)', async () => {
      const promise = runner.CommandExists('npm');
      const child = lastSpawnedChild;

      child.stdout.emit('data', Buffer.from('C:\\Program Files\\npm\\npm.cmd\n'));
      child.emit('close', 0);

      const result = await promise;
      expect(result).toBe(true);
    });

    it('should return false when the command is not found (non-zero exit)', async () => {
      const promise = runner.CommandExists('nonexistent-tool');
      const child = lastSpawnedChild;

      child.stderr.emit('data', Buffer.from('not found'));
      child.emit('close', 1);

      const result = await promise;
      expect(result).toBe(false);
    });

    it('should use "where" on Windows to locate commands', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const promise = runner.CommandExists('git');
      const child = lastSpawnedChild;
      child.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'where',
        ['git'],
        expect.anything()
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should use "which" on Unix to locate commands', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      const promise = runner.CommandExists('git');
      const child = lastSpawnedChild;
      child.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'which',
        ['git'],
        expect.anything()
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should return false if Run throws an exception', async () => {
      // Make spawn throw directly
      mockSpawn.mockImplementationOnce(() => {
        throw new Error('spawn failed');
      });

      const result = await runner.CommandExists('broken');
      expect(result).toBe(false);
    });
  });

  describe('killTree', () => {
    beforeEach(() => {
      // Clear any calls from previous test groups (e.g. timeout tests calling killTree)
      mockExecSync.mockClear();
    });

    it('should be a no-op when pid is undefined', () => {
      runner.killTree(undefined);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should be a no-op when pid is 0', () => {
      runner.killTree(0);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should call taskkill on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      runner.killTree(9999);

      expect(mockExecSync).toHaveBeenCalledWith(
        'taskkill /F /T /PID 9999',
        expect.objectContaining({ stdio: 'ignore' })
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should use process.kill with SIGTERM on Unix', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      runner.killTree(9999);

      expect(killSpy).toHaveBeenCalledWith(-9999, 'SIGTERM');

      killSpy.mockRestore();
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should not throw if the process has already exited', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('process not found');
      });

      // Should not throw
      expect(() => runner.killTree(9999)).not.toThrow();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('killByPort', () => {
    beforeEach(() => {
      mockExecSync.mockClear();
    });

    it('should call netstat and taskkill on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      mockExecSync.mockReturnValueOnce(
        '  TCP    0.0.0.0:4000    0.0.0.0:0    LISTENING    5678\n'
      );

      runner.killByPort(4000);

      // First call: netstat to find the PID
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('netstat'),
        expect.anything()
      );
      // Second call: taskkill to kill the PID
      expect(mockExecSync).toHaveBeenCalledWith(
        'taskkill /F /T /PID 5678',
        expect.objectContaining({ stdio: 'ignore' })
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should call lsof on Unix', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      runner.killByPort(4000);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('lsof'),
        expect.anything()
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should not throw if no process is listening on the port', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('no output');
      });

      expect(() => runner.killByPort(4000)).not.toThrow();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should skip PID 0 from netstat output', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      mockExecSync.mockReturnValueOnce(
        '  TCP    0.0.0.0:4000    0.0.0.0:0    LISTENING    0\n'
      );

      runner.killByPort(4000);

      // Should call netstat but NOT taskkill (PID 0 is filtered out)
      const taskkillCalls = mockExecSync.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('taskkill')
      );
      expect(taskkillCalls).toHaveLength(0);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
