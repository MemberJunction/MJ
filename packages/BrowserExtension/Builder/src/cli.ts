#!/usr/bin/env node
/**
 * @fileoverview `mj-ext-build` CLI for building White-Label Branded MemberJunction Browser Extensions
 * from either `mj-sync` metadata rows (`--metadata-dir metadata --app-name "Data Explorer"`)
 * or brand profile JSON files (`--brand path/to/mj-extension-brand.json`), across
 * `--browser <chrome|edge|firefox|safari|all>`.
 */

import * as path from 'node:path';
import type { BrowserTarget } from '@memberjunction/browser-extension-core';
import { ExtensionBrandBuilder } from './ExtensionBrandBuilder.js';

/**
 * Parsed CLI arguments for `mj-ext-build`.
 */
export interface MjExtBuildCliArgs {
    BrandJsonPaths: string[];
    MetadataDir: string | null;
    ApplicationName?: string;
    BrandSlug?: string;
    TargetBrowsers: BrowserTarget[];
    OutputDir: string;
    NoZip: boolean;
}

const ALL_BROWSER_TARGETS: BrowserTarget[] = ['chrome', 'edge', 'firefox', 'safari'];

/**
 * Parse command-line arguments passed to `mj-ext-build`.
 */
export function ParseMjExtBuildArgs(argv: string[]): MjExtBuildCliArgs {
    const brandPaths: string[] = [];
    let metadataDir: string | null = null;
    let applicationName: string | undefined;
    let brandSlug: string | undefined;
    let targetBrowsers: BrowserTarget[] = ['chrome'];
    let outputDir = path.resolve(process.cwd(), 'dist/extensions');
    let noZip = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ((arg === '--brand' || arg === '-b') && argv[i + 1]) {
            brandPaths.push(argv[++i]);
        } else if ((arg === '--metadata-dir' || arg === '-m') && argv[i + 1]) {
            metadataDir = argv[++i];
        } else if ((arg === '--app-name' || arg === '-a') && argv[i + 1]) {
            applicationName = argv[++i];
        } else if (arg === '--brand-slug' && argv[i + 1]) {
            brandSlug = argv[++i];
        } else if (arg === '--browser' && argv[i + 1]) {
            const rawBrowser = argv[++i].toLowerCase();
            if (rawBrowser === 'all') {
                targetBrowsers = [...ALL_BROWSER_TARGETS];
            } else {
                const split = rawBrowser
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s): s is BrowserTarget =>
                        ALL_BROWSER_TARGETS.includes(s as BrowserTarget)
                    );
                if (split.length > 0) {
                    targetBrowsers = split;
                }
            }
        } else if ((arg === '--out' || arg === '-o') && argv[i + 1]) {
            outputDir = argv[++i];
        } else if (arg === '--no-zip') {
            noZip = true;
        }
    }

    return {
        BrandJsonPaths: brandPaths,
        MetadataDir: metadataDir,
        ApplicationName: applicationName,
        BrandSlug: brandSlug,
        TargetBrowsers: targetBrowsers,
        OutputDir: outputDir,
        NoZip: noZip,
    };
}

/**
 * Execute `mj-ext-build` from `--metadata-dir` (`MJ: Brand Kits` + `MJ: Applications.AgentSettings.BrowserExtension`)
 * or `--brand` JSON files across one or more target browsers.
 */
export function RunMjExtBuildCli(argv: string[]): {
    ExitCode: number;
    BuiltSlugs: string[];
    BuiltBrowsers: BrowserTarget[];
    ErrorMessage?: string;
} {
    const parsed = ParseMjExtBuildArgs(argv);
    if (parsed.BrandJsonPaths.length === 0 && !parsed.MetadataDir) {
        return {
            ExitCode: 1,
            BuiltSlugs: [],
            BuiltBrowsers: [],
            ErrorMessage:
                'Usage: mj-ext-build (--metadata-dir <dir> [--app-name <name>] | --brand <path>) [--browser chrome|edge|firefox|safari|all] [--out <dir>] [--no-zip]',
        };
    }

    const builder = new ExtensionBrandBuilder();
    const builtSlugs: string[] = [];
    const builtBrowsers: BrowserTarget[] = [];

    try {
        if (parsed.MetadataDir) {
            const res = builder.BuildFromMetadata({
                MetadataDir: parsed.MetadataDir,
                ApplicationName: parsed.ApplicationName,
                BrandSlug: parsed.BrandSlug,
                OutputRootDir: parsed.OutputDir,
                TargetBrowsers: parsed.TargetBrowsers,
                CreateZipArchive: !parsed.NoZip,
            });
            builtSlugs.push(res.BrandProfile.BrandSlug);
            builtBrowsers.push(...(Object.keys(res.BrowserResults) as BrowserTarget[]));
        }

        for (const brandPath of parsed.BrandJsonPaths) {
            if (parsed.TargetBrowsers.length > 1) {
                const multi = builder.BuildMultiBrowserExtension({
                    BrandSource: brandPath,
                    OutputRootDir: parsed.OutputDir,
                    TargetBrowsers: parsed.TargetBrowsers,
                    CreateZipArchive: !parsed.NoZip,
                });
                const firstKey = Object.keys(multi)[0] as BrowserTarget;
                builtSlugs.push(multi[firstKey].BrandProfile.BrandSlug);
                builtBrowsers.push(...(Object.keys(multi) as BrowserTarget[]));
            } else {
                const res = builder.BuildBrandedExtension({
                    BrandSource: brandPath,
                    OutputRootDir: parsed.OutputDir,
                    TargetBrowser: parsed.TargetBrowsers[0] ?? 'chrome',
                    CreateZipArchive: !parsed.NoZip,
                });
                builtSlugs.push(res.BrandProfile.BrandSlug);
                builtBrowsers.push(res.TargetBrowser);
            }
        }
        return {
            ExitCode: 0,
            BuiltSlugs: builtSlugs,
            BuiltBrowsers: builtBrowsers,
        };
    } catch (err) {
        return {
            ExitCode: 1,
            BuiltSlugs: builtSlugs,
            BuiltBrowsers: builtBrowsers,
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
