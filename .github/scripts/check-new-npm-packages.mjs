/**
 * New-package npm gate — runs at PR time, not release time.
 *
 * WHY THIS EXISTS: a `@memberjunction/*` package cannot be published by `publish.yml`
 * until it exists on npm *and* carries a trusted-publisher (OIDC) configuration. npm
 * refuses to attach that configuration to a package that does not yet exist
 * (`npm trust` POSTs to `/-/package/<name>/trust`, which 404s), and creating it requires
 * an interactive 2FA challenge that no CI token can satisfy — bypass-2FA granular access
 * tokens were explicitly barred from changing trusted-publishing config on 2026-07-31.
 *
 * So the setup is irreducibly manual. What is NOT irreducible is *when* it happens.
 * Before this gate, `DEPLOYMENT.md` Step 5 discovered missing packages during the release,
 * putting a human 2FA prompt on the release critical path. This gate moves that discovery
 * to the pull request that introduces the package, days earlier, where it blocks one PR
 * instead of a release.
 *
 * HOW IT VERIFIES — this is the part worth understanding. Checking that a package merely
 * *exists* is weak: a hand-published placeholder with no OIDC config passes that check and
 * still fails the release. But the config itself cannot be read from CI. The endpoint is
 * `GET /-/package/<name>/trust`, and it rejects a read-only granular token with HTTP 403
 * ("You may not perform that action with these credentials" — measured 2026-08-14). The
 * only token that can read it is write-scoped across @memberjunction: exactly the
 * long-lived credential trusted publishing exists to abolish.
 *
 * The way out is to stop asking npm whether trust is configured, and instead look at
 * something only a working trust configuration could have produced. npm provenance
 * attestations are that thing. They are public, readable unauthenticated, and they name
 * the workflow that produced the publish:
 *
 *     GET /-/npm/v1/attestations/<pkg>@<version>
 *     -> predicate.buildDefinition.externalParameters.workflow
 *        { path: '.github/workflows/publish.yml',
 *          repository: 'https://github.com/MemberJunction/MJ' }
 *
 * A package can only carry that attestation if it was published *through* the trusted
 * publisher. So `seed-new-package.yml` publishes a seed version over OIDC — which succeeds
 * only when `npm trust github` has been run — and this gate verifies the resulting
 * attestation. Full verification, no secrets, nothing for a human to attest to.
 *
 * WHAT IT CHECKS: only packages *new in this PR* — publishable `@memberjunction/*` names
 * present at head but absent from the merge base. That keeps it to a couple of requests
 * rather than the ~300 `validate-npm-packages.sh` performs at publish time. This gate does
 * not replace that script; the release still verifies the whole set.
 *
 * CAVEAT: the registry is queried unauthenticated, where a *restricted* package returns 404
 * exactly like a nonexistent one. Every `@memberjunction/*` package is public, so a 404
 * here genuinely means "not created yet". If MJ ever publishes a restricted package, this
 * needs an auth token or it will report that package as missing forever.
 *
 * Usage:  node .github/scripts/check-new-npm-packages.mjs <base-ref>
 * Exit:   0 = no new packages, or every new package is fully set up
 *         1 = a new package is missing or unverified — merge blocked
 *         2 = usage error, or the check could not be completed
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Only packages in this scope are published to npm. */
export const NPM_SCOPE = '@memberjunction/';

/** The workflow that publishes MJ. Provenance must name this exact path. */
export const PUBLISH_WORKFLOW_PATH = '.github/workflows/publish.yml';

/** Bare filename, as `npm trust github --file` wants it. */
export const PUBLISH_WORKFLOW_FILE = 'publish.yml';

/** The workflow that seeds a new package over OIDC. */
export const SEED_WORKFLOW_NAME = 'Seed new package';

/** The repository provenance must name, as `owner/repo`. */
export const GITHUB_REPO = 'MemberJunction/MJ';

/** The same repository as provenance spells it. */
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

/** dist-tag applied to seed publishes, so `latest` never points at a placeholder. */
export const SEED_DIST_TAG = 'seed';

/** `npm trust` shipped in this version; earlier CLIs have no such command. */
export const MIN_NPM_VERSION = '11.15.0';

