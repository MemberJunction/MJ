/**
 * @fileoverview {@link ManifestExtractor} — a CSV or TSV that lists documents, expanded like an archive.
 *
 * Each row becomes a child Content Item with `ParentID` set to the manifest, so a Sync leaves the rows alone
 * unless the manifest itself is removed, and a re-extraction retires the rows that are no longer listed.
 * A row that carries its text is complete. A row that only links to its document becomes an item at that
 * link, which its own Extract fetches through the source's normal fetch and Access path.
 *
 * Which columns hold what is configuration (`ExtractorOptions.Manifest`, see {@link ManifestOptions}). A CSV
 * is never a manifest by default: many are datasets, which a tabular segmenter splits into rows of one
 * document. This extractor runs only when selected through the normal extractor order (item, run, source,
 * content type, file type). Once selected it reads every CSV it is given as a manifest, unless
 * {@link ManifestOptions.DetectByHeader} is set: then a CSV whose header names none of the manifest's
 * columns is read as an ordinary document instead, so one source can receive both manifests and datasets.
 *
 * A row's identity is its link when it has one; otherwise its key ({@link ManifestOptions.KeyColumn},
 * {@link ManifestOptions.KeyColumns}), else its position. See {@link ManifestOptions.KeyColumns} for the
 * child's resulting URL.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentExtractor,
    ConfidenceScale,
    ContentBlock,
    DiscoveredField,
    ExtractRequest,
    ExtractResult,
    IsPlausibleText,
    TransientStageError,
} from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const MANIFEST_EXTRACTOR = 'Manifest';

/** The default {@link ManifestOptions.KeySeparator}. */
export const DEFAULT_MANIFEST_KEY_SEPARATOR = ' | ';

/**
 * Which manifest columns hold what. Column names match the header row, ignoring case and surrounding spaces.
 *
 * @example A source that receives both crawl manifests and plain datasets. A CSV is a manifest when its header
 * has `ContentLink`, `ContentText` or `UserLink`; any other CSV is read as one document. A row is fetched from
 * `ContentLink`, or from `UserLink` when it has no text of its own. A row without a link is identified by
 * `UserLink | Title`, else `UserLink`, else `Title`, and keeps that identity as its URL.
 * ```json
 * {
 *   "DetectByHeader": true,
 *   "DetectionColumns": ["ContentLink", "ContentText", "UserLink"],
 *   "LinkColumn": "ContentLink",
 *   "FallbackLinkColumns": ["UserLink"],
 *   "TextColumn": "ContentText",
 *   "TitleColumn": "Title",
 *   "KeyColumns": [["UserLink", "Title"], "UserLink", "Title"],
 *   "KeyAsURL": true
 * }
 * ```
 */
export interface ManifestOptions {
    /** The column holding each row's link. A row with a link and no text is fetched from the link. */
    LinkColumn?: string;
    /**
     * Columns tried in turn, after {@link LinkColumn}, for the link of a row that has no text: the place its
     * document is fetched from. A row with text is complete as listed and never takes a fallback link, since such
     * a column (a landing page, say) is often shared by several text rows and would not identify any of them.
     * A listed column the header lacks is skipped.
     */
    FallbackLinkColumns?: string[];
    /** The column holding each row's text. A row with text is complete as listed. */
    TextColumn?: string;
    TitleColumn?: string;
    DateColumn?: string;
    DecoratorColumn?: string;
    /**
     * A column that identifies a row across versions of the manifest, for rows without a link. Without it a
     * text-only row is identified by its position, so reordering the manifest replaces such rows. Tried before
     * {@link KeyColumns}.
     */
    KeyColumn?: string;
    /**
     * Ways to identify a row without a link, tried in turn after {@link KeyColumn}; the first that yields a
     * value is the row's key. Each entry is a column name, or an array of column names forming a composite key:
     * their values joined by {@link KeySeparator}, used only when every one of them has a value. A listed column
     * the header lacks yields nothing, so the next entry is tried. When no entry yields a key, a row is
     * identified by its position (`row-<n>`, counting data rows from 1).
     *
     * **The child's URL**, which is how a re-extraction finds the item it made before (an existing item matches
     * on its source and URL): a row with a link is the item at that link, whatever its key; a row without one
     * is at `<manifest URL>#<key>`, or at the key itself when {@link KeyAsURL} is set.
     *
     * @example `[["UserLink", "Title"], "UserLink", "Title"]`: `UserLink | Title` when the row has both, else
     * `UserLink`, else `Title`.
     */
    KeyColumns?: Array<string | string[]>;
    /** Joins the values of a composite entry in {@link KeyColumns}. Default: `' | '`. */
    KeySeparator?: string;
    /**
     * Give a row without a link its key as its URL, instead of `<manifest URL>#<key>`: for a product whose
     * existing items already carry such keys as their URLs, so they keep their identities. The key must then be
     * unique across the source, not only within the manifest. A row identified only by its position still gets
     * `<manifest URL>#row-<n>`, since a bare position would collide between manifests.
     */
    KeyAsURL?: boolean;
    /** Further columns, as `{ "<manifest column>": "<item column>" }`; the item column may be an IS-A extension's field. */
    Columns?: Record<string, string>;
    /** The field separator. Default: tab for a `tsv` file, comma otherwise. */
    Delimiter?: string;
    /**
     * Decide from the header whether the file is a manifest at all. When the header names none of the
     * {@link DetectionColumns}, the file is read as an ordinary document: one block holding the whole file's
     * text, as the plain-text read gives any CSV. When it is a manifest, a configured column its header lacks
     * reads as empty rather than failing, since files of differing shapes are expected. Default: off, so every
     * file is a manifest and a configured column the header lacks is an error.
     */
    DetectByHeader?: boolean;
    /**
     * With {@link DetectByHeader}, the columns any one of which makes a file a manifest. Default: the columns
     * that can carry a row's document: {@link LinkColumn}, {@link TextColumn} and {@link FallbackLinkColumns}.
     */
    DetectionColumns?: string[];
}

