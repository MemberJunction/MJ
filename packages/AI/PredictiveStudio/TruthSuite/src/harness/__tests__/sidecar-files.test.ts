import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SuiteSidecarFiles } from '../sidecar-files';
import { TruthSuite } from '../../truth-suite';

describe('SuiteSidecarFiles', () => {
  it('keeps every run file under the TruthSuite package, whatever the working directory', () => {
    const runDir = path.join(TruthSuite.Root(), '.run');
    expect([SuiteSidecarFiles.UrlFile(), SuiteSidecarFiles.PidFile(), SuiteSidecarFiles.LogFile()]).toEqual([
      path.join(runDir, 'sidecar.url'), path.join(runDir, 'sidecar.pid'), path.join(runDir, 'sidecar.log'),
    ]);
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
