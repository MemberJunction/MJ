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
 * content type, file type).
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
} from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const MANIFEST_EXTRACTOR = 'Manifest';

/** Which manifest columns hold what. Column names match the header row, ignoring case and surrounding spaces. */
export interface ManifestOptions {
    /** The column holding each row's link. A row with a link and no text is fetched from the link. */
    LinkColumn?: string;
    /** The column holding each row's text. A row with text is complete as listed. */
    TextColumn?: string;
    TitleColumn?: string;
    DateColumn?: string;
    DecoratorColumn?: string;
    /**
     * A column that identifies a row across versions of the manifest, for rows without a link. Without it a
     * text-only row is identified by its position, so reordering the manifest replaces such rows.
     */
    KeyColumn?: string;
    /** Further columns, as `{ "<manifest column>": "<item column>" }`; the item column may be an IS-A extension's field. */
    Columns?: Record<string, string>;
    /** The field separator. Default: tab for a `tsv` file, comma otherwise. */
    Delimiter?: string;
}

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
        const [header, ...rows] = ParseDelimited(new TextDecoder('utf-8', { fatal: false }).decode(request.Content), delimiter);
        if (!header) {
            return { Blocks: [], IsContainer: true };
        }
        const column = this.columnIndex(header);
        const at = (row: string[], name: string | undefined): string | null => {
            const index = name ? column(name) : -1;
            const value = index >= 0 ? (row[index] ?? '').trim() : '';
            return value.length > 0 ? value : null;
        };
        this.requireColumns(options, column);

        const limit = this.rowLimit(request);
        if (rows.length > limit) {
            throw new Error(`the manifest lists ${rows.length} rows, more than the limit of ${limit} (Options.Tuning.MaxArchiveMembers)`);
        }
        const confidence = request.Confidence ?? ConfidenceScale;
        const blocks: ContentBlock[] = [];
        for (const [index, row] of rows.entries()) {
            if (request.Signal.aborted) {
                break;
            }
            const link = this.resolveLink(at(row, options.LinkColumn), request.URL);
            const text = at(row, options.TextColumn);
            if (!link && !text) {
                request.ReportProgress(`row ${index + 2}: no link and no text, skipped`);
                continue;
            }
            blocks.push({
                Text: text ?? '',
                URL: link ?? undefined,
                Key: at(row, options.KeyColumn) ?? link ?? `row-${index + 1}`,
                Fields: this.fields(row, options, at, confidence, index),
                Columns: this.columns(row, options, at),
            });
        }
        request.ReportProgress(`read ${blocks.length} of ${rows.length} manifest row(s)`);
        return { Blocks: blocks, IsContainer: true };
    }

    /** Title, date and decorator, as a listing's findings: an extractor reading the linked document can override them. */
    private fields(
        row: string[],
        options: ManifestOptions,
        at: (row: string[], name: string | undefined) => string | null,
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
        at: (row: string[], name: string | undefined) => string | null,
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
