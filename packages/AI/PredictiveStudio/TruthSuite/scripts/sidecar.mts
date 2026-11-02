import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

// One thread everywhere: G0.10 compares two trainings to 1e-9, and equal results across machines need it.
for (const v of ['OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS']) process.env[v] = '1';
process.env.PYTHONHASHSEED = '0';
delete process.env.PREDICTIVE_STUDIO_SIDECAR_URL; // this process owns the sidecar

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runDir = path.join(root, '.run');
mkdirSync(runDir, { recursive: true });
const sidecar = new MLSidecar();             // interpreter: PREDICTIVE_STUDIO_PYTHON, else the Sidecar venv
await sidecar.start();
const url = `http://127.0.0.1:${sidecar.Port}`;
writeFileSync(path.join(runDir, 'sidecar.url'), url);
console.log(`truth sidecar up at ${url} (single-threaded)`);
const stop = async (): Promise<void> => { await sidecar.stop(); process.exit(0); };
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
setInterval(() => undefined, 60_000);       // keep the event loop alive