/** Where a maintainer without npm rights goes to find someone who has them. */
export const NPM_MEMBERS_URL = 'https://www.npmjs.com/settings/memberjunction/members';

/**
 * Who to tag on the PR when the author cannot do the npm setup themselves.
 *
 * Hardcoded on purpose. The authoritative list of who can perform the setup lives on npm,
 * and reading it (`npm org ls memberjunction`) requires an authenticated org member —
 * unauthenticated the endpoint returns `{}`. Resolving it at runtime would mean an npm
 * token in CI, would fail on fork PRs where secrets are unavailable, and would still yield
 * npm usernames, which are not GitHub handles and cannot be mentioned here.
 *
 * Sourced from .github/CODEOWNERS, which assigns publish.yml to this handle.
 *
 * TO REFRESH: `npm login && npm org ls memberjunction`, map to GitHub handles by hand. If
 * a GitHub team is ever created for npm publishers, use that handle so it self-maintains.
 */
export const NPM_ESCALATION_HANDLE = '@cadam11';

/** Public registry origin. */
export const REGISTRY_URL = 'https://registry.npmjs.org';

/** Guards against a runaway tree walk; the monorepo is nowhere near this. */
export const MAX_MANIFESTS = 2000;

/** A PR adding more than this many packages at once is a mistake worth stopping on. */
export const MAX_NEW_PACKAGES = 50;

/** Bounded retries for a request that neither succeeds nor 404s. */
export const NPM_MAX_RETRIES = 3;

/** Backoff between retries, in milliseconds. */
export const NPM_RETRY_DELAY_MS = 2000;

/** Verdicts a new package can receive. Order matters: each implies the previous passed. */
export const STATUS = {
    MISSING: 'missing',
    NO_PROVENANCE: 'no-provenance',
    WRONG_PROVENANCE: 'wrong-provenance',
    READY: 'ready',
};

// ---------------------------------------------------------------------------
// Pure functions — no I/O, directly unit tested.
// ---------------------------------------------------------------------------

/**
 * Parse one package.json into the two facts this gate cares about.
 * Throws on malformed JSON rather than skipping: a manifest this gate cannot read is a
 * manifest whose publishability it cannot rule on.
 */
export function parseManifest(json, path) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (err) {
        throw new Error(`Invalid JSON in ${path}: ${err.message}`);
    }
    const name = typeof parsed.name === 'string' ? parsed.name : null;
    return { path, name, isPrivate: parsed.private === true };
}

/**
 * Reduce manifests to the set of names npm would actually receive.
 * Private packages are excluded because changesets never publishes them
 * (`packages.filter(pkg => !pkg.packageJson.private)`), so requiring an npm entry for one
 * would gate on a question with no bearing on the outcome.
 */
export function publishableNames(manifests) {
    const names = new Set();
    for (const manifest of manifests) {
        if (!manifest.name || !manifest.name.startsWith(NPM_SCOPE)) {
            continue;
        }
        if (manifest.isPrivate) {
            continue;
        }
        names.add(manifest.name);
    }
    return names;
}

/**
 * Names newly publishable on this branch: present at head, absent at the merge base.
 * Flipping `private: true` to `false` counts as new, which is correct — that package has
 * never been published either.
 */
export function diffNewPackages(baseNames, headNames) {
    return [...headNames].filter((name) => !baseNames.has(name)).sort();
}

/** Keep only tracked manifests under packages/, excluding any vendored copies. */
export function selectManifestPaths(gitOutput) {
    return gitOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.endsWith('/package.json') || line === 'package.json')
        .filter((line) => !line.includes('node_modules/'));
}

/**
 * Which published version to demand provenance for.
 * Prefers the seed tag, since a package new in this PR should have nothing else. Falls
 * back to `latest` so a package seeded by some other route still verifies.
 */
export function selectVersionToVerify(packument) {
    const tags = packument?.['dist-tags'] ?? {};
    return tags[SEED_DIST_TAG] ?? tags.latest ?? null;
}

