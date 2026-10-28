/**
 * The one runner of Python-side gate measurements. `Run` runs sidecar pytest node ids with the sidecar's own runner
 * (`Sidecar/scripts/run-pytest.mjs`: cwd `src/python`, libomp on macOS) in the TruthSuite venv, with `truthsuite` on
 * PYTHONPATH, TRUTH_DATA_DIR, PYTHONHASHSEED=0 and one BLAS/OpenMP/numexpr thread, writes a JUnit report and reads the
 * report, never the exit code. A requested node with no case in the report is NotCollected, so a renamed node fails its
 * gate; a missing report throws.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TruthSuite } from '@memberjunction/predictive-studio-truth-suite';

/** What one run measured, in cases (a parametrized node contributes one case per parameter set). */
export interface PytestRunResult {
  /** Cases the report holds for the requested nodes. */
  Collected: number;
  /** Of those, the cases that passed. */
  Passed: number;
  /** Of those, the cases that failed an assertion. */
  Failed: number;
  /** Every erroring case in the report: the requested nodes' errors and collection errors alike. */
  Errors: number;
  /** Requested node ids with no case in the report. */
  NotCollected: readonly string[];
}

type CaseResult = 'passed' | 'failed' | 'skipped' | 'error';
interface JUnitCase { readonly NodeId: string; readonly Result: CaseResult }

const TESTCASE = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;

/** Runs gate pytest nodes and reads their JUnit report. */
export class PsGatePytest {
  private static unescape(s: string): string {
    return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  private static attr(attrs: string, name: string): string {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
    return m ? PsGatePytest.unescape(m[1]) : '';
  }

  /**
   * pytest's `--junitxml` report → one case per distinct node id (the first `<testcase>` for it wins, so a case the
   * report repeats counts once); node id = classname with `/` + `.py::` + name.
   */
  private static parseCases(xml: string): JUnitCase[] {
    const out: JUnitCase[] = [];
    const seen = new Set<string>();
    for (const m of xml.matchAll(TESTCASE)) {
      const classname = PsGatePytest.attr(m[1], 'classname');
      const name = PsGatePytest.attr(m[1], 'name');
      const child = /<(failure|error|skipped)\b/.exec(m[2] || '');
      const result: CaseResult = child === null ? 'passed' : child[1] === 'failure' ? 'failed' : child[1] === 'error' ? 'error' : 'skipped';
      const nodeId = classname === '' ? name : `${classname.replace(/\./g, '/')}.py::${name}`;
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      out.push({ NodeId: nodeId, Result: result });
    }
    return out;
  }

  /** The pure half of `Run`: count a report's cases against the requested node ids (a node owns its `<id>[…]` cases). */
  public static FromJUnit(nodeIds: readonly string[], xml: string): PytestRunResult {
    const cases = PsGatePytest.parseCases(xml);
    const owns = (id: string, c: JUnitCase): boolean => c.NodeId === id || c.NodeId.startsWith(`${id}[`);
    const owned = cases.filter((c) => nodeIds.some((id) => owns(id, c)));
    return {
      Collected: owned.length,
      Passed: owned.filter((c) => c.Result === 'passed').length,
      Failed: owned.filter((c) => c.Result === 'failed').length,
      Errors: cases.filter((c) => c.Result === 'error').length,             // owned errors and collection errors alike
      NotCollected: nodeIds.filter((id) => !cases.some((c) => owns(id, c))),
    };
  }

  /**
   * The TruthSuite interpreter: `PREDICTIVE_STUDIO_TRUTH_PYTHON`, else the TruthSuite venv. `PREDICTIVE_STUDIO_PYTHON`
   * is never read here: to the product it names the sidecar's own interpreter, which carries no truth-suite packages.
   */
  private static truthPython(): string {
    const fromEnv = process.env.PREDICTIVE_STUDIO_TRUTH_PYTHON?.trim();
    const python = fromEnv || path.join(TruthSuite.Root(), '.venv', 'bin', 'python');
    if (!existsSync(python)) throw new Error(`TruthSuite interpreter ${python} is missing: run \`pnpm run setup:python\` in TruthSuite`);
    return python;
  }

  /** The child's environment: the caller's, with the TruthSuite interpreter, the truth data and one thread per pool. */
  private static childEnv(truthPython: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PREDICTIVE_STUDIO_PYTHON: truthPython,   // the sidecar's runner runs whichever interpreter this names
      PYTHONPATH: [path.join(TruthSuite.Root(), 'python'), process.env.PYTHONPATH].filter((p): p is string => !!p).join(path.delimiter),
      TRUTH_DATA_DIR: process.env.TRUTH_DATA_DIR || path.join(TruthSuite.Root(), '.data'),
      // Single-threaded and a fixed hash seed: repeated trainings must give predictions equal within 1e-9.
      PYTHONHASHSEED: '0', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1',
    };
  }

  /** Run sidecar pytest node ids (paths relative to `Sidecar/src/python`) and count their JUnit cases. */
  public static async Run(nodeIds: readonly string[]): Promise<PytestRunResult> {
    if (nodeIds.length === 0) throw new Error('PsGatePytest.Run needs at least one node id');
    const sidecarDir = path.resolve(TruthSuite.Root(), '..', 'Sidecar');
    const env = PsGatePytest.childEnv(PsGatePytest.truthPython());
    const dir = mkdtempSync(path.join(tmpdir(), 'ps-gate-pytest-'));
    const report = path.join(dir, 'junit.xml');
    try {
      const child = spawn('node', ['scripts/run-pytest.mjs', '--', '-p', 'no:cacheprovider', '-q', '-o', 'junit_family=xunit2', '--junitxml', report, ...nodeIds], {
        cwd: sidecarDir, env, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (b: Buffer) => { output += b.toString('utf8'); });
      child.stderr.on('data', (b: Buffer) => { output += b.toString('utf8'); });
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => resolve(code ?? -1));   // `??`: exit code 0 is a real code; only a signal exit (null) is -1
      });
      if (!existsSync(report)) {
        throw new Error(`pytest wrote no JUnit report (exit ${exitCode}): ${output.trim().split('\n').slice(-3).join(' | ')}`);
      }
      return PsGatePytest.FromJUnit(nodeIds, readFileSync(report, 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
