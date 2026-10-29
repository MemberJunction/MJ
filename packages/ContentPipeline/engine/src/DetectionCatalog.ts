/**
 * @fileoverview The detection rules — byte signatures, which file types are not text, which
 * extractor reads a file type — loaded from `MJ: Content File Types` through the cached
 * `KnowledgeHubMetadataEngine`. Metadata is the only source; there are no rules in code.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJContentFileTypeEntity } from '@memberjunction/core-entities';
import { Signature } from '@memberjunction/content-pipeline-base';

/** The fields of a Content File Type row the rules are built from. */
export type DetectionRow = Pick<MJContentFileTypeEntity, 'Name' | 'FileExtension' | 'ByteSignature' | 'IsText' | 'ExtractorKey'>;

/** Everything detection needs, resolved once per run. */
export interface DetectionRules {
    /** Byte signatures, longest first so a more specific match wins. */
    Signatures: readonly Signature[];
    /** File types marked not text and naming no extractor — they go down the multi-modal path. */
    NonTextFileTypes: ReadonlySet<string>;
    /** File type → the extractor that reads it. */
    ExtractorByFileType: ReadonlyMap<string, string>;
}

/** Loads the rules once per instance (one per stage instance, so once per run). */
export class DetectionCatalog {
    private rules?: Promise<DetectionRules>;

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /** The rules, loaded once. A failed load is not cached, so the next record retries it. */
    public Rules(): Promise<DetectionRules> {
        this.rules ??= this.load().catch((error: unknown) => {
            this.rules = undefined;
            throw error;
        });
        return this.rules;
    }

    private async load(): Promise<DetectionRules> {
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false, this.contextUser, this.provider);
        return BuildDetectionRules(engine.ContentFileTypes);
    }
}

/** Build the rules from Content File Type rows. A row with an unparseable signature is skipped and logged. */
export function BuildDetectionRules(rows: readonly DetectionRow[]): DetectionRules {
    const signatures: Signature[] = [];
    const nonText = new Set<string>();
    const extractors = new Map<string, string>();
    for (const row of rows) {
        const key = FileTypeKey(row);
        if (!key) {
            continue;
        }
        // Not text and nothing to read it with (an image, audio, video): the multi-modal path.
        if (row.IsText === false && !row.ExtractorKey) {
            nonText.add(key);
        }
        if (row.ExtractorKey) {
            extractors.set(key, row.ExtractorKey);
        }
        signatures.push(...parseSignatures(key, row));
    }
    const specificity = (s: Signature) => s.Magic.length + (s.TextPrefix?.length ?? 0);
    signatures.sort((a, b) => specificity(b) - specificity(a));
    return { Signatures: signatures, NonTextFileTypes: nonText, ExtractorByFileType: extractors };
}

/** The pipeline's name for a file type: the extension without its dot, else the row's name, lowercased. */
export function FileTypeKey(row: Pick<DetectionRow, 'Name' | 'FileExtension'>): string | null {
    const key = (row.FileExtension ?? row.Name ?? '').trim().toLowerCase().replace(/^\./, '');
    return key || null;
}

/**
 * The signatures one `ByteSignature` value declares: `{"Magic":[..],"Offset":n,"Unambiguous":b}`
 * and/or `{"TextPrefix":[..]}`. Unambiguous defaults to false — overriding a declared type has to be
 * claimed explicitly.
 */
function parseSignatures(fileType: string, row: DetectionRow): Signature[] {
    if (!row.ByteSignature) {
        return [];
    }
    try {
        const parsed = JSON.parse(row.ByteSignature) as { Magic?: unknown; Offset?: unknown; TextPrefix?: unknown; Unambiguous?: unknown };
        const unambiguous = parsed.Unambiguous === true;
        const magic = Array.isArray(parsed.Magic) ? parsed.Magic.filter((b): b is number => typeof b === 'number') : [];
        const prefixes = (Array.isArray(parsed.TextPrefix) ? parsed.TextPrefix : [parsed.TextPrefix])
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .map((p) => p.trim().toLowerCase());
        const signatures: Signature[] = prefixes.map((prefix) => ({ FileType: fileType, Magic: [], TextPrefix: prefix, Unambiguous: unambiguous }));
        if (magic.length > 0) {
            const offset = typeof parsed.Offset === 'number' ? parsed.Offset : undefined;
            signatures.push({ FileType: fileType, Magic: magic, Offset: offset, Unambiguous: unambiguous });
        }
        return signatures;
    } catch {
        LogError(`DetectionCatalog: Content File Type '${row.Name ?? fileType}' has an unparseable ByteSignature`);
        return [];
    }
}
