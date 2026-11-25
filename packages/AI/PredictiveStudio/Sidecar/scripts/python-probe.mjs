/**
 * python-probe.mjs — choose a Python interpreter the sidecar's pinned requirements install on.
 *
 * The pins set the window: numpy==1.26.4 has no wheels for CPython >= 3.13, and scipy==1.17.1 needs >= 3.11.
 * So only 3.11 and 3.12 are accepted. Pure functions plus one spawn-based probe, so the logic is unit-tested.
 */
import { spawnSync } from 'node:child_process';

/** Interpreter probing for the sidecar's pinned requirements. Static members only: the class is the logic's owner. */
export class PythonProbe {
  static SupportedMinors = Object.freeze([11, 12]);
  static DefaultCandidates = Object.freeze(['python3.11', 'python3.12', 'python3', 'python']);

  /** `{ Major, Minor, Patch }` from `python --version` output; null when the text is not a CPython version line. */
  static ParseVersion(text) {
    const match = /Python (\d+)\.(\d+)\.(\d+)/.exec(text || '');
    return match ? { Major: Number(match[1]), Minor: Number(match[2]), Patch: Number(match[3]) } : null;
  }

  /** True only for CPython 3.11 / 3.12 (the window the pins install on). */
  static IsSupported(version) {
    return version !== null && version.Major === 3 && PythonProbe.SupportedMinors.includes(version.Minor);
  }

  /** Runs `<command> --version`; a spawn error or a non-zero exit means "not found". */
  static ProbeCommand(command) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      return { Command: command, Found: false, Version: null };
    }
    return { Command: command, Found: true, Version: PythonProbe.ParseVersion(`${result.stdout || ''}${result.stderr || ''}`) };
  }

  /** The first candidate that is found and supported, with everything probed (for the failure report). */
  static Select(candidates, probe = PythonProbe.ProbeCommand) {
    const probed = candidates.map((candidate) => probe(candidate));
    const chosen = probed.find((p) => p.Found && PythonProbe.IsSupported(p.Version));
    return chosen
      ? { Ok: true, Command: chosen.Command, Version: chosen.Version, Probed: probed }
      : { Ok: false, Probed: probed };
  }

  /** The multi-line failure message: every probed interpreter and how to fix it. */
  static FormatReport(probed) {
    return [
      `No supported Python found. The Predictive Studio sidecar pins need CPython 3.${PythonProbe.SupportedMinors.join(' or 3.')}.`,
      'Probed:',
      ...probed.map((p) => `  ${p.Command}: ${PythonProbe.#describeProbe(p)}`),
      'Install one (macOS: brew install python@3.11; Debian/Ubuntu: apt-get install python3.11 python3.11-venv),',
      'or name an interpreter explicitly: node scripts/setup-python.mjs --python /path/to/python3.11',
    ].join('\n');
  }

  /** `Major.Minor.Patch` text for a parsed version. */
  static FormatVersion(v) {
    return `${v.Major}.${v.Minor}.${v.Patch}`;
  }

  static #describeProbe(p) {
    if (!p.Found) return 'not found';
    if (!p.Version) return 'unrecognised --version output';
    return PythonProbe.FormatVersion(p.Version);
  }
}
