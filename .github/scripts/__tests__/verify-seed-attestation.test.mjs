// Tests for .github/scripts/verify-seed-attestation.mjs
// Run with: npx vitest run --config .github/scripts/vitest.config.mts __tests__/verify-seed-attestation
import { describe, it, expect } from 'vitest';
import { waitForSeedAttestation, SEED_ATTESTATION_ATTEMPTS } from '../verify-seed-attestation.mjs';
import { GITHUB_REPO_URL, PUBLISH_WORKFLOW_PATH } from '../check-new-npm-packages.mjs';

/** The envelope shape npm returns: a publish attestation (no buildDefinition) beside the SLSA one. */
const attestationDoc = (workflow) => ({
    attestations: [
        { predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1', bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify({ predicate: {} })).toString('base64') } } },
        {
            predicateType: 'https://slsa.dev/provenance/v1',
            bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify({ predicate: { buildDefinition: { externalParameters: { workflow } } } })).toString('base64') } },
        },
    ],
});
const mjProvenance = attestationDoc({ path: PUBLISH_WORKFLOW_PATH, repository: GITHUB_REPO_URL, ref: 'refs/heads/next' });

/** A fetch stub that answers each call from a queue, and records how many reads happened. */
function fetchSequence(responses) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        const next = responses[Math.min(calls.length, responses.length) - 1];
        if (next instanceof Error) throw next;
        return { status: next.status, json: async () => next.body };
    };
    return { fetchImpl, calls };
}

const quiet = { delayMs: 0, log: () => undefined };

describe('waitForSeedAttestation', () => {
    it('keeps reading through the registry lag and verifies once the attestation appears', async () => {
        // The 2026-09-15 seed: published, then 404 for a moment, then the real attestation.
        const { fetchImpl, calls } = fetchSequence([{ status: 404 }, { status: 404 }, { status: 200, body: mjProvenance }]);
        const result = await waitForSeedAttestation('@memberjunction/web-search-engine', '0.0.1-seed.1', { fetchImpl, ...quiet });

        expect(result.ok).toBe(true);
        expect(result.attempt).toBe(3);
        expect(calls).toHaveLength(3);
        expect(result.provenance.path).toBe(PUBLISH_WORKFLOW_PATH);
        expect(calls[0]).toContain('/-/npm/v1/attestations/@memberjunction%2fweb-search-engine@0.0.1-seed.1');
    });

    it('gives up after the configured attempts when the attestation never appears, and says so', async () => {
        const { fetchImpl, calls } = fetchSequence([{ status: 404 }]);
        const result = await waitForSeedAttestation('@memberjunction/x', '0.0.1-seed.1', { fetchImpl, attempts: 4, ...quiet });

        expect(result.ok).toBe(false);
        expect(result.provenance).toBeNull();
        expect(result.reason).toBe('no public attestation after 4 attempts');
        expect(calls).toHaveLength(4);
    });

    it('rejects an attestation that names another workflow — the same verdict the PR gate would give', async () => {
        const { fetchImpl } = fetchSequence([{ status: 200, body: attestationDoc({ path: '.github/workflows/other.yml', repository: GITHUB_REPO_URL }) }]);
        const result = await waitForSeedAttestation('@memberjunction/x', '0.0.1-seed.1', { fetchImpl, ...quiet });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('.github/workflows/other.yml');
        expect(result.attempt).toBe(1);
    });

    it('rejects a document with only the publish attestation, no provenance', async () => {
        const { fetchImpl } = fetchSequence([{ status: 200, body: { attestations: [mjProvenance.attestations[0]] } }]);
        const result = await waitForSeedAttestation('@memberjunction/x', '0.0.1-seed.1', { fetchImpl, ...quiet });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('no provenance attestation found');
    });

    it('treats a registry error as an error, not as a missing attestation', async () => {
        // fetchRegistryJson retries a 503 briefly and then throws; the seed must surface that
        // rather than report "no attestation" and send the operator to npm trust settings.
        const { fetchImpl } = fetchSequence([{ status: 503 }]);
        await expect(waitForSeedAttestation('@memberjunction/x', '0.0.1-seed.1', { fetchImpl, attempts: 2, ...quiet })).rejects.toThrow(/Could not read .*HTTP 503/);
    });

    it('defaults to a three-minute window', () => {
        expect(SEED_ATTESTATION_ATTEMPTS * 10).toBe(180);
    });
});
