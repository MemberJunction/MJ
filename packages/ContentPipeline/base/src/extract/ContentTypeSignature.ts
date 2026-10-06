/**
 * @fileoverview Recognising a *content type* from a file's own structure.
 *
 * File type says what format the bytes are in; content type says what the document **is** — a
 * standards record, a session listing, a member directory. That is often visible in the structure
 * itself: a spreadsheet's header row, an XML document's root element.
 *
 * Signatures are **declarative metadata for the ordinary case**: a small descriptor scoped by file
 * type, checked by one of a few generic matchers rather than bespoke logic per content type. A
 * code-level probe remains the escape hatch for a structure too irregular to express that way.
 *
 * Every applicable signature is checked against the same bytes, and each proposes its content type
 * at its own confidence — so they compete on the same terms as anything Discover already proposed,
 * rather than the first match winning by being first.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { ConfidenceScale, ResolveConfidence, ResolvedConfidenceScale } from '../ConfidenceScale.js';

/** What a signature is checked against. */
export interface SignatureProbe {
    /** The fetched bytes. */
    Content: Uint8Array;
    /** The resolved file type, which scopes which signatures apply at all. */
    FileType: string;
    /** Where the bytes came from. */
    URL: string;
    /**
     * The run's resolved confidence scale.
     *
     * Passed in rather than read at construction: a signature instance is built before any run
     * configuration exists, so a property initialiser could only ever see the defaults.
     */
    Confidence?: ResolvedConfidenceScale;
}

/** A signature's conclusion. */
export interface SignatureMatch {
    /** The content type's name. */
    ContentType: string;
    /** How much this signature trusts the match. Competes with every other proposal. */
    Confidence: number;
}

/**
 * A registered way of recognising a content type from structure.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseContentTypeSignature, 'StandardsSpreadsheet')
 * export class StandardsSignature extends BaseContentTypeSignature {
 *     public readonly Key = 'StandardsSpreadsheet';
 *     public readonly FileTypes = ['csv', 'xlsx'];
 *     public readonly ContentType = 'Standard';
 *     ...
 * }
 * ```
 */
/**
 * Advance past an XML prologue — processing instructions, comments and the doctype — to the first
 * real element.
 *
 * Deliberately a scan rather than `head.replace(/<\?[\s\S]*?\?>/g, '')`. That expression is
 * polynomial on input made of many unterminated `<?` sequences, which is reachable here because the
 * bytes come from whatever a source served (CodeQL rule js/polynomial-redos). `indexOf` is linear
 * and cannot backtrack.
 */
export function SkipPrologue(head: string): string {
    const openers: readonly (readonly [string, string])[] = [
        ['<?', '?>'],
        ['<!--', '-->'],
        ['<!', '>'],
    ];
    let i = 0;
    for (;;) {
        while (i < head.length && /\s/.test(head[i])) {
            i++;
        }
        const opener = openers.find((o) => head.startsWith(o[0], i));
        if (!opener) {
            return head.slice(i);
        }
        const end = head.indexOf(opener[1], i + opener[0].length);
        if (end < 0) {
            // Unterminated: there is no element to find after it.
            return '';
        }
        i = end + opener[1].length;
    }
}

export abstract class BaseContentTypeSignature {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /** The file types this signature applies to. A signature is never checked outside them. */
    public abstract readonly FileTypes: readonly string[];

    /** Whether this signature applies to a resolved file type. */
    public Applies(fileType: string): boolean {
        return this.FileTypes.includes(fileType.toLowerCase());
    }

    /** Check the bytes. Returns null when they do not match. */
    public abstract Check(probe: SignatureProbe): Promise<SignatureMatch | null>;

    /**
     * This signature's own confidence if it declared one, otherwise the run's structural default.
     *
     * A signature that declares nothing follows whatever the deployment configured; one that
     * declares a value is saying it knows better than the general case, and keeps it.
     */
    protected confidenceFor(probe: SignatureProbe): number {
        const declared = (this as { Confidence?: number }).Confidence;
        return typeof declared === 'number'
            ? declared
            : (probe.Confidence?.ContentTypeStructural ?? ConfidenceScale.ContentTypeStructural);
    }

