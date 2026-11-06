import { describe, it, expect } from 'vitest';
import { MLSidecar } from '../ml-sidecar.js';

describe('MLSidecar.ResolvePython', () => {
  it('prefers the explicit pythonPath option', () => {
    expect(MLSidecar.ResolvePython('/opt/py/bin/python', { [MLSidecar.PythonEnvVar]: '/env/python' }, '/venv/bin/python'))
      .toBe('/opt/py/bin/python');
  });
  it('then PREDICTIVE_STUDIO_PYTHON (trimmed)', () => {
    expect(MLSidecar.ResolvePython(undefined, { PREDICTIVE_STUDIO_PYTHON: '  /env/python ' }, '/venv/bin/python')).toBe('/env/python');
  });
  it('then the bundled venv', () => {
    expect(MLSidecar.ResolvePython(undefined, {}, '/venv/bin/python')).toBe('/venv/bin/python');
  });
  it('then python3, ignoring a blank env value and a blank explicit option', () => {
    expect(MLSidecar.ResolvePython('  ', { PREDICTIVE_STUDIO_PYTHON: '   ' }, null)).toBe('python3');
  });
});