/** Reads a row's trimmed value under a column name; null when the column is absent or the value empty. */
type CellReader = (row: string[], name: string | undefined) => string | null;

@RegisterClass(BaseContentExtractor, MANIFEST_EXTRACTOR)
export class ManifestExtractor extends BaseContentExtractor {
    public readonly Key = MANIFEST_EXTRACTOR;
    public readonly SupportedFileTypes = ['csv', 'tsv'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const options = (request.Options ?? {}) as ManifestOptions;
        if (!options.LinkColumn && !options.TextColumn) {
            throw new Error(
                `the Manifest extractor needs ExtractorOptions.Manifest.LinkColumn or TextColumn to know where each row's document is`,
            );
        }
        const delimiter = options.Delimiter ?? (request.FileType.toLowerCase() === 'tsv' ? '\t' : ',');
        const text = new TextDecoder('utf-8', { fatal: false }).decode(request.Content);
        const [header, ...rows] = ParseDelimited(text, delimiter);
        const column = this.columnIndex(header ?? []);
        if (options.DetectByHeader && !this.isManifest(options, column)) {
            request.ReportProgress('the header names no manifest column: read as a document');
            return this.asDocument(text, request);
        }
        if (!header) {
            return { Blocks: [], IsContainer: true };
        }
        const at: CellReader = (row, name) => {
            const index = name ? column(name) : -1;
            const value = index >= 0 ? (row[index] ?? '').trim() : '';
            return value.length > 0 ? value : null;
        };
        if (!options.DetectByHeader) {
            this.requireColumns(options, column);
        }
        const limit = this.rowLimit(request);
        if (rows.length > limit) {
            throw new Error(`the manifest lists ${rows.length} rows, more than the limit of ${limit} (Options.Tuning.MaxArchiveMembers)`);
        }
        const blocks = this.rowBlocks(rows, options, at, request);
        request.ReportProgress(`read ${blocks.length} of ${rows.length} manifest row(s)`);
        return { Blocks: blocks, IsContainer: true };
    }

    /** One block per row that has a link or text. */
    private rowBlocks(rows: string[][], options: ManifestOptions, at: CellReader, request: ExtractRequest): ContentBlock[] {
        const confidence = request.Confidence ?? ConfidenceScale;
        const blocks: ContentBlock[] = [];
        for (const [index, row] of rows.entries()) {
            if (request.Signal.aborted) {
                throw new TransientStageError('manifest extraction stopped before finishing all rows');
            }
            const text = at(row, options.TextColumn);
            const link = this.resolveLink(this.rowLink(row, options, at, text !== null), request.URL);
            if (!link && !text) {
                request.ReportProgress(`row ${index + 2}: no link and no text, skipped`);
                continue;
            }
            const key = this.rowKey(row, options, at);
            blocks.push({
                Text: text ?? '',
                URL: link ?? (key !== null && options.KeyAsURL ? key : undefined),
                Key: key ?? link ?? `row-${index + 1}`,
                Fields: this.fields(row, options, at, confidence, index),
                Columns: this.columns(row, options, at),
            });
        }
        return blocks;
    }

    /** The row's link column, then, for a row without text, its fallback link columns in turn. */
    private rowLink(row: string[], options: ManifestOptions, at: CellReader, hasText: boolean): string | null {
        const link = at(row, options.LinkColumn);
        if (link || hasText) {
            return link;
        }
        for (const name of options.FallbackLinkColumns ?? []) {
            const fallback = at(row, name);
            if (fallback) {
                return fallback;
            }
        }
        return null;
    }

    /** The key column, then the first {@link ManifestOptions.KeyColumns} entry that yields a value; null when none does. */
    private rowKey(row: string[], options: ManifestOptions, at: CellReader): string | null {
        const key = at(row, options.KeyColumn);
        if (key) {
            return key;
        }
        const separator = options.KeySeparator ?? DEFAULT_MANIFEST_KEY_SEPARATOR;
        for (const entry of options.KeyColumns ?? []) {
            const names = Array.isArray(entry) ? entry : [entry];
            const values = names.map((name) => at(row, name));
            if (names.length > 0 && values.every((value) => value !== null)) {
                return values.join(separator);
            }
        }
        return null;
    }

