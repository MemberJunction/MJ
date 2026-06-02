/**
 * Credential broker — the OUT-OF-SANDBOX half of the deterministic credential channel.
 *
 * Topology (deterministic, not trust-based):
 *   - The AGENT (Claude) runs inside a sandbox (e.g. the workbench `claude-dev` container:
 *     no docker socket, no secret mounted, no sudo). It can only WRITE job files and READ
 *     result files in a shared mailbox. It has no path to the secret — by topology.
 *   - THIS broker runs OUTSIDE that sandbox (on the host, or a sibling runner container)
 *     and is the ONLY process that holds the secrets (in its own env). It watches the
 *     mailbox, runs the requested plan through the credential-safe runner (which scrubs
 *     every secret value from all output), and writes a redacted result back.
 *
 * SAFETY — read-only by default: a live test against a client's REAL credentials must never
 * mutate or delete their external data. Any plan that writes (Create/Update/Delete /
 * bidirectional push) is REFUSED unless the job explicitly sets allowWrite:true — which
 * should only happen after the read/pull path is validated and the client has authorized
 * mutation testing. The broker reports a detailed result either way.
 *
 * Launch (you, outside the sandbox, with the secret from the root-owned file):
 *   sudo bash -c 'set -a; . /etc/mj-hubspot.env; set +a; \
 *     MJ_CRED_MAILBOX=/abs/path/to/mailbox \
 *     exec node packages/Integration/connectors/test/credential-broker.mjs'
 *
 * Agent side (inside the sandbox) submits a job by writing JSON to <mailbox>/jobs/<id>.json:
 *   { "jobId": "hs-1", "task": "hubspot-tier1" }            // read-only → runs
 *   { "jobId": "hs-2", "task": "hubspot-write", "allowWrite": true }  // writes → only with the flag
 * …then polls <mailbox>/results/<id>.json.
 */
import { runCredentialSafe } from './credential-safe-runner.mjs';
import { PLANS } from './plans.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const MAILBOX = process.env.MJ_CRED_MAILBOX || join(process.cwd(), '.cred-mailbox');
const JOBS = join(MAILBOX, 'jobs');
const RESULTS = join(MAILBOX, 'results');
const DONE = join(JOBS, 'done');

async function handle(job) {
    const plan = PLANS[job.task];
    if (!plan) {
        return { ok: false, error: `Unknown task '${job.task}'. Known: ${Object.keys(PLANS).join(', ')}` };
    }
    if (plan.writes && job.allowWrite !== true) {
        return {
            ok: false,
            refused: true,
            reason: 'write-not-authorized',
            error: `Task '${job.task}' WRITES to the external system (bidirectional / CRUD). Refused: live credentialed tests are READ-ONLY by default to protect client data. Re-submit with "allowWrite": true ONLY after the read/pull path is validated and the client has authorized mutation testing.`,
        };
    }
    const secrets = job.secretEnvNames ?? plan.secrets; // job may override the env-var names per deployment
    return runCredentialSafe({ secrets, run: plan.run });
}

async function processOnce() {
    let files;
    try { files = await fs.readdir(JOBS); } catch { return; }
    for (const f of files) {
        if (!f.endsWith('.json')) continue;
        let job;
        try { job = JSON.parse(await fs.readFile(join(JOBS, f), 'utf8')); } catch { continue; }
        const result = await handle(job);
        const id = job.jobId ?? f.replace(/\.json$/, '');
        await fs.mkdir(RESULTS, { recursive: true });
        await fs.writeFile(
            join(RESULTS, `${id}.json`),
            JSON.stringify({ jobId: id, task: job.task, allowWrite: job.allowWrite === true, completedAt: new Date().toISOString(), result }, null, 2),
        );
        await fs.mkdir(DONE, { recursive: true });
        await fs.rename(join(JOBS, f), join(DONE, f));
        const status = result.ok ? 'ok' : (result.refused ? 'REFUSED(write-not-authorized)' : 'FAIL');
        console.log(`[broker] ${id} (${job.task}) → ${status}`);
    }
}

async function main() {
    await fs.mkdir(JOBS, { recursive: true });
    await fs.mkdir(RESULTS, { recursive: true });
    console.log(`[broker] mailbox=${MAILBOX}`);
    console.log('[broker] READ-ONLY by default; write/bidirectional plans require allowWrite:true. Secrets stay in this process; results are scrubbed.');
    if (process.argv.includes('--once')) { await processOnce(); return; }
    // eslint-disable-next-line no-constant-condition
    for (;;) {
        await processOnce();
        await new Promise(r => setTimeout(r, 1500));
    }
}

main().catch(e => { console.error('[broker] fatal:', e instanceof Error ? e.message : String(e)); process.exit(1); });
