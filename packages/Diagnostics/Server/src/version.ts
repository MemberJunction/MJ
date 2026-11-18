import { readFileSync } from 'node:fs';

/** Reads the version field of this package's own `package.json`. */
function readPackageVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? 'unknown';
}

/**
 * The MemberJunction version this server reports in bundles and intake requests.
 * `MJ_VERSION` in the environment takes precedence; otherwise it is this package's version
 * (all MJ packages share one version).
 */
export const MJ_VERSION: string = process.env.MJ_VERSION?.trim() || readPackageVersion();
