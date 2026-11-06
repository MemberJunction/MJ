import { describe, it, expect } from 'vitest';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sandbox } from '../sandbox/Sandbox';
import { DEFAULT_SETTINGS } from '../settings';

const sb = new Sandbox(DEFAULT_SETTINGS.Sandbox);
const base = { Mounts: [{ Host: '/h/base', Container: '/work', Mode: 'ro' as const }], WorkDir: '/work', Command: ['sh', '-c', 'true'], TimeoutMs: 1000 };

describe('Sandbox.BuildArgs', () => {
  it('always passes the hardening flags', () => {
    const a = sb.BuildArgs(base).join(' ');
    for (const flag of ['--network none', '--cap-drop ALL', '--security-opt no-new-privileges', '--pids-limit 1024', '--memory 6g', '--cpus 3', '--rm', '--user ']) expect(a).toContain(flag);
    expect(a).not.toContain('--privileged');
    expect(a).not.toContain('docker.sock');
  });
  it('mounts exactly what is asked, with the mode', () => {
    const a = sb.BuildArgs({ ...base, Mounts: [...base.Mounts, { Host: '/h/jit', Container: '/work/packages/X/src/__tests__/jit', Mode: 'rw' }], Tmpfs: ['/work/node_modules/.vite'] });
    expect(a).toContain('-v'); expect(a).toContain('/h/base:/work:ro'); expect(a).toContain('/h/jit:/work/packages/X/src/__tests__/jit:rw');
    expect(a).toContain('--tmpfs'); expect(a).toContain('/work/node_modules/.vite:rw,size=256m');
  });
  it('passes no environment except the allow list', () => {
    const a = sb.BuildArgs({ ...base, Env: { TZ: 'UTC', HOME: '/tmp' } });
    expect(a).toContain('TZ=UTC');
    expect(() => sb.BuildArgs({ ...base, Env: { ANTHROPIC_API_KEY: 'x' } })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => sb.BuildArgs({ ...base, Env: { PATH: '/x' } })).toThrow(/PATH/);
  });
  it('rejects a host mount of a docker socket or a system folder, also through a symlink', () => {
    for (const host of ['/var/run/docker.sock', '/run/docker.sock', '/run/user/1000/docker.sock', '/', '/etc', '/proc/1', '/sys', '/dev', '/root'])
      expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: host, Container: '/s', Mode: 'rw' }] }), host).toThrow(/refusing to mount/);
    const dir = mkdtempSync(join(tmpdir(), 'jit-sb-')); symlinkSync('/etc', join(dir, 'link'));
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: join(dir, 'link'), Container: '/s', Mode: 'ro' }] })).toThrow(/refusing to mount/);
  });
});

describe('Sandbox.Run', () => {
  it('reports a timeout as TimedOut with a null exit code', async () => {
    const fake = new Sandbox(DEFAULT_SETTINGS.Sandbox, async () => ({ ExitCode: null, TimedOut: true, Stdout: '', Stderr: '', DurationMs: 1000 }));
    const r = await fake.Run(base);
    expect(r.TimedOut).toBe(true);
    expect(r.ExitCode).toBeNull();
  });
});
