import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HarnessSidecar, type SidecarRestartDeps, type SpawnedSidecar } from '../sidecar';

const SIDECAR_URL = 'http://127.0.0.1:64203';
const OLD_PID = 4242;
const NEW_PID = 5151;

/** A recording stand-in for the process seams: which pids run, what was signalled and spawned, what health answers. */
class FakeProcesses {
  public Running = new Set<number>();
  public Signals: Array<{ Pid: number; Signal: NodeJS.Signals }> = [];
  public SpawnedPorts: number[] = [];
  /** Exit code the spawned process reports right away, or null when it keeps running. */
  public ExitCode: number | null = null;
  /** Whether the spawned process writes its pid file. */
  public WritesPid = true;
  public Healthy = true;
  /** Whether SIGTERM stops the process. */
  public StopsOnSigterm = true;

  constructor(private readonly dir: string) {}

  public Deps(overrides: Partial<SidecarRestartDeps> = {}): SidecarRestartDeps {
    return {
      UrlFile: path.join(this.dir, 'sidecar.url'), PidFile: path.join(this.dir, 'sidecar.pid'), LogFile: path.join(this.dir, 'sidecar.log'),
      StopTimeoutMs: 50, StartTimeoutMs: 50, PollIntervalMs: 5,
      IsRunning: (pid) => this.Running.has(pid),
      Signal: (pid, signal) => {
        this.Signals.push({ Pid: pid, Signal: signal });
        if (this.StopsOnSigterm) this.Running.delete(pid);
      },
      Spawn: (port) => this.spawn(port),
      IsHealthy: async () => this.Healthy,
      ...overrides,
    };
  }

  private spawn(port: number): SpawnedSidecar {
    this.SpawnedPorts.push(port);
    if (this.WritesPid) writeFileSync(path.join(this.dir, 'sidecar.pid'), String(NEW_PID));
    const code = this.ExitCode;
    return { OnExit: (listener) => { if (code !== null) listener(code); } };
  }
}

describe('HarnessSidecar.Restart', () => {
  let dir: string;
  let fake: FakeProcesses;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ps-sidecar-restart-'));
    fake = new FakeProcesses(dir);
    writeFileSync(path.join(dir, 'sidecar.url'), SIDECAR_URL);
    writeFileSync(path.join(dir, 'sidecar.pid'), String(OLD_PID));
    fake.Running.add(OLD_PID);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('stops the named process, starts a new one on the same port and returns the unchanged SIDECAR_URL once it is healthy', async () => {
    await expect(HarnessSidecar.Restart(fake.Deps())).resolves.toBe(SIDECAR_URL);
    expect(fake.Signals).toEqual([{ Pid: OLD_PID, Signal: 'SIGTERM' }]);
    expect(fake.SpawnedPorts).toEqual([64203]);
    expect(readFileSync(path.join(dir, 'sidecar.pid'), 'utf8')).toBe(String(NEW_PID));
  });

  it('refuses when the pid file is missing, and neither signals nor starts anything', async () => {
    rmSync(path.join(dir, 'sidecar.pid'));
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow(`${path.join(dir, 'sidecar.pid')} is missing`);
    expect(fake.Signals).toEqual([]);
    expect(fake.SpawnedPorts).toEqual([]);
  });

  it('refuses when the pid file names a process that is already gone, and starts nothing', async () => {
    fake.Running.clear();
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow(`names process ${OLD_PID}, which is not running`);
    expect(fake.Signals).toEqual([]);
    expect(fake.SpawnedPorts).toEqual([]);
    expect(existsSync(path.join(dir, 'sidecar.pid'))).toBe(true);
  });

  it('refuses when the SIDECAR_URL file is missing', async () => {
    rmSync(path.join(dir, 'sidecar.url'));
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow(`${path.join(dir, 'sidecar.url')} is missing`);
    expect(fake.Signals).toEqual([]);
  });

  it('throws when the stopped process does not exit within the stop timeout, and starts nothing', async () => {
    fake.StopsOnSigterm = false;
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow(`the truth sidecar (process ${OLD_PID}) did not exit within 0.05 s of SIGTERM`);
    expect(fake.SpawnedPorts).toEqual([]);
  });

  it('throws naming the SIDECAR_URL and the log file when the new sidecar is never healthy within the start timeout', async () => {
    fake.Healthy = false;
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow(
      `the restarted truth sidecar was not healthy at ${SIDECAR_URL} within 0.05 s (see ${path.join(dir, 'sidecar.log')})`,
    );
  });

  it('is not healthy until the new process has written its own pid file', async () => {
    fake.WritesPid = false;
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow(`was not healthy at ${SIDECAR_URL}`);
  });

  it('throws naming the exit code when the new sidecar exits before it is healthy', async () => {
    fake.ExitCode = 1;
    fake.Healthy = false;
    await expect(HarnessSidecar.Restart(fake.Deps())).rejects.toThrow('the restarted truth sidecar exited with code 1 before it was healthy');
  });
});
