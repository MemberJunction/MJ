import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMAIN_PROFILES } from '../lib/domain-profiles.js';

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const COMMANDS_ROOT = path.join(PACKAGE_ROOT, 'src', 'commands');
const README_PATH = path.join(PACKAGE_ROOT, 'README.md');

interface DiscoveredCommand {
    /** Relative path under `src/commands/` using POSIX separators. */
    RelativePath: string;
    /** Top-level domain (first path segment or root filename without `.ts`). */
    Domain: string;
    /** Space-separated command ID without the leading `mj ` prefix (e.g. `harness account list`). */
    CommandId: string;
    /** True when the command declares `static hidden = true`. */
    Hidden: boolean;
    /** True for per-domain `<domain>/usage.ts` files (top-level `usage.ts` is false). */
    IsDomainUsage: boolean;
}

function walkCommandFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkCommandFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            results.push(fullPath);
        }
    }
    return results.sort();
}

function discoverCommands(): DiscoveredCommand[] {
    const files = walkCommandFiles(COMMANDS_ROOT);
    return files.map((filePath) => {
        const relPosix = path.relative(COMMANDS_ROOT, filePath).split(path.sep).join('/');
        const source = fs.readFileSync(filePath, 'utf8');
        const withoutExt = relPosix.replace(/\.ts$/, '');
        const normalized = withoutExt.replace(/\/index$/, '');
        const segments = normalized.split('/');
        const domain = segments[0];
        const commandId = segments.join(' ');
        const isDomainUsage = relPosix !== 'usage.ts' && path.posix.basename(relPosix) === 'usage.ts';
        const hidden = /^\s*static\s+(?:override\s+)?hidden\s*=\s*true\b/m.test(source);
        return {
            RelativePath: relPosix,
            Domain: domain,
            CommandId: commandId,
            Hidden: hidden,
            IsDomainUsage: isDomainUsage,
        };
    });
}

function discoverDomainDirectories(): string[] {
    return fs
        .readdirSync(COMMANDS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCommandDocumented(readme: string, commandId: string): boolean {
    const escaped = escapeRegExp(commandId);
    // Match `mj <commandId>` bounded so e.g. `mj test` does not falsely satisfy `mj test run`,
    // while allowing headings (`### mj test`), backticks (`` `mj test` ``), flags (`mj test --help`),
    // or standalone invocations (`mj test\n`).
    const pattern = new RegExp(`(?<![A-Za-z0-9_-])mj ${escaped}(?![A-Za-z0-9_-])`);
    return pattern.test(readme);
}

describe('MJCLI documentation & usage coverage guard', () => {
    const allCommands = discoverCommands();
    const visibleCommands = allCommands.filter((cmd) => !cmd.Hidden && !cmd.IsDomainUsage);
    const domainDirs = discoverDomainDirectories();
    const allDomains = [...new Set(visibleCommands.map((cmd) => cmd.Domain))].sort();
    const readme = fs.readFileSync(README_PATH, 'utf8');

    it('discovers the full CLI command surface', () => {
        expect(allDomains.length).toBeGreaterThanOrEqual(29);
        expect(visibleCommands.length).toBeGreaterThanOrEqual(100);
    });

    it('documents every top-level command domain with a dedicated section heading in packages/MJCLI/README.md', () => {
        const missingHeadings: string[] = [];
        for (const domain of allDomains) {
            const headingPattern = new RegExp(`^###\\s+mj ${escapeRegExp(domain)}\\s*$`, 'm');
            if (!headingPattern.test(readme)) {
                missingHeadings.push(
                    `CLI domain 'mj ${domain}' is missing a '### mj ${domain}' section in packages/MJCLI/README.md — please add a domain section with usage and examples.`,
                );
            }
        }
        expect(missingHeadings, missingHeadings.join('\n')).toEqual([]);
    });

    it('documents every visible CLI command in packages/MJCLI/README.md', () => {
        const missingCommands: string[] = [];
        for (const cmd of visibleCommands) {
            if (!isCommandDocumented(readme, cmd.CommandId)) {
                missingCommands.push(
                    `CLI command 'mj ${cmd.CommandId}' is not documented in packages/MJCLI/README.md — please document its usage and examples.`,
                );
            }
        }
        expect(missingCommands, missingCommands.join('\n')).toEqual([]);
    });

    it('declares a DomainProfile in src/lib/domain-profiles.ts for every top-level command domain', () => {
        const missingProfiles = allDomains
            .filter((domain) => !(domain in DOMAIN_PROFILES))
            .map(
                (domain) =>
                    `CLI domain '${domain}' is missing from DOMAIN_PROFILES in packages/MJCLI/src/lib/domain-profiles.ts — add a Summary and Runtime hint so \`mj usage\` describes it cleanly.`,
            );
        expect(missingProfiles, missingProfiles.join('\n')).toEqual([]);
    });

    it('provides a tier-2 `mj <domain> usage` command for every command domain directory', () => {
        const missingUsage = domainDirs
            .filter((domain) => !fs.existsSync(path.join(COMMANDS_ROOT, domain, 'usage.ts')))
            .map(
                (domain) =>
                    `CLI domain '${domain}' is missing packages/MJCLI/src/commands/${domain}/usage.ts — add a DomainUsageCommand subclass so \`mj ${domain} usage\` works.`,
            );
        expect(missingUsage, missingUsage.join('\n')).toEqual([]);
    });
});
