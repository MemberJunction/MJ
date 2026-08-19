#!/usr/bin/env node
/**
 * The guard behind the manifest prebuild's fallback (#3856).
 *
 * The prebuild reads `mj codegen manifest … || <this script>`. The fallback exists for the monorepo
 * dev loop, where the `mj` CLI may legitimately be absent — but on a HOST with installed Open Apps,
 * silently linking the stale committed manifest is not a degraded build, it is a wrong one: the
 * generated Open-App bootstrap block is what makes an installed app's client classes register, so
 * the symptom is the app's screens simply absent, with a green build and no error anywhere.
 *
 * So the fallback now VERIFIES instead of shrugging. It exits 0 — allowing the stale manifest —
 * only when that manifest demonstrably covers every enabled `dynamicPackages.client` entry in
 * mj.config.cjs. A manifest that predates an installed app fails the build with the exact package
 * names that are missing, which converts "screens are silently absent on a host" into "the build
 * says which app the manifest does not know about".
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, '../src/app/generated/class-registrations-manifest.ts');
const configPath = resolve(here, '../mj.config.cjs');

if (!existsSync(manifestPath)) {
  process.stderr.write(
    `[manifest] FAIL: 'mj codegen manifest' did not run and no committed manifest exists at\n` +
    `  ${manifestPath}\n` +
    `Install the MemberJunction CLI (npm i -g @memberjunction/cli) or restore the file.\n`);
  process.exit(1);
}

const manifest = readFileSync(manifestPath, 'utf-8');
if (manifest.trim().length === 0) {
  process.stderr.write(`[manifest] FAIL: the committed manifest is empty (${manifestPath}).\n`);
  process.exit(1);
}

/** Enabled client dynamic packages the manifest MUST know about, or the fallback is unsafe. */
let required = [];
if (existsSync(configPath)) {
  try {
    const require_ = createRequire(import.meta.url);
    const config = require_(configPath);
    required = (config?.dynamicPackages?.client ?? [])
      .filter((entry) => entry?.Enabled !== false && typeof entry?.PackageName === 'string')
      .map((entry) => entry.PackageName);
  } catch (error) {
    // A config that cannot be read is the CLI-would-also-have-failed case; the manifest cannot be
    // judged against it, and refusing the build over an unreadable config would break the plain
    // monorepo loop the fallback exists for. Say so and allow.
    process.stderr.write(`[manifest] warning: could not read ${configPath} (${error?.message}); ` +
      `skipping dynamic-package coverage check.\n`);
  }
}

const missing = required.filter((name) => !manifest.includes(`'${name}'`) && !manifest.includes(`"${name}"`));
if (missing.length > 0) {
  process.stderr.write(
    `[manifest] FAIL: 'mj codegen manifest' did not run, and the committed manifest predates ` +
    `these enabled dynamicPackages.client entries:\n` +
    missing.map((name) => `  - ${name}`).join('\n') + '\n' +
    `Linking it would build an Explorer in which those apps' screens are silently absent.\n` +
    `Install the MemberJunction CLI (npm i -g @memberjunction/cli) so the manifest regenerates.\n`);
  process.exit(1);
}

process.stderr.write(`[manifest] warning: 'mj codegen manifest' unavailable — using the committed ` +
  `manifest, which covers all ${required.length} enabled dynamic client package(s).\n`);
