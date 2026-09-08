/**
 * @fileoverview Reading and writing `.mj-standards.json`.
 *
 * @module @memberjunction/standards
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckConfig, Severity, StandardsConfig } from './types.js';

/** The file a repo's adoption lives in, at the repository root. */
export const CONFIG_FILENAME = '.mj-standards.json';

const VALID_SEVERITIES: Severity[] = ['off', 'warn', 'error'];

/** Thrown when a config file exists but cannot be trusted. */
export class StandardsConfigError extends Error {}

/** Absolute path to a repo's config file. */
export function ConfigPath(repoRoot: string): string {
    return join(repoRoot, CONFIG_FILENAME);
}

/** Does this repo have an adoption record? */
export function HasConfig(repoRoot: string): boolean {
    return existsSync(ConfigPath(repoRoot));
}

/**
 * Load and validate a repo's config.
 *
 * Validation is strict and the errors name the fix, because the failure mode of a lenient loader
 * is a config that looks adopted and enforces nothing. A typo in a severity should stop the build,
 * not quietly disable a standard.
 */
export function LoadConfig(repoRoot: string): StandardsConfig {
    const path = ConfigPath(repoRoot);
    if (!existsSync(path)) {
        throw new StandardsConfigError(
            `No ${CONFIG_FILENAME} at ${repoRoot}. Run \`mj standards adopt\` to create one.`,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        throw new StandardsConfigError(`${CONFIG_FILENAME} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (typeof parsed !== 'object' || parsed === null) {
        throw new StandardsConfigError(`${CONFIG_FILENAME} must contain a JSON object.`);
    }
    const raw = parsed as Record<string, unknown>;

    const standardsVersion = raw['StandardsVersion'];
    if (typeof standardsVersion !== 'string' || standardsVersion.length === 0) {
        throw new StandardsConfigError(
            `${CONFIG_FILENAME} is missing "StandardsVersion". It records the MJ version this repo adopted ` +
                `standards against, and is what stops newer standards from activating themselves here.`,
        );
    }

    const checksRaw = raw['Checks'];
    if (typeof checksRaw !== 'object' || checksRaw === null) {
        throw new StandardsConfigError(`${CONFIG_FILENAME} is missing a "Checks" object.`);
    }

    const checks: Record<string, CheckConfig> = {};
    for (const [id, value] of Object.entries(checksRaw as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) {
            throw new StandardsConfigError(`${CONFIG_FILENAME}: Checks["${id}"] must be an object.`);
        }
        const entry = value as Record<string, unknown>;
        const severity = entry['Severity'];
        if (typeof severity !== 'string' || !VALID_SEVERITIES.includes(severity as Severity)) {
            throw new StandardsConfigError(
                `${CONFIG_FILENAME}: Checks["${id}"].Severity must be one of ${VALID_SEVERITIES.join(' | ')}.`,
            );
        }
        const roots = entry['Roots'];
        if (roots !== undefined && (!Array.isArray(roots) || roots.some((r) => typeof r !== 'string'))) {
            throw new StandardsConfigError(`${CONFIG_FILENAME}: Checks["${id}"].Roots must be an array of strings.`);
        }
        const options = entry['Options'];
        if (options !== undefined && (typeof options !== 'object' || options === null)) {
            throw new StandardsConfigError(`${CONFIG_FILENAME}: Checks["${id}"].Options must be an object.`);
        }
        checks[id] = {
            Severity: severity as Severity,
            ...(roots ? { Roots: roots as string[] } : {}),
            ...(options ? { Options: options as Record<string, unknown> } : {}),
        };
    }

    const rootsRaw = raw['Roots'];
    if (rootsRaw !== undefined && (!Array.isArray(rootsRaw) || rootsRaw.some((r) => typeof r !== 'string'))) {
        throw new StandardsConfigError(`${CONFIG_FILENAME}: "Roots" must be an array of strings.`);
    }

    return {
        StandardsVersion: standardsVersion,
        ...(rootsRaw ? { Roots: rootsRaw as string[] } : {}),
        Checks: checks,
    };
}

/** Write a config, formatted for humans — this file gets read and edited by hand. */
export function SaveConfig(repoRoot: string, config: StandardsConfig): void {
    const ordered: Record<string, unknown> = {
        $schema: config.$schema ?? './node_modules/@memberjunction/standards/schema/mj-standards.schema.json',
        StandardsVersion: config.StandardsVersion,
        ...(config.Roots ? { Roots: config.Roots } : {}),
        Checks: config.Checks,
    };
    writeFileSync(ConfigPath(repoRoot), `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
}
