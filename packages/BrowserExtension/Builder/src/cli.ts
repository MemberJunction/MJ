#!/usr/bin/env node
/**
 * @fileoverview `mj-ext-build` CLI for building White-Label Branded MemberJunction Browser Extensions.
 *
 * Usage:
 * ```bash
 * mj-ext-build --brand packages/BrowserExtension/Brands/mj-copilot/mj-extension-brand.json --out dist/extensions
 * ```
 */

import * as path from 'node:path';
import { ExtensionBrandBuilder } from './ExtensionBrandBuilder.js';

/**
 * Parsed CLI arguments for `mj-ext-build`.
 */
export interface MjExtBuildCliArgs {
    BrandJsonPaths: string[];
    OutputDir: string;
    NoZip: boolean;
}

/**
 * Parse command-line arguments passed to `mj-ext-build`.
 */
export function ParseMjExtBuildArgs(argv: string[]): MjExtBuildCliArgs {
    const brandPaths: string[] = [];
    let outputDir = path.resolve(process.cwd(), 'dist/extensions');
    let noZip = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ((arg === '--brand' || arg === '-b') && argv[i + 1]) {
            brandPaths.push(argv[++i]);
        } else if ((arg === '--out' || arg === '-o') && argv[i + 1]) {
            outputDir = argv[++i];
        } else if (arg === '--no-zip') {
            noZip = true;
        }
    }

    return {
        BrandJsonPaths: brandPaths,
        OutputDir: outputDir,
        NoZip: noZip,
    };
}

/**
 * Execute `mj-ext-build` for one or more `mj-extension-brand.json` files.
 */
export function RunMjExtBuildCli(argv: string[]): {
    ExitCode: number;
    BuiltSlugs: string[];
    ErrorMessage?: string;
} {
    const parsed = ParseMjExtBuildArgs(argv);
    if (parsed.BrandJsonPaths.length === 0) {
        return {
            ExitCode: 1,
            BuiltSlugs: [],
            ErrorMessage: 'Usage: mj-ext-build --brand <path-to-mj-extension-brand.json> [--out <dir>] [--no-zip]',
        };
    }

    const builder = new ExtensionBrandBuilder();
    const builtSlugs: string[] = [];

    try {
        for (const brandPath of parsed.BrandJsonPaths) {
            const res = builder.BuildBrandedExtension({
                BrandSource: brandPath,
                OutputRootDir: parsed.OutputDir,
                CreateZipArchive: !parsed.NoZip,
            });
            builtSlugs.push(res.BrandProfile.BrandSlug);
        }
        return {
            ExitCode: 0,
            BuiltSlugs: builtSlugs,
        };
    } catch (err) {
        return {
            ExitCode: 1,
            BuiltSlugs: builtSlugs,
            ErrorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}

// Run when invoked directly as a CLI binary
const isMainModule =
    typeof process !== 'undefined' &&
    Array.isArray(process.argv) &&
    process.argv[1] &&
    (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('mj-ext-build'));

if (isMainModule) {
    const outcome = RunMjExtBuildCli(process.argv.slice(2));
    if (outcome.ExitCode !== 0) {
        console.error(outcome.ErrorMessage);
        process.exit(outcome.ExitCode);
    }
}
