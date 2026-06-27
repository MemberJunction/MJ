#!/usr/bin/env node
/**
 * Target-profile loader.
 *
 * Reads a `*.target.json` file (host-side), validates the shape, resolves any
 * `env:VARNAME` references against the host's environment, and emits the
 * resolved env-var mapping in one of two formats:
 *
 *   --format=env   (default) — shell `export FOO='bar'` lines. Source via
 *                              `eval "$(node load-target-profile.cjs t.json)"`.
 *   --format=json            — JSON object. Used by `mj test regression remote`
 *                              to build the child-process env without parsing.
 *
 * On validation failure, prints a human-readable error to stderr and exits 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SUPPORTED_KINDS = new Set(['mj-explorer', 'generic-web', 'mj-api-only']);

function fatal(msg) {
    process.stderr.write(`✗ load-target-profile: ${msg}\n`);
    process.exit(1);
}

function shellEscape(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveEnvRef(value, contextLabel) {
    if (typeof value !== 'string' || !value.startsWith('env:')) {
        return value;
    }
    const envName = value.slice('env:'.length).trim();
    if (!envName) {
        fatal(`${contextLabel}: empty env: reference`);
    }
    const resolved = process.env[envName];
    if (resolved === undefined || resolved === '') {
        fatal(
            `${contextLabel}: env var ${envName} is not set on the host. ` +
                `Export it before invoking 'mj test regression remote'.`
        );
    }
    return resolved;
}

function parseArgs(argv) {
    const out = { profilePath: null, format: 'env' };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--format' || a === '-f') {
            out.format = argv[++i];
        } else if (a.startsWith('--format=')) {
            out.format = a.split('=')[1];
        } else if (!out.profilePath) {
            out.profilePath = a;
        }
    }
    if (!out.profilePath) {
        fatal('usage: load-target-profile.cjs [--format=env|json] <path-to-target.json>');
    }
    if (out.format !== 'env' && out.format !== 'json') {
        fatal(`unknown --format ${out.format} (expected env|json)`);
    }
    return out;
}

function setIfPresent(out, name, value) {
    if (value === undefined || value === null) return;
    out[name] = String(value);
}

function main() {
    const { profilePath, format } = parseArgs(process.argv);

    const absPath = path.resolve(profilePath);
    if (!fs.existsSync(absPath)) {
        fatal(`target profile not found: ${absPath}`);
    }

    let profile;
    try {
        profile = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    } catch (err) {
        fatal(`failed to parse JSON (${absPath}): ${err.message}`);
    }

    if (!profile.name || typeof profile.name !== 'string') {
        fatal('"name" is required (string)');
    }
    if (!profile.kind || !SUPPORTED_KINDS.has(profile.kind)) {
        fatal(`"kind" must be one of: ${[...SUPPORTED_KINDS].join(', ')}`);
    }
    if (!profile.baseUrl || typeof profile.baseUrl !== 'string') {
        fatal('"baseUrl" is required (string)');
    }

    const out = {};

    setIfPresent(out, 'MJ_TEST_VAR_baseUrl', profile.baseUrl);
    if (Array.isArray(profile.allowedDomains)) {
        setIfPresent(out, 'MJ_TEST_VAR_allowedDomains', JSON.stringify(profile.allowedDomains));
    }

    if (profile.auth && typeof profile.auth === 'object') {
        const auth = profile.auth;
        if (auth.username !== undefined) {
            setIfPresent(out, 'MJ_TEST_VAR_authUsername', resolveEnvRef(auth.username, 'auth.username'));
        }
        if (auth.password !== undefined) {
            setIfPresent(out, 'MJ_TEST_VAR_authPassword', resolveEnvRef(auth.password, 'auth.password'));
        }
        if (Array.isArray(auth.domains)) {
            setIfPresent(out, 'MJ_TEST_VAR_authDomains', JSON.stringify(auth.domains));
        }
    }

    if (profile.suite) setIfPresent(out, 'TEST_SUITE_NAME', profile.suite);

    if (Array.isArray(profile.extraMetadataDirs) && profile.extraMetadataDirs.length > 0) {
        setIfPresent(out, 'EXTRA_METADATA_DIRS', profile.extraMetadataDirs.join(','));
    }

    if (profile.archive && typeof profile.archive === 'object') {
        const a = profile.archive;
        if (a.tag) setIfPresent(out, 'ARCHIVE_TAG', a.tag);
        if (a.source) setIfPresent(out, 'ARCHIVE_SOURCE', a.source);
    }

    // Optional: path (inside the container) to a custom-oracle module that
    // `mj test suite --oracles-module=…` will load before the suite runs.
    if (profile.oraclesModule) {
        setIfPresent(out, 'ORACLES_MODULE', profile.oraclesModule);
    }

    setIfPresent(out, 'TEST_RUNNER_MODE', 'remote');
    setIfPresent(out, 'TEST_RUNNER_ENTRYPOINT', 'test-runner-remote-entrypoint.sh');
    setIfPresent(out, 'TARGET_PROFILE_NAME', profile.name);
    setIfPresent(out, 'TARGET_PROFILE_KIND', profile.kind);

    if (format === 'json') {
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } else {
        for (const [name, value] of Object.entries(out)) {
            process.stdout.write(`export ${name}=${shellEscape(value)}\n`);
        }
    }
}

main();
