import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Sandbox } from '../sandbox/Sandbox';
import { DEFAULT_SETTINGS } from '../settings';

const sb = new Sandbox(DEFAULT_SETTINGS.Sandbox);
const base = { Mounts: [{ Host: '/h/base', Container: '/work', Mode: 'ro' as const }], WorkDir: '/work', Command: ['sh', '-c', 'true'], TimeoutMs: 1000 };

describe('Sandbox.BuildArgs', () => {
  it('always passes the hardening flags', () => {
    const a = sb.BuildArgs(base).join(' ');
    for (const flag of ['--network none', '--cap-drop ALL', '--security-opt no-new-privileges', '--pids-limit 1024', '--memory 6g', '--cpus 3', '--rm', '--user ', '--name jit-']) expect(a).toContain(flag);
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
  it('resolves .. segments before the deny-list check', () => {
    const host = `/tmp/jit-missing-${randomBytes(6).toString('hex')}/../../etc`;
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: host, Container: '/s', Mode: 'ro' }] })).toThrow(/refusing to mount/);
  });
  it('rejects a mount that contains a denied folder, and accepts a plain work folder', () => {
    for (const host of ['/var', dirname(homedir()), homedir(), join(homedir(), '.docker')])
      expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: host, Container: '/s', Mode: 'ro' }] }), host).toThrow(/refusing to mount/);
    const ok = mkdtempSync(join(tmpdir(), 'jit-ok-'));
    expect(sb.BuildArgs({ ...base, Mounts: [{ Host: ok, Container: '/s', Mode: 'ro' }] })).toContain('-v');
  });
  it.runIf(process.platform === 'darwin')('rejects a denied folder spelled in another case on a case-insensitive disk', () => {
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: join(homedir(), '.DOCKER'), Container: '/s', Mode: 'ro' }] })).toThrow(/refusing to mount/);
  });
  it("rejects Docker Desktop's container folder", () => {
    const host = join(homedir(), 'Library', 'Containers', 'com.docker.docker');
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: host, Container: '/s', Mode: 'ro' }] })).toThrow(/refusing to mount/);
  });
  it('mounts the realpath of a symlinked host folder', () => {
    const target = mkdtempSync(join(tmpdir(), 'jit-target-'));
    const link = join(mkdtempSync(join(tmpdir(), 'jit-link-')), 'link');
    symlinkSync(target, link);
    const a = sb.BuildArgs({ ...base, Mounts: [{ Host: link, Container: '/s', Mode: 'ro' }] });
    expect(a).toContain(`${realpathSync.native(target)}:/s:ro`);
    expect(a).not.toContain(`${link}:/s:ro`);
  });
  it('rejects a host or container path with a colon or a comma', () => {
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: '/h/a:b', Container: '/s', Mode: 'ro' }] })).toThrow(/refusing to mount/);
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: '/h/a', Container: '/s,ro', Mode: 'ro' }] })).toThrow(/refusing to mount/);
  });
  it('rejects a symlink whose realpath contains a colon', () => {
    const t = mkdtempSync(join(tmpdir(), 'jit-colon-'));
    mkdirSync(join(t, 'a:b'));
    symlinkSync(join(t, 'a:b'), join(t, 'plain'));
    expect(() => sb.BuildArgs({ ...base, Mounts: [{ Host: join(t, 'plain'), Container: '/s', Mode: 'ro' }] })).toThrow(/refusing to mount/);
  });
});

describe('Sandbox.Run', () => {
  it('reports a timeout as TimedOut with a null exit code', async () => {
    const fake = new Sandbox(DEFAULT_SETTINGS.Sandbox, async () => ({ ExitCode: null, TimedOut: true, Stdout: '', Stderr: '', DurationMs: 1000 }));
    const r = await fake.Run(base);
    expect(r.TimedOut).toBe(true);
    expect(r.ExitCode).toBeNull();
  });
  it('names the container and removes it by that name after a timeout', async () => {
    const calls: { file: string; args: string[] }[] = [];
    const fake = new Sandbox(DEFAULT_SETTINGS.Sandbox, async (file, args) => {
      calls.push({ file, args });
      return { ExitCode: null, TimedOut: args[0] === 'run', Stdout: '', Stderr: '', DurationMs: 1000 };
    });
    const r = await fake.Run(base);
    expect(r.TimedOut).toBe(true);
    const name = calls[0].args[calls[0].args.indexOf('--name') + 1];
    expect(name).toMatch(/^jit-[0-9a-f]{12}$/);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ file: 'docker', args: ['rm', '-f', name] });
  });
});