/**
 * Pull the workflow identity out of an npm attestation document.
 * npm returns several attestations per version (a publish attestation and a SLSA
 * provenance one); only the provenance carries `buildDefinition`, so the others are
 * skipped rather than treated as malformed.
 */
export function extractProvenance(attestationDoc) {
    for (const attestation of attestationDoc?.attestations ?? []) {
        const payload = attestation?.bundle?.dsseEnvelope?.payload;
        if (!payload) {
            continue;
        }
        let statement;
        try {
            statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
        } catch {
            // A single unparseable envelope must not mask a valid one alongside it.
            continue;
        }
        const workflow = statement?.predicate?.buildDefinition?.externalParameters?.workflow;
        if (workflow) {
            return { path: workflow.path ?? null, repository: workflow.repository ?? null, ref: workflow.ref ?? null };
        }
    }
    return null;
}

/**
 * Does this provenance prove MJ's own trusted publisher produced the package?
 * Both fields must match: the right workflow in the wrong repository, or the wrong
 * workflow in the right repository, is not the identity `publish.yml` will present.
 */
export function verifyProvenance(provenance) {
    if (!provenance) {
        return { ok: false, reason: 'no provenance attestation found' };
    }
    if (provenance.repository !== GITHUB_REPO_URL) {
        return { ok: false, reason: `built from ${provenance.repository ?? 'an unknown repository'}, expected ${GITHUB_REPO_URL}` };
    }
    if (provenance.path !== PUBLISH_WORKFLOW_PATH) {
        return { ok: false, reason: `built by ${provenance.path ?? 'an unknown workflow'}, expected ${PUBLISH_WORKFLOW_PATH}` };
    }
    return { ok: true, reason: 'provenance names the MJ publish workflow' };
}

/** One line per package, aligned, so a multi-package failure stays readable. */
export function formatVerdictLine({ name, status, detail }) {
    const label = {
        [STATUS.MISSING]: 'NOT ON NPM',
        [STATUS.NO_PROVENANCE]: 'NOT SEEDED',
        [STATUS.WRONG_PROVENANCE]: 'BAD PROVENANCE',
        [STATUS.READY]: 'ready',
    }[status];
    return `  ${label.padEnd(15)} ${name}${detail ? ` — ${detail}` : ''}`;
}

/**
 * The whole point of the gate: tell the PR author exactly what to do, and what to do if
 * they cannot do it. Kept pure so its wording is covered by tests.
 */
