import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { SuiteSidecarFiles } from '../src/harness/sidecar-files';
import { TruthSuite } from '../src/truth-suite';

// One thread everywhere: G0.10 compares two trainings to 1e-9, and equal results across machines need it.
for (const v of ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS']) process.env[v] = '1';
process.env.PYTHONHASHSEED = '0';
delete process.env.PREDICTIVE_STUDIO_SIDECAR_URL; // this process owns the sidecar

mkdirSync(SuiteSidecarFiles.RunDir(), { recursive: true });
// The sidecar stamps every trained model's CodeVersion.psGitSha from PS_GIT_SHA, and 'unrecorded' when it is unset
// (Sidecar/src/python/app/code_version.py). The truth sidecar always runs from a checkout, so it records that checkout's
// HEAD unless the caller set one; a failing `git` fails the start rather than recording 'unrecorded'. It asks from the
// package, not the run directory, which PS_SIDECAR_RUN_DIR can place outside the checkout.
process.env.PS_GIT_SHA = process.env.PS_GIT_SHA?.trim() || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: TruthSuite.Root(), encoding: 'utf8' }).trim();
// TRUTH_SIDECAR_PORT pins the port, so HarnessSidecar.Restart brings the sidecar back on the URL MJAPI already holds.
const sidecar = new MLSidecar({ port: SuiteSidecarFiles.RequestedPort(process.env) }); // interpreter: PREDICTIVE_STUDIO_PYTHON, else the Sidecar venv
await sidecar.Start();
const url = `http://127.0.0.1:${sidecar.Port}`;
writeFileSync(SuiteSidecarFiles.PidFile(), String(process.pid));
writeFileSync(SuiteSidecarFiles.UrlFile(), url);
console.log(`truth sidecar up at ${url} (single-threaded, pid ${process.pid}, PS_GIT_SHA ${process.env.PS_GIT_SHA})`);
const stop = async (): Promise<void> => { await sidecar.Stop(); process.exit(0); };
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
setInterval(() => undefined, 60_000);       // keep the event loop alive
