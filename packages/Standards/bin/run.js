#!/usr/bin/env node
/**
 * `mj-standards` — the standards runner, without the MJ CLI.
 *
 * Client and external repos should not have to install the whole MemberJunction CLI to run four
 * checks in CI. This binary is the same code the `mj standards` commands call, exposed directly:
 *
 *   npx mj-standards check
 *   npx mj-standards adopt --ci github --declare-compliant
 *   npx mj-standards list
 *
 * Argument handling is deliberately minimal — anyone who wants rich flags can install the CLI.
 */
import { LoadConfig, HasConfig, RunStandards, FormatSummary, ExitCodeFor, Adopt, STANDARD_CHECKS, IsNewerThan } from '../dist/index.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const command = argv[0] ?? 'check';
const repoRoot = process.cwd();
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 ? argv[i + 1] : undefined;
};

const ownVersion = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
).version;

function usage() {
    console.log(`mj-standards <check|adopt|list> [options]

  check                       run the standards this repo has adopted
    --strict                  treat warnings as errors
    --quiet                   summary line only

  adopt                       write .mj-standards.json and optional scaffolding
    --ci github               also write a GitHub Actions workflow
    --declare-compliant       declare mjUILayer on packages that already pass
    --upgrade                 enable standards newer than the repo's recorded version
    --dry-run                 report, write nothing

  list                        every standard, and this repo's stance on each`);
}

if (flag('help') || command === 'help') {
    usage();
    process.exit(0);
}

if (command === 'check') {
    if (!HasConfig(repoRoot)) {
        console.error('No .mj-standards.json here. Run `npx mj-standards adopt` first.');
        process.exit(2);
    }
    const config = LoadConfig(repoRoot);
    const summary = await RunStandards(repoRoot, config);
    if (!flag('quiet')) console.log(FormatSummary(summary, config));
    const failed = ExitCodeFor(summary) !== 0 || (flag('strict') && summary.WarningCount > 0);
    process.exit(failed ? 1 : 0);
} else if (command === 'adopt') {
    const result = Adopt({
        RepoRoot: repoRoot,
        Version: value('version') ?? ownVersion,
        Upgrade: flag('upgrade'),
        DryRun: flag('dry-run'),
        Ci: value('ci') === 'github' ? 'github' : 'none',
        AddNpmScript: !flag('no-npm-script'),
        DeclareCompliant: flag('declare-compliant'),
    });
    const icon = { created: '+', updated: '~', skipped: '·' };
    for (const a of result.Actions) console.log(`${icon[a.Kind]} ${a.What}${a.Detail ? ` — ${a.Detail}` : ''}`);
    console.log(flag('dry-run') ? '\nDry run — nothing was written.' : `\nAdopted at StandardsVersion ${result.Config.StandardsVersion}.`);
} else if (command === 'list') {
    const config = HasConfig(repoRoot) ? LoadConfig(repoRoot) : null;
    for (const check of STANDARD_CHECKS) {
        const entry = config?.Checks[check.Id];
        const stance = !config
            ? 'not adopted'
            : entry
              ? entry.Severity
              : IsNewerThan(check.Since, config.StandardsVersion)
                ? `available (added in ${check.Since}, after this repo adopted)`
                : 'available, not adopted';
        console.log(`${check.Id}  [${stance}]  since ${check.Since}\n    ${check.Title}\n`);
    }
} else {
    usage();
    process.exit(2);
}
