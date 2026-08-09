import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The release line this build documents, as the "v6.x" pill text used in the
 * site header and the landing hero.
 *
 * Versioned deploys set DOCS_VERSION per line (one build per line — see
 * .github/workflows/docs.yml), and that always wins. Local previews have no
 * env, so the line is derived from @memberjunction/core's version on the
 * checked-out ref — the product version, which the workspace root's
 * placeholder package.json is not.
 */
function repoLine() {
  const corePkg = fileURLToPath(new URL('../../../packages/MJCore/package.json', import.meta.url));
  const version = JSON.parse(readFileSync(corePkg, 'utf8')).version ?? '';
  const major = version.split('.')[0];
  if (!/^\d+$/.test(major)) {
    throw new Error(`Cannot derive the documented line from @memberjunction/core version "${version}" and DOCS_VERSION is unset`);
  }
  return `v${major}`;
}

export const documentedLine = `${process.env.DOCS_VERSION || repoLine()}.x`;
