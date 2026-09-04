// Tests for .github/scripts/check-new-npm-packages.mjs
// Run with: npx vitest run --config .github/scripts/vitest.config.mts
import { describe, it, expect } from 'vitest';
import {
    parseManifest,
    publishableNames,
    diffNewPackages,
    selectManifestPaths,
    selectVersionToVerify,
    extractProvenance,
    verifyProvenance,
    classifyPackage,
    fetchRegistryJson,
    formatGateFailure,
    packumentUrl,
    attestationUrl,
    STATUS,
    NPM_MAX_RETRIES,
    GITHUB_REPO,
    GITHUB_REPO_URL,
    PUBLISH_WORKFLOW_FILE,
    PUBLISH_WORKFLOW_PATH,
    SEED_WORKFLOW_NAME,
    SEED_DISPATCH_INPUT,
    NPM_MEMBERS_URL,
    NPM_ESCALATION_HANDLE,
} from '../check-new-npm-packages.mjs';

// --- fixtures ---------------------------------------------------------------

/** Wrap a workflow identity in the envelope shape npm actually returns. */
const attestationDoc = (workflow) => ({
    attestations: [
        // npm returns a publish attestation alongside provenance; it has no buildDefinition
        // and must be skipped rather than treated as malformed.
        { predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1', bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify({ predicate: {} })).toString('base64') } } },
        {
            predicateType: 'https://slsa.dev/provenance/v1',
            bundle: {
                dsseEnvelope: {
                    payload: Buffer.from(
                        JSON.stringify({ predicate: { buildDefinition: { externalParameters: { workflow } } } })
                    ).toString('base64'),
                },
            },
        },
    ],
});

const GOOD_WORKFLOW = { path: PUBLISH_WORKFLOW_PATH, repository: GITHUB_REPO_URL, ref: 'refs/heads/main' };

/** A fetch double driven by a url -> {status, body} map. Unlisted urls 404. */
const fakeFetch = (routes) => async (url) => {
    const hit = routes[url];
    if (!hit) {
        return { status: 404, json: async () => ({}) };
    }
    return { status: hit.status, json: async () => hit.body };
};

// --- tests ------------------------------------------------------------------

describe('parseManifest', () => {
    it('extracts name and private flag', () => {
        expect(parseManifest('{"name":"@memberjunction/core","private":true}', 'a/package.json')).toEqual({
            path: 'a/package.json',
            name: '@memberjunction/core',
            isPrivate: true,
        });
    });

    it('treats a missing private field as publishable', () => {
        expect(parseManifest('{"name":"@memberjunction/core"}', 'p').isPrivate).toBe(false);
    });

    it('treats the string "true" as NOT private — only a real boolean counts', () => {
        // npm itself only honors the boolean, so mirroring it keeps the gate and the
        // publisher agreeing on which packages ship.
        expect(parseManifest('{"name":"@memberjunction/x","private":"true"}', 'p').isPrivate).toBe(false);
    });

    it('throws on malformed JSON, naming the file', () => {
        expect(() => parseManifest('{ not json', 'packages/Bad/package.json')).toThrow(/packages\/Bad\/package\.json/);
    });
});

describe('publishableNames', () => {
    it('keeps only public @memberjunction packages', () => {
        const manifests = [
            { path: 'a', name: '@memberjunction/core', isPrivate: false },
            { path: 'b', name: '@memberjunction/secret', isPrivate: true },
            { path: 'c', name: '@other/thing', isPrivate: false },
            { path: 'd', name: null, isPrivate: false },
        ];
        expect([...publishableNames(manifests)]).toEqual(['@memberjunction/core']);
    });
});

describe('diffNewPackages', () => {
    it('returns names present at head but not at base, sorted', () => {
        const base = new Set(['@memberjunction/core']);
        const head = new Set(['@memberjunction/core', '@memberjunction/zeta', '@memberjunction/alpha']);
        expect(diffNewPackages(base, head)).toEqual(['@memberjunction/alpha', '@memberjunction/zeta']);
    });

    it('ignores packages removed at head', () => {
        expect(diffNewPackages(new Set(['@memberjunction/a', '@memberjunction/gone']), new Set(['@memberjunction/a']))).toEqual([]);
    });

    it('treats a package flipped from private to public as new', () => {
        expect(diffNewPackages(new Set(), new Set(['@memberjunction/newly-public']))).toEqual(['@memberjunction/newly-public']);
    });
});

describe('selectManifestPaths', () => {
    it('keeps package.json paths and drops everything else', () => {
        expect(selectManifestPaths('packages/Core/package.json\npackages/Core/src/index.ts')).toEqual([
            'packages/Core/package.json',
        ]);
    });

    it('drops vendored manifests under node_modules', () => {
        expect(selectManifestPaths('packages/A/package.json\npackages/A/node_modules/dep/package.json')).toEqual([
            'packages/A/package.json',
        ]);
    });

    it('does not match a file merely ending in package.json', () => {
        expect(selectManifestPaths('packages/A/not-package.json')).toEqual([]);
    });
});

describe('selectVersionToVerify', () => {
    it('prefers the seed tag', () => {
        expect(selectVersionToVerify({ 'dist-tags': { seed: '0.0.1-seed.1', latest: '1.2.3' } })).toBe('0.0.1-seed.1');
    });

    it('falls back to latest when there is no seed tag', () => {
        expect(selectVersionToVerify({ 'dist-tags': { latest: '1.2.3' } })).toBe('1.2.3');
    });

    it('returns null when the package has no versions at all', () => {
        expect(selectVersionToVerify({})).toBeNull();
        expect(selectVersionToVerify(null)).toBeNull();
    });
});

describe('extractProvenance', () => {
    it('pulls workflow identity out of the SLSA envelope', () => {
        expect(extractProvenance(attestationDoc(GOOD_WORKFLOW))).toEqual(GOOD_WORKFLOW);
    });

    it('returns null when no attestation carries a buildDefinition', () => {
        expect(extractProvenance({ attestations: [] })).toBeNull();
        expect(extractProvenance(null)).toBeNull();
    });

    it('skips an unparseable envelope rather than losing a valid one beside it', () => {
        const doc = attestationDoc(GOOD_WORKFLOW);
        doc.attestations.unshift({ bundle: { dsseEnvelope: { payload: 'not-base64-json!!' } } });
        expect(extractProvenance(doc)).toEqual(GOOD_WORKFLOW);
    });
});

describe('verifyProvenance', () => {
    it('accepts the MJ publish workflow', () => {
        expect(verifyProvenance(GOOD_WORKFLOW).ok).toBe(true);
    });

    it('rejects the right workflow in the wrong repository', () => {
        // An attacker-controlled fork running a file at the same path is not our publisher.
        const verdict = verifyProvenance({ ...GOOD_WORKFLOW, repository: 'https://github.com/evil/MJ' });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toContain('evil/MJ');
    });

    it('rejects the wrong workflow in the right repository', () => {
        const verdict = verifyProvenance({ ...GOOD_WORKFLOW, path: '.github/workflows/something-else.yml' });
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toContain('something-else.yml');
    });

    it('rejects missing provenance', () => {
        expect(verifyProvenance(null).ok).toBe(false);
    });
});

describe('fetchRegistryJson', () => {
    it('returns 404 without retrying — it is an answer, not a failure', async () => {
        let calls = 0;
        const counting = async () => {
            calls += 1;
            return { status: 404, json: async () => ({}) };
        };
        await expect(fetchRegistryJson('u', counting, 0)).resolves.toEqual({ status: 404, body: null });
        expect(calls).toBe(1);
    });

    it('retries a server error and succeeds when it clears', async () => {
        let calls = 0;
        const flaky = async () => {
            calls += 1;
            return calls < 3 ? { status: 503, json: async () => ({}) } : { status: 200, json: async () => ({ ok: 1 }) };
        };
        await expect(fetchRegistryJson('u', flaky, 0)).resolves.toEqual({ status: 200, body: { ok: 1 } });
        expect(calls).toBe(3);
    });

    it('throws rather than reporting missing when the registry never answers', async () => {
        // A network blip must never read as "package does not exist" — that would block a
        // PR whose package is perfectly fine.
        let calls = 0;
        const broken = async () => {
            calls += 1;
            throw new Error('ECONNRESET');
        };
        await expect(fetchRegistryJson('u', broken, 0)).rejects.toThrow(/ECONNRESET/);
        expect(calls).toBe(NPM_MAX_RETRIES);
    });
});

describe('classifyPackage', () => {
    const name = '@memberjunction/alpha';
    const pkgUrl = packumentUrl(name);
    const attUrl = (v) => attestationUrl(name, v);

    it('reports MISSING when the package does not exist', async () => {
        const verdict = await classifyPackage(name, fakeFetch({}), 0);
        expect(verdict.status).toBe(STATUS.MISSING);
    });

    it('reports NO_PROVENANCE when the package exists but was never seeded', async () => {
        const routes = { [pkgUrl]: { status: 200, body: { 'dist-tags': { latest: '0.0.0' } } } };
        const verdict = await classifyPackage(name, fakeFetch(routes), 0);
        expect(verdict.status).toBe(STATUS.NO_PROVENANCE);
        expect(verdict.detail).toContain('seed workflow not run');
    });

    it('reports NO_PROVENANCE when the package exists with no published version', async () => {
        const routes = { [pkgUrl]: { status: 200, body: {} } };
        const verdict = await classifyPackage(name, fakeFetch(routes), 0);
        expect(verdict.status).toBe(STATUS.NO_PROVENANCE);
        expect(verdict.detail).toContain('no published version');
    });

    it('reports WRONG_PROVENANCE when another repository built it', async () => {
        const routes = {
            [pkgUrl]: { status: 200, body: { 'dist-tags': { seed: '0.0.1-seed.1' } } },
            [attUrl('0.0.1-seed.1')]: { status: 200, body: attestationDoc({ ...GOOD_WORKFLOW, repository: 'https://github.com/evil/MJ' }) },
        };
        const verdict = await classifyPackage(name, fakeFetch(routes), 0);
        expect(verdict.status).toBe(STATUS.WRONG_PROVENANCE);
    });

    it('reports READY when the seed carries MJ provenance', async () => {
        const routes = {
            [pkgUrl]: { status: 200, body: { 'dist-tags': { seed: '0.0.1-seed.1' } } },
            [attUrl('0.0.1-seed.1')]: { status: 200, body: attestationDoc(GOOD_WORKFLOW) },
        };
        const verdict = await classifyPackage(name, fakeFetch(routes), 0);
        expect(verdict.status).toBe(STATUS.READY);
        expect(verdict.detail).toContain('0.0.1-seed.1');
    });

    it('verifies the seed tag in preference to latest', async () => {
        // A package that already has a real release must still be judged on its seed, so a
        // provenance-less latest cannot mask a missing trust config.
        const routes = {
            [pkgUrl]: { status: 200, body: { 'dist-tags': { seed: '0.0.1-seed.1', latest: '9.9.9' } } },
            [attUrl('0.0.1-seed.1')]: { status: 200, body: attestationDoc(GOOD_WORKFLOW) },
        };
        await expect(classifyPackage(name, fakeFetch(routes), 0)).resolves.toMatchObject({ status: STATUS.READY });
    });
});

describe('formatGateFailure', () => {
    const message = formatGateFailure([
        { name: '@memberjunction/alpha', status: STATUS.MISSING, detail: 'package does not exist on npm' },
        { name: '@memberjunction/beta', status: STATUS.NO_PROVENANCE, detail: '0.0.0 has no provenance — seed workflow not run' },
        { name: '@memberjunction/ready', status: STATUS.READY, detail: 'fine' },
    ]);

    it('lists only the blocked packages, not the ready ones', () => {
        expect(message).toContain('@memberjunction/alpha');
        expect(message).toContain('@memberjunction/beta');
        expect(message).not.toContain('@memberjunction/ready');
        expect(message).toContain('2 new package(s) are not ready');
    });

    it('distinguishes a missing package from an unseeded one', () => {
        expect(message).toContain('NOT ON NPM');
        expect(message).toContain('NOT SEEDED');
    });

    it('offers to create only the packages that do not exist', () => {
        expect(message).toContain('npx setup-npm-trusted-publish @memberjunction/alpha');
        expect(message).not.toContain('npx setup-npm-trusted-publish @memberjunction/beta');
    });

    it('gives a runnable npm trust command per blocked package', () => {
        expect(message).toContain('npm trust github @memberjunction/alpha');
        expect(message).toContain('npm trust github @memberjunction/beta');
        expect(message).toContain(`--repo ${GITHUB_REPO}`);
        expect(message).toContain(`--file ${PUBLISH_WORKFLOW_FILE}`);
    });

    it('orders the steps so trust is configured before seeding', () => {
        // Seeding before `npm trust github` cannot work — the publish would be rejected.
        expect(message.indexOf('npm trust github')).toBeLessThan(message.indexOf(SEED_WORKFLOW_NAME));
    });

    it('names the seed workflow as the proof step', () => {
        expect(message).toContain(SEED_WORKFLOW_NAME);
        expect(message).toContain(SEED_DISPATCH_INPUT);
        expect(message).toContain('succeeds ONLY if step 4 actually worked');
    });

    it('seeds through the publish workflow, the only file the trusted publisher matches', () => {
        // npm matches the workflow filename exactly; verifyProvenance requires publish.yml.
        // A seed from any other workflow could satisfy neither, so the message must not
        // send authors to one.
        expect(SEED_WORKFLOW_NAME).toBe('Build and publish new package versions');
        expect(message).not.toContain('seed-new-package');
    });

    it('no longer asks a human to paste anything', () => {
        // The attestation check replaced the human attestation; if this string comes back,
        // the message and the verification have drifted apart.
        expect(message).not.toContain('PASTE THE OUTPUT');
    });

    it('includes an escalation path for authors without npm access', () => {
        expect(message).toContain('IF YOU DO NOT HAVE NPM ACCESS');
        expect(message).toContain(NPM_MEMBERS_URL);
        expect(message).toContain(NPM_ESCALATION_HANDLE);
        expect(message).toContain('one working day');
    });

    it('tags a real GitHub handle, not an invented team', () => {
        // The @memberjunction org has exactly one GitHub team (bc-labs), so a plausible
        // -sounding team handle here would silently notify nobody.
        expect(message).not.toContain('npm-admins');
    });

    it('warns against silencing the gate with private: true', () => {
        expect(message).toContain('"private": true');
    });
});
