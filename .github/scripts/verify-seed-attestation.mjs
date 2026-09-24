#!/usr/bin/env node
/**
 * Waits for the public npm attestation of a freshly seeded package, then checks that it
 * names MJ's own publish workflow — the same check the new-package PR gate will make.
 *
 * WHY THIS EXISTS: `publish.yml`'s seed job publishes over OIDC with `--provenance`, and npm
 * confirms the provenance statement in the publish output. The attestation endpoint,
 * however, is not immediately consistent with the publish: on 2026-09-15 the seed of
 * @memberjunction/web-search-engine read it 0.66 s after `npm publish` returned and got
 * HTTP 404, failed the job, and told the operator to re-check `npm trust list` — while the
 * attestation appeared a moment later and the PR gate passed on re-run. A single read is
 * the wrong instrument for an eventually consistent endpoint; this waits.
 *
 * The verification itself is not re-implemented here. It calls the gate's own
 * `extractProvenance` / `verifyProvenance`, so the seed job and the PR gate agree by
 * construction on what a valid seed looks like.
 *
 * Usage (from the seed job):
 *   node .github/scripts/verify-seed-attestation.mjs @memberjunction/x 0.0.1-seed.1
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    attestationUrl,
    extractProvenance,
    fetchRegistryJson,
    verifyProvenance,
    PUBLISH_WORKFLOW_PATH,
} from './check-new-npm-packages.mjs';

/** How many times to read the attestation endpoint before giving up. */
export const SEED_ATTESTATION_ATTEMPTS = 18;
/** Pause between reads, in milliseconds — three minutes in total at the default attempts. */
export const SEED_ATTESTATION_DELAY_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls the attestation endpoint until it answers 200, then verifies the provenance.
 *
 * A 404 is "not visible yet" and is retried on the seed's own schedule. So is a 200 whose
 * document carries npm's publish attestation but no SLSA provenance yet: npm uploads both
 * together, but if the registry ever exposed them at different moments a single read would
 * fail the seed a moment before it verified — the exact false failure this script replaces.
 * Anything else — 5xx, network errors, unparseable JSON — is handled inside
 * `fetchRegistryJson`, which retries briefly and then throws, because a registry outage
 * should read as an outage and not as a missing attestation.
 *
 * @returns `{ ok, reason, provenance, attempt, url }` — `ok` is the gate's verdict; `attempt`
 * is how many reads it took, so the job log says how long the registry lagged.
 */
export async function waitForSeedAttestation(
    name,
    version,
    { fetchImpl = fetch, attempts = SEED_ATTESTATION_ATTEMPTS, delayMs = SEED_ATTESTATION_DELAY_MS, log = console.log } = {},
) {
    const url = attestationUrl(name, version);
    let notYet = 'HTTP 404';
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const { status, body } = await fetchRegistryJson(url, fetchImpl, delayMs);
        if (status === 200) {
            const provenance = extractProvenance(body);
            if (provenance) {
                const verdict = verifyProvenance(provenance);
                return { ok: verdict.ok, reason: verdict.reason, provenance, attempt, url };
            }
            notYet = 'HTTP 200 without a provenance attestation';
        } else {
            notYet = 'HTTP 404';
        }
        if (attempt < attempts) {
            log(`attestation for ${name}@${version} not visible yet (${notYet}) — attempt ${attempt}/${attempts}, waiting ${delayMs / 1000}s`);
            await sleep(delayMs);
        }
    }
    return {
        ok: false,
        reason: `no provenance attestation after ${attempts} attempts (last read: ${notYet})`,
        provenance: null,
        attempt: attempts,
        url,
    };
}

async function main() {
    const [name, version] = process.argv.slice(2);
    if (!name || !version) {
        console.error('::error::usage: verify-seed-attestation.mjs <package> <version>');
        process.exit(2);
    }
    const result = await waitForSeedAttestation(name, version);
    if (result.provenance) {
        console.log(`workflow path : ${result.provenance.path}`);
        console.log(`workflow repo : ${result.provenance.repository}`);
    }
    if (!result.ok) {
        if (!result.provenance) {
            console.error(
                `::error::${name}@${version} is published, but no public attestation appeared at ${result.url} after ` +
                    `${result.attempt} reads. The seed itself is done — do not re-seed. Check the endpoint by hand; if it is ` +
                    `still empty, confirm 'npm trust list ${name}' names ${PUBLISH_WORKFLOW_PATH} and that the publish output ` +
                    `above says "Signed provenance statement". If it has appeared, re-run the PR's new-package gate.`,
            );
        } else {
            console.error(`::error::${name}@${version} has an attestation, but it is ${result.reason} — the new-package gate would reject this seed.`);
        }
        process.exit(1);
    }
    console.log(`attestation verified on read ${result.attempt}: ${result.reason}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(`::error::${err.message}`);
        process.exit(1);
    });
}
