/**
 * @fileoverview The detection rules, loaded from metadata.
 *
 * What a format looks like, whether it is text, and which extractor reads it are facts about a file
 * type — not facts about the pipeline — and they were hardcoded, so recognising one more format
 * meant a release.
 *
 * The split is deliberate: the **matchers stay in code** and the **data moves to rows**. Comparing
 * magic bytes at an offset is a generic operation that will not change; which bytes mean PDF is a
 * fact that will. A deployment needing a matcher the generic one cannot express still registers a
 * signature class in code, which is the escape hatch rather than the normal path.
 *
 * Rows come from `KnowledgeHubMetadataEngine`, which already caches Content File Types and Content
 * Types, so this costs no query of its own. The built-in tables remain as the answer when metadata
 * carries nothing — a fresh database recognises PDFs on day one.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { Signature } from '@memberjunction/content-pipeline-base';

/** A structural signature as a Content Type stores it. */
export interface StructuralSignatureRow {
    ContentType: string;
    RootElements: string[];
    Namespaces: string[];
}

/** Everything the detection code needs, resolved once per run. */
export interface DetectionRules {
    /** Byte signatures from metadata, longest magic first so a more specific match wins. */
    Signatures: readonly Signature[];
    /** Structural signatures, by content type. */
    Structural: readonly StructuralSignatureRow[];
    /** File types metadata declares to be text. */
    TextFileTypes: ReadonlySet<string>;
    /** File types metadata declares NOT to be text. */
    NonTextFileTypes: ReadonlySet<string>;
    /** File type → the extractor configured to read it. */
    ExtractorByFileType: ReadonlyMap<string, string>;
}

/** Nothing configured — the built-in tables answer on their own. */
export const EmptyDetectionRules: DetectionRules = {
    Signatures: [],
    Structural: [],
    TextFileTypes: new Set(),
    NonTextFileTypes: new Set(),
    ExtractorByFileType: new Map(),
};

/**
 * Loads the detection rules a run uses.
 *
 * One instance per run; the result is cached, because these are metadata and do not change while a
 * page of records is being processed.
 */
export class DetectionCatalog {
    private rules?: Promise<DetectionRules>;

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /** The rules, loaded once. */
    public Rules(): Promise<DetectionRules> {
        this.rules ??= this.load().catch((error: unknown) => {
            // Detection has working defaults, so a metadata failure degrades rather than stops the
            // run — recognising fewer formats is survivable; refusing to extract anything is not.
            LogError(
                `DetectionCatalog: could not read detection metadata, using built-in rules only: ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
            return EmptyDetectionRules;
        });
        return this.rules;
    }

    private async load(): Promise<DetectionRules> {
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false, this.contextUser, this.provider);

        const signatures: Signature[] = [];
        const textTypes = new Set<string>();
        const nonTextTypes = new Set<string>();
        const extractors = new Map<string, string>();

        for (const fileType of engine.ContentFileTypes) {
            const key = this.fileTypeKey(fileType.FileExtension, fileType.Name);
            if (!key) {
                continue;
            }
            if (fileType.IsText === true) {
                textTypes.add(key);
            } else if (fileType.IsText === false) {
                nonTextTypes.add(key);
            }
            if (fileType.ExtractorKey) {
                extractors.set(key, fileType.ExtractorKey);
            }
            const signature = this.parseSignature(key, fileType.ByteSignature, fileType.Name);
            if (signature) {
                signatures.push(signature);
            }
        }

        const structural: StructuralSignatureRow[] = [];
        for (const contentType of engine.ContentTypes) {
            const parsed = this.parseStructural(contentType.Name, contentType.StructuralSignature);
            if (parsed) {
                structural.push(parsed);
            }
        }

        // Longest magic first, so a signature that is a prefix of another never shadows it.
        signatures.sort((a, b) => b.Magic.length - a.Magic.length);
        return {
            Signatures: signatures,
            Structural: structural,
            TextFileTypes: textTypes,
            NonTextFileTypes: nonTextTypes,
            ExtractorByFileType: extractors,
        };
    }

    /** The extension without its dot, which is how the pipeline names a file type throughout. */
    private fileTypeKey(extension: string | null, name: string | null): string | null {
        const raw = extension ?? name;
        if (!raw) {
            return null;
        }
        const trimmed = raw.trim().toLowerCase();
        return trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
    }

    /** One `ByteSignature` row, or null when it holds nothing usable. */
    private parseSignature(fileType: string, stored: string | null, name: string | null): Signature | null {
        if (!stored) {
            return null;
        }
        try {
            const parsed = JSON.parse(stored) as { Magic?: unknown; Offset?: unknown; Unambiguous?: unknown };
            const magic = Array.isArray(parsed.Magic)
                ? parsed.Magic.filter((b): b is number => typeof b === 'number')
                : [];
            if (magic.length === 0) {
                return null;
            }
            return {
                FileType: fileType,
                Magic: magic,
                Offset: typeof parsed.Offset === 'number' ? parsed.Offset : undefined,
                // Defaults to ambiguous: a signature that claims it may override a declared type
                // should have to say so, because getting that wrong silently mislabels content.
                Unambiguous: parsed.Unambiguous === true,
            };
        } catch {
            LogError(`DetectionCatalog: Content File Type '${name ?? fileType}' has an unparseable ByteSignature`);
            return null;
        }
    }

    /** One `StructuralSignature` row, or null when it holds nothing usable. */
    private parseStructural(contentType: string | null, stored: string | null): StructuralSignatureRow | null {
        if (!stored || !contentType) {
            return null;
        }
        try {
            const parsed = JSON.parse(stored) as { RootElements?: unknown; Namespaces?: unknown };
            const roots = Array.isArray(parsed.RootElements)
                ? parsed.RootElements.filter((r): r is string => typeof r === 'string')
                : [];
            const namespaces = Array.isArray(parsed.Namespaces)
                ? parsed.Namespaces.filter((n): n is string => typeof n === 'string')
                : [];
            if (roots.length === 0 && namespaces.length === 0) {
                return null;
            }
            return { ContentType: contentType, RootElements: roots, Namespaces: namespaces };
        } catch {
            LogError(`DetectionCatalog: Content Type '${contentType}' has an unparseable StructuralSignature`);
            return null;
        }
    }
}