export function formatGateFailure(verdicts) {
    const blocked = verdicts.filter((v) => v.status !== STATUS.READY);
    const names = blocked.map((v) => v.name);
    const first = names[0];
    const needsCreating = blocked.filter((v) => v.status === STATUS.MISSING).map((v) => v.name);
    const createStep = (needsCreating.length ? needsCreating : names)
        .map((name) => `     npx setup-npm-trusted-publish ${name}`)
        .join('\n');
    const trustStep = names
        .map(
            (name) =>
                `     npm trust github ${name} \\\n` +
                `       --file ${PUBLISH_WORKFLOW_FILE} --repo ${GITHUB_REPO} --allow-publish -y`
        )
        .join('\n');

    return `
================================================================================
BLOCKED: ${blocked.length} new package(s) are not ready to publish
================================================================================

${blocked.map(formatVerdictLine).join('\n')}

These packages are new in this PR. Each must exist on npm AND have a trusted-publisher
(OIDC) configuration before this PR merges, or the next release fails partway through.

Creating them cannot be automated: npm will not attach a trusted-publisher config to a
package that does not exist, and creating one needs an interactive 2FA challenge no CI
token may satisfy. Doing it here, at PR time, keeps it off the release critical path.

--------------------------------------------------------------------------------
HOW TO FIX (about 5 minutes, plus one 2FA prompt)
--------------------------------------------------------------------------------

1. Upgrade your npm CLI. \`npm trust\` requires ${MIN_NPM_VERSION} or newer:

     npm install -g npm@^11.15.0
     npm --version

2. Log in. Your account needs 2FA enabled — the trust API rejects granular access
   tokens that bypass 2FA:

     npm login

3. Create the package on npm. It must exist before step 4 will work:

${createStep}

4. Attach the trusted-publisher config so ${PUBLISH_WORKFLOW_FILE} can publish it:

${trustStep}

   You get one 2FA prompt. Setting up several packages? The npm website offers a
   "skip 2FA for the next 5 minutes" option during that prompt — tick it and the rest
   run without further prompts.

5. Seed the package over OIDC. In the Actions tab, run the "${SEED_WORKFLOW_NAME}"
   workflow with the package name. It publishes a seed version using the trusted
   publisher, so it succeeds ONLY if step 4 actually worked.

6. Re-run this check. It reads the public provenance attestation the seed left behind
   and confirms it names ${GITHUB_REPO} / ${PUBLISH_WORKFLOW_PATH}.

Nothing to paste, nothing to take on trust — step 5 is the proof, and step 6 reads it.
You can check the same thing yourself at any time:

     curl -s ${REGISTRY_URL}/-/npm/v1/attestations/${first?.replace('/', '%2f')}@<version>

--------------------------------------------------------------------------------
IF YOU DO NOT HAVE NPM ACCESS
--------------------------------------------------------------------------------

Publishing rights on the @memberjunction org are deliberately narrow, so most authors
cannot run steps 1 to 4. That is expected — hand it off:

1. Comment on this PR with exactly this, so whoever picks it up needs no other context:

     ${NPM_ESCALATION_HANDLE} — new package npm setup needed before merge:
${names.map((name) => `       ${name}`).join('\n')}
     Repo ${GITHUB_REPO}, workflow ${PUBLISH_WORKFLOW_FILE}, allow-publish, no environment.
     Then run the "${SEED_WORKFLOW_NAME}" workflow for each.

2. If nobody responds within one working day, escalate to any MemberJunction npm org
   owner or admin. The current list is visible to org members via:

     npm org ls memberjunction

   or on the web at:

     ${NPM_MEMBERS_URL}

3. If a release is imminent, raise it with the build engineer running it — a missing
   package stops the publish partway through, which is far more expensive to unwind
   than a blocked PR.

Do NOT work around this by marking the package \`"private": true\` unless it genuinely
should never be published. This gate skips private packages, so that silences the error
without solving it, and the package quietly ships to nobody.

Reference: NEW_PACKAGE_SETUP.md, and DEPLOYMENT.md Step 5.
================================================================================
`.trimStart();
}

// ---------------------------------------------------------------------------
// I/O — git, the filesystem, and the npm registry.
// ---------------------------------------------------------------------------

