import { describe, it, expect } from 'vitest';
import { PythonProbe } from '../../scripts/python-probe.mjs';
import type { ProbeResult } from '../../scripts/python-probe.mjs';

/** A probe that answers from a table instead of spawning interpreters. */
function fakeProbe(table: Record<string, string>): (command: string) => ProbeResult {
  return (command: string): ProbeResult => {
    const out = table[command];
    return out === undefined
      ? { Command: command, Found: false, Version: null }
      : { Command: command, Found: true, Version: PythonProbe.ParseVersion(out) };
  };
}

const CANDIDATES = ['python3.11', 'python3.12', 'python3', 'python'];

describe('PythonProbe', () => {
  it('parses `python --version` output', () => {
    expect(PythonProbe.ParseVersion('Python 3.11.15')).toEqual({ Major: 3, Minor: 11, Patch: 15 });
    expect(PythonProbe.ParseVersion('Python 3.14.4\n')).toEqual({ Major: 3, Minor: 14, Patch: 4 });
    expect(PythonProbe.ParseVersion('not python')).toBeNull();
  });

  it('accepts only CPython 3.11 and 3.12', () => {
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 11, Patch: 0 })).toBe(true);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 12, Patch: 11 })).toBe(true);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 10, Patch: 9 })).toBe(false);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 13, Patch: 0 })).toBe(false);
    expect(PythonProbe.IsSupported({ Major: 3, Minor: 14, Patch: 4 })).toBe(false);
    expect(PythonProbe.IsSupported({ Major: 2, Minor: 11, Patch: 0 })).toBe(false);
    expect(PythonProbe.IsSupported(null)).toBe(false);
  });

  it('skips a default python3 of 3.14 and picks python3.12', () => {
    const r = PythonProbe.Select(CANDIDATES, fakeProbe({ 'python3.12': 'Python 3.12.11', python3: 'Python 3.14.4' }));
    expect(r.Ok).toBe(true);
    if (r.Ok) {
      expect(r.Command).toBe('python3.12');
      expect(r.Version.Minor).toBe(12);
    }
  });

  it('prefers python3.11 when both are present', () => {
    const r = PythonProbe.Select(CANDIDATES, fakeProbe({ 'python3.11': 'Python 3.11.15', 'python3.12': 'Python 3.12.11' }));
    expect(r.Ok && r.Command).toBe('python3.11');
  });

  it('fails with a report naming every probed interpreter when none is supported', () => {
    const r = PythonProbe.Select(CANDIDATES, fakeProbe({ python3: 'Python 3.14.4' }));
    expect(r.Ok).toBe(false);
    const report = PythonProbe.FormatReport(r.Probed);
    expect(report).toContain('python3.11: not found');
    expect(report).toContain('python3: 3.14.4');
    expect(report).toContain('--python');
  });
});