    /** Whether the header names any detection column. */
    private isManifest(options: ManifestOptions, column: (name: string) => number): boolean {
        const detection = options.DetectionColumns ?? [options.LinkColumn, options.TextColumn, ...(options.FallbackLinkColumns ?? [])];
        return detection.some((name) => !!name && column(name) >= 0);
    }

    /**
     * A file that is not a manifest, read as the plain-text read reads any CSV: its whole text as one block, or
     * nothing when the bytes do not read as plausible text.
     */
    private asDocument(text: string, request: ExtractRequest): ExtractResult {
        const plausible = text.length > 0 && IsPlausibleText(text, request.Tuning?.MinimumPrintableRatio);
        return { Blocks: plausible ? [{ Text: text }] : [], IsFallback: true };
    }

    /** Title, date and decorator, as a listing's findings: an extractor reading the linked document can override them. */
    private fields(
        row: string[],
        options: ManifestOptions,
        at: CellReader,
        confidence: Readonly<Record<keyof typeof ConfidenceScale, number>>,
        index: number,
    ): DiscoveredField[] {
        const fields: DiscoveredField[] = [];
        const title = at(row, options.TitleColumn);
        if (title) {
            fields.push({ Field: 'Title', Value: title, Confidence: confidence.DiscoveredTitle });
        }
        const date = at(row, options.DateColumn);
        if (date) {
            const parsed = new Date(date);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error(`row ${index + 2}: '${date}' in ${options.DateColumn} is not a date`);
            }
            fields.push({ Field: 'Date', Value: parsed, Confidence: confidence.DiscoveredDate });
        }
        const decorator = at(row, options.DecoratorColumn);
        if (decorator) {
            fields.push({ Field: 'Decorator', Value: decorator, Confidence: confidence.DiscoveredDecorator });
        }
        return fields;
    }

    /** The mapped further columns; the committer validates them against the item's entity. */
    private columns(
        row: string[],
        options: ManifestOptions,
        at: CellReader,
    ): Record<string, unknown> | undefined {
        const mapped: Record<string, unknown> = {};
        for (const [manifestColumn, itemColumn] of Object.entries(options.Columns ?? {})) {
            const value = at(row, manifestColumn);
            if (value !== null) {
                mapped[itemColumn] = value;
            }
        }
        return Object.keys(mapped).length > 0 ? mapped : undefined;
    }

    /**
     * The most rows a manifest may list: the archive member limit, since each row becomes an item just as each
     * member does. Like an archive, a manifest with no limit configured is refused rather than read unbounded.
     */
    private rowLimit(request: ExtractRequest): number {
        const fromSource = Number(request.Parameters.MaxArchiveMembers);
        const limit = Number.isFinite(fromSource) && fromSource > 0 ? Math.floor(fromSource) : request.Tuning?.MaxArchiveMembers ?? null;
        if (limit === null) {
            throw new Error(
                'no row limit is configured for the manifest: set Options.Tuning.MaxArchiveMembers on the Record Process, or MaxArchiveMembers on the Content Source',
            );
        }
        return limit;
    }

    /** Index of a header column, matched ignoring case and surrounding spaces; -1 when absent. */
    private columnIndex(header: string[]): (name: string) => number {
        const names = header.map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
        return (name: string) => names.indexOf(name.trim().toLowerCase());
    }

    /** A configured column the header does not have is a misconfiguration, not an empty value. */
    private requireColumns(options: ManifestOptions, column: (name: string) => number): void {
        const named = [
            options.LinkColumn,
            options.TextColumn,
            options.TitleColumn,
            options.DateColumn,
            options.DecoratorColumn,
            options.KeyColumn,
            ...Object.keys(options.Columns ?? {}),
        ].filter((name): name is string => !!name);
        const missing = named.filter((name) => column(name) < 0);
        if (missing.length > 0) {
            throw new Error(`the manifest has no column named ${missing.map((m) => `'${m}'`).join(', ')}`);
        }
    }

    /** A relative link resolves against the manifest's own address when that is a web address. */
    private resolveLink(link: string | null, manifestURL: string): string | null {
        if (!link) {
            return null;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(link) || !/^https?:/i.test(manifestURL)) {
            return link;
        }
        try {
            return new URL(link, manifestURL).toString();
        } catch {
            return link;
        }
    }
}

/**
 * Rows of a delimited text file (RFC 4180): quoted fields may hold the delimiter, line breaks and doubled
 * quotes; lines may end in LF or CRLF. Wholly empty lines are dropped.
 */
export function ParseDelimited(text: string, delimiter = ','): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                quoted = false;
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && field.length === 0) {
            quoted = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') {
                i++;
            }
            row.push(field);
            field = '';
            if (row.some((value) => value.length > 0)) {
                rows.push(row);
            }
            row = [];
        } else {
            field += ch;
        }
    }
    row.push(field);
    if (row.some((value) => value.length > 0)) {
        rows.push(row);
    }
    return rows;
}