/** Run git and return stdout. Throws with git's own stderr on failure. */
function git(args) {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Manifest paths tracked under packages/ at `ref`, or in the working tree when ref is null.
 * Uses git rather than a directory walk so ignored trees (node_modules, dist) never appear.
 */
export function listManifestPaths(ref) {
    const output = ref
        ? git(['ls-tree', '-r', '--name-only', ref, '--', 'packages'])
        : git(['ls-files', '--', 'packages']);
    const paths = selectManifestPaths(output);
    if (paths.length > MAX_MANIFESTS) {
        throw new Error(`Found ${paths.length} manifests under packages/, above the ${MAX_MANIFESTS} cap`);
    }
    return paths;
}

/** Read one manifest at `ref`, or from the working tree when ref is null. */
function readManifestAt(ref, path) {
    return ref ? git(['show', `${ref}:${path}`]) : readFileSync(path, 'utf8');
}

/** The set of publishable package names at `ref` (null = working tree). */
export function collectPublishableNames(ref) {
    const paths = listManifestPaths(ref);
    const manifests = paths.map((path) => parseManifest(readManifestAt(ref, path), path));
    return publishableNames(manifests);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET a registry document, returning `{ status, body }` where body is parsed JSON or null.
 * 200 and 404 are answers and returned immediately. Anything else is retried, then raised —
 * never downgraded to "missing", because a network blip that reads as a missing package
 * would block a PR for no reason.
 */
export async function fetchRegistryJson(url, fetchImpl = fetch, delayMs = NPM_RETRY_DELAY_MS) {
    let lastFailure = 'no attempt made';

    for (let attempt = 1; attempt <= NPM_MAX_RETRIES; attempt++) {
        let response = null;
        try {
            response = await fetchImpl(url, { headers: { accept: 'application/json' } });
        } catch (err) {
            lastFailure = `network error: ${err.message}`;
        }

        if (response && response.status === 404) {
            return { status: 404, body: null };
        }
        if (response && response.status === 200) {
            try {
                return { status: 200, body: await response.json() };
            } catch (err) {
                lastFailure = `unparseable JSON: ${err.message}`;
            }
        } else if (response) {
            lastFailure = `HTTP ${response.status}`;
        }

        if (attempt < NPM_MAX_RETRIES) {
            console.log(`   Retry ${attempt}/${NPM_MAX_RETRIES} for ${url} (${lastFailure})`);
            await sleep(delayMs);
        }
    }

    throw new Error(
        `Could not read ${url} after ${NPM_MAX_RETRIES} attempts (${lastFailure}). ` +
            `Check https://status.npmjs.org/ and re-run.`
    );
}

/** Registry path for a scoped package name. */
export function packumentUrl(name) {
    return `${REGISTRY_URL}/${name.replace('/', '%2f')}`;
}

/** Registry path for one version's attestations. */
export function attestationUrl(name, version) {
    return `${REGISTRY_URL}/-/npm/v1/attestations/${name.replace('/', '%2f')}@${version}`;
}

/**
 * Decide whether one new package is ready to be published by `publish.yml`.
 * Three questions in order, each only meaningful if the previous passed: does it exist,
 * was it published through a trusted publisher, and was that publisher ours.
 */
export async function classifyPackage(name, fetchImpl = fetch, delayMs = NPM_RETRY_DELAY_MS) {
    const packument = await fetchRegistryJson(packumentUrl(name), fetchImpl, delayMs);
    if (packument.status === 404) {
        return { name, status: STATUS.MISSING, detail: 'package does not exist on npm' };
    }

    const version = selectVersionToVerify(packument.body);
    if (!version) {
        return { name, status: STATUS.NO_PROVENANCE, detail: 'package exists but has no published version' };
    }

    const attestations = await fetchRegistryJson(attestationUrl(name, version), fetchImpl, delayMs);
    if (attestations.status === 404) {
        return { name, status: STATUS.NO_PROVENANCE, detail: `${version} has no provenance — seed workflow not run` };
    }

    const verdict = verifyProvenance(extractProvenance(attestations.body));
    return verdict.ok
        ? { name, status: STATUS.READY, detail: `${version} ${verdict.reason}` }
        : { name, status: STATUS.WRONG_PROVENANCE, detail: `${version} ${verdict.reason}` };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function main(argv) {
    const baseRef = argv[0];
    if (!baseRef) {
        console.error('Usage: node .github/scripts/check-new-npm-packages.mjs <base-ref>');
        return 2;
    }

    console.log(`Comparing publishable packages against ${baseRef}...`);
    const baseNames = collectPublishableNames(baseRef);
    const headNames = collectPublishableNames(null);
    const added = diffNewPackages(baseNames, headNames);

    if (added.length === 0) {
        console.log(`No new publishable packages in this PR (${headNames.size} total, unchanged).`);
        return 0;
    }
    if (added.length > MAX_NEW_PACKAGES) {
        console.error(`This PR adds ${added.length} packages, above the ${MAX_NEW_PACKAGES} cap. Split it.`);
        return 2;
    }

    console.log(`New publishable package(s) in this PR: ${added.length}`);
    const verdicts = [];
    for (const name of added) {
        const verdict = await classifyPackage(name);
        console.log(formatVerdictLine(verdict));
        verdicts.push(verdict);
    }

    if (verdicts.every((verdict) => verdict.status === STATUS.READY)) {
        console.log(`All ${added.length} new package(s) verified against ${GITHUB_REPO_URL}/${PUBLISH_WORKFLOW_PATH}.`);
        return 0;
    }

    console.error(formatGateFailure(verdicts));
    return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main(process.argv.slice(2))
        .then((code) => process.exit(code))
        .catch((err) => {
            console.error(`Check could not be completed: ${err.message}`);
            process.exit(2);
        });
}
