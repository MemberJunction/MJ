/**
 * Generic credential-safe plan runner — launch ONE named plan from PLANS by argv, the same
 * credential-safe way as the broker, for a direct `sudo` launch.
 *
 *   sudo bash -c 'set -a; . /etc/mj-hubspot.env; . /etc/mj-livetest.env; set +a; \
 *     exec node packages/Integration/connectors/test/run-plan.mjs <plan-name> [--allow-write]'
 *
 * Enforces the SAME write-gate as the broker: a writes:true plan REFUSES to run without
 * --allow-write (or ALLOW_WRITE=1), so the forward/read path is validated before any mutation.
 * Prints only the token-scrubbed JSON result (the runner scrubs every secret value).
 */
import { runCredentialSafe } from './credential-safe-runner.mjs';
import { PLANS } from './plans.mjs';

const planName = process.argv[2];
const allowWrite = process.argv.includes('--allow-write') || process.env.ALLOW_WRITE === '1';

const plan = PLANS[planName];
if (!plan) {
    console.error(`Unknown plan '${planName}'. Known: ${Object.keys(PLANS).join(', ')}`);
    process.exit(2);
}
if (plan.writes && !allowWrite) {
    console.error(
        `REFUSED: plan '${planName}' performs writes (writes:true). Re-run with --allow-write only ` +
        `AFTER the read/pull path is validated and mutation testing is authorized.`
    );
    process.exit(3);
}

const result = await runCredentialSafe({ secrets: plan.secrets, run: plan.run });
// Single-line JSON on STDOUT (the runner routed all logs to STDERR) so a parent process can capture
// a clean result as the last stdout line.
process.stdout.write(JSON.stringify(result) + '\n');
process.exit(result.ok ? 0 : 1);