    /** Every registered signature. */
    public static All(): BaseContentTypeSignature[] {
        return MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseContentTypeSignature)
            .map((r) => {
                const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseContentTypeSignature>(
                    BaseContentTypeSignature,
                    r.Key,
                );
                return result.Resolved ? result.Instance : null;
            })
            .filter((s): s is BaseContentTypeSignature => s !== null);
    }
}

/**
 * Check every applicable signature against the same bytes, in parallel.
 *
 * The file is read once however many signatures are checked. What scales is the number of signatures
 * registered against a given file type, which argues for keeping that count deliberately small.
 *
 * @returns Every match, for the caller to propose. Nothing is ranked here: ranking is what the
 *   confidence mechanism already does.
 */
export async function CheckContentTypeSignatures(probe: SignatureProbe): Promise<SignatureMatch[]> {
    // Resolve once for the whole sweep so every signature sees the same scale.
    const resolved: SignatureProbe = { ...probe, Confidence: probe.Confidence ?? ResolveConfidence(undefined) };
    const applicable = BaseContentTypeSignature.All().filter((s) => s.Applies(resolved.FileType));
    if (applicable.length === 0) {
        return [];
    }
    const results = await Promise.all(
        applicable.map(async (signature) => {
            try {
                return await signature.Check(resolved);
            } catch {
                // One malformed signature must not stop the others from being checked.
                return null;
            }
        }),
    );
    return results.filter((m): m is SignatureMatch => m !== null);
}

/**
 * A signature matching a delimited file's header row.
 *
 * Subclass and declare the columns; no per-content-type parsing code. A linked reference
 * spreadsheet inside a structured document resolves cleanly this way — its columns do not match, so
 * it falls through to the generic reader on its own.
 */
export abstract class BaseColumnSignature extends BaseContentTypeSignature {
    /** The content type this recognizes. */
    public abstract readonly ContentType: string;
    /** Column headers that must all be present, matched case-insensitively. */
    public abstract readonly RequiredColumns: readonly string[];
    /** How much to trust a match. */
    /**
     * How much to trust a match.
     *
     * Leave unset to use the run's `ContentTypeStructural` confidence, which a deployment can
     * configure. Set it only when this particular signature deserves more or less trust than
     * structural detection generally.
     */
    public readonly Confidence?: number;
    /** The delimiter. */
    public readonly Delimiter: string = ',';

    public async Check(probe: SignatureProbe): Promise<SignatureMatch | null> {
        const header = new TextDecoder('utf-8', { fatal: false })
            .decode(probe.Content.subarray(0, 4096))
            .split(/\r?\n/)[0]
            ?.toLowerCase();
        if (!header) {
            return null;
        }
        const present = new Set(header.split(this.Delimiter).map((c) => c.trim().replace(/^"|"$/g, '')));
        const matched = this.RequiredColumns.every((c) => present.has(c.toLowerCase()));
        return matched ? { ContentType: this.ContentType, Confidence: this.confidenceFor(probe) } : null;
    }
}

/**
 * A signature matching an XML document's root element or namespace.
 *
 * Accepts a list of alternatives, because one logical content type routinely has several accepted
 * structures.
 */
export abstract class BaseXmlSignature extends BaseContentTypeSignature {
    /** The content type this recognizes. */
    public abstract readonly ContentType: string;
    /** Any one of these root element names matches. Case-insensitive. */
    public readonly RootElements: readonly string[] = [];
    /** Any one of these namespaces matches. */
    public readonly Namespaces: readonly string[] = [];
    /** How much to trust a match. Unset uses the run's `ContentTypeStructural` confidence. */
    public readonly Confidence?: number;

    public async Check(probe: SignatureProbe): Promise<SignatureMatch | null> {
        const head = new TextDecoder('utf-8', { fatal: false }).decode(probe.Content.subarray(0, 4096));
        const root = /<\s*([A-Za-z_][\w.-]*(?::[\w.-]+)?)[\s>]/.exec(SkipPrologue(head))?.[1];
        const rootMatches =
            root !== undefined &&
            this.RootElements.some((e) => e.toLowerCase() === root.toLowerCase().split(':').pop());
        const namespaceMatches = this.Namespaces.some((ns) => head.includes(ns));
        return rootMatches || namespaceMatches
            ? { ContentType: this.ContentType, Confidence: this.confidenceFor(probe) }
            : null;
    }
}
