import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The release line this build documents.
 *
 * A line id is either a bare major ("v6" — the Edge set, built from main) or a
 * dotted minor ("v6.1" — an LTS line, built from its lts/6.1 branch). Both
 * shapes are first-class: under the LTS version grammar every certified line
 * after the 5.x bootstrap lands at a MINOR (6.1, 6.2, …), so dotted ids are the
 * steady state, not an edge case.
 *
 * Three values come out of the id, and they are deliberately NOT the same value
 * wearing different hats — conflating them is what this module exists to
 * prevent:
 *
 *   documentedLine    "v6.1.x"  display only — the header/hero pill text
 *   documentedMajor   6         an INTEGER, for era comparisons (see license-line.mjs)
 *   documentedLineId  "6.1"     the branch suffix, for lts/<id> URLs
 *
 * `Number("6.1")` is 6.1, not 6, so a dotted line read as a major breaks every
 * `>= N` era test; worse, `Number("6.10")` is ALSO 6.1, so 6.1 and 6.10 become
 * indistinguishable. The integer major and the id string never collide.
 *
 * Versioned deploys set DOCS_VERSION per line (one build per line — see
 * .github/workflows/docs.yml), and that always wins. Local previews have no
 * env, so the line is derived from @memberjunction/core's version on the
 * checked-out ref — the product version, which the workspace root's
 * placeholder package.json is not. That fallback yields a bare major even on an
 * lts/6.1 checkout; a preview of a line's own pill needs DOCS_VERSION set.
 */
const LINE_ID = /^v(\d+)(?:\.(\d+))?$/;

function repoLine() {
    const corePkg = fileURLToPath(new URL('../../../packages/MJCore/package.json', import.meta.url));
    const version = JSON.parse(readFileSync(corePkg, 'utf8')).version ?? '';
    const major = version.split('.')[0];
    if (!/^\d+$/.test(major)) {
        throw new Error(`Cannot derive the documented line from @memberjunction/core version "${version}" and DOCS_VERSION is unset`);
    }
    return `v${major}`;
}

const line = process.env.DOCS_VERSION || repoLine();
const parsed = LINE_ID.exec(line);
if (!parsed) {
    throw new Error(`Documented line must look like "v6" or "v6.1", got "${line}"`);
}

/** The "v6.x" / "v6.1.x" pill text used in the site header and the landing hero. */
export const documentedLine = `${line}.x`;

/** The era this build documents, as an integer — 6 for both the "v6" and "v6.1" lines. */
export const documentedMajor = Number(parsed[1]);

/**
 * The line's branch suffix — "5" for lts/5, "6.1" for lts/6.1.
 *
 * A string on purpose: it is a branch-name fragment, never an arithmetic value.
 */
export const documentedLineId = line.slice(1);

// The regex above already constrains both, but these are the two invariants the
// rest of the site derives licensing and branch URLs from, so state them.
if (!Number.isInteger(documentedMajor)) {
    throw new Error(`documentedMajor must be an integer, got ${documentedMajor} from "${line}"`);
}
if (documentedLineId.length === 0) {
    throw new Error(`documentedLineId must be a non-empty branch suffix, got "" from "${line}"`);
}
