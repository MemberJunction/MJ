import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SuiteSidecarFiles } from '../sidecar-files';
import { TruthSuite } from '../../truth-suite';

describe('SuiteSidecarFiles', () => {
  it('keeps every run file under the TruthSuite package, whatever the working directory, when PS_SIDECAR_RUN_DIR is unset or blank', () => {
    const runDir = path.join(TruthSuite.Root(), '.run');
    for (const env of [{}, { PS_SIDECAR_RUN_DIR: '  ' }]) {
      expect(SuiteSidecarFiles.RunDir(env)).toBe(runDir);
      expect([SuiteSidecarFiles.UrlFile(env), SuiteSidecarFiles.PidFile(env), SuiteSidecarFiles.LogFile(env)]).toEqual([
        path.join(runDir, 'sidecar.url'), path.join(runDir, 'sidecar.pid'), path.join(runDir, 'sidecar.log'),
      ]);
    }
  });

  it('puts every run file in PS_SIDECAR_RUN_DIR when it is set, creating the directory when missing', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ps-sidecar-run-'));
    const runDir = path.join(root, 'nested', 'sidecar-run');
    try {
      const env = { PS_SIDECAR_RUN_DIR: runDir };
      expect(SuiteSidecarFiles.RunDir(env)).toBe(runDir);
      expect(existsSync(runDir)).toBe(true);
      expect([SuiteSidecarFiles.UrlFile(env), SuiteSidecarFiles.PidFile(env), SuiteSidecarFiles.LogFile(env)]).toEqual([
        path.join(runDir, 'sidecar.url'), path.join(runDir, 'sidecar.pid'), path.join(runDir, 'sidecar.log'),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a PS_SIDECAR_RUN_DIR that is not an absolute path, naming it', () => {
    expect(() => SuiteSidecarFiles.RunDir({ PS_SIDECAR_RUN_DIR: 'relative/run' })).toThrow('PS_SIDECAR_RUN_DIR="relative/run" is not an absolute path');
  });

  it('asks for an ephemeral port when TRUTH_SIDECAR_PORT is unset or blank, and for the named port otherwise', () => {
    expect(SuiteSidecarFiles.RequestedPort({})).toBe(0);
    expect(SuiteSidecarFiles.RequestedPort({ TRUTH_SIDECAR_PORT: '  ' })).toBe(0);
    expect(SuiteSidecarFiles.RequestedPort({ TRUTH_SIDECAR_PORT: '61968' })).toBe(61968);
  });

  it('refuses a TRUTH_SIDECAR_PORT that is not an integer from 0 to 65535, naming it', () => {
    expect(() => SuiteSidecarFiles.RequestedPort({ TRUTH_SIDECAR_PORT: 'abc' })).toThrow('TRUTH_SIDECAR_PORT="abc" is not an integer from 0 to 65535');
    expect(() => SuiteSidecarFiles.RequestedPort({ TRUTH_SIDECAR_PORT: '70000' })).toThrow('"70000"');
    expect(() => SuiteSidecarFiles.RequestedPort({ TRUTH_SIDECAR_PORT: '1.5' })).toThrow('"1.5"');
  });
});
