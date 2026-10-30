import { join } from 'node:path';

/**
 * Environment variable that relocates the run-artifact tree.
 *
 * Why it has to exist: the default root is resolved against `process.cwd()`, and on a
 * symlink-swap deploy the working directory IS the release directory. A deploy points the symlink
 * at a fresh release and prunes the old ones, so every run artifact under the previous release is
 * first orphaned and then deleted — measured live 2026-09-13, where a connector refresh's 652-event
 * journal existed one minute before a deploy and the run listing returned `0 run(s)` immediately
 * after. The artifacts survive the RSU's own pm2 restart (the symlink does not move) but not a
 * deploy, which is exactly backwards from what an operator needs.
 *
 * Point this at a path OUTSIDE the swappable release directory (a sibling of `current`, alongside
 * the environment file a deploy already treats as durable) and the run history outlives the deploy
 * that would otherwise destroy the evidence.
 */
export const RUN_ARTIFACT_ROOT_ENV_VAR = 'MJ_INTEGRATION_RUN_ARTIFACT_ROOT';

/**
 * The root directory for run artifacts: {@link RUN_ARTIFACT_ROOT_ENV_VAR} when set, otherwise
 * today's `<cwd>/logs/integration-runs`.
 *
 * Read on EVERY call rather than captured at module load. The emitter that writes a run and the
 * reader that resumes or lists it are constructed at different moments in the process's life — and
 * in the RSU's case, in different processes — so a value frozen at import time is a way for one
 * half to read a different directory than the other half wrote. (Contrast `MJ_INTEGRATION_MAX_RUN_DIRS`,
 * which is a number and genuinely can be read once.)
 */
export function DefaultRunArtifactRoot(): string {
    const configured = process.env[RUN_ARTIFACT_ROOT_ENV_VAR];
    const trimmed = configured?.trim();
    if (trimmed) return trimmed;
    return join(process.cwd(), 'logs', 'integration-runs');
}
