/**
 * @fileoverview Artifact tool library for CSV content.
 *
 * Provides column listing, paged row access, and regex search over a CSV
 * artifact. Uses a built-in RFC 4180-style parser — no external dep.
 */
import { RegisterClass } from '@memberjunction/global';
import {
    BaseArtifactToolLibrary,
    type ArtifactToolArgs,
    type ArtifactToolDefinition,
    type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';
import { CompileSafeToolRegex } from './artifact-tool-helpers';
import { ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';

interface ParsedCsv {
    columns: string[];
    rows: string[][];
}

@RegisterClass(BaseArtifactToolLibrary, 'CSVToolLibrary')
export class CSVToolLibrary extends BaseArtifactToolLibrary {
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'get_columns',
                description: 'Returns the column headers (first row) and the total data-row count.',
                inputSchema: { type: 'object', properties: {}, required: [] },
            },
            {
                name: 'get_rows',
                description: 'Returns a paged window of data rows as objects keyed by column header.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        start: { type: 'number', description: '0-based start row (after header). Default 0.' },
                        count: { type: 'number', description: 'Number of rows to return. Default 50.' },
                    },
                    required: [],
                },
            },
            {
                name: 'search',
                description: 'Regex search across every cell. Returns matching rows with their 0-based row index.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Regex pattern.' },
                        flags: { type: 'string', description: 'Optional regex flags (e.g. "i" for case-insensitive).' },
                        column: { type: 'string', description: 'Optional column name to scope the search.' },
                    },
                    required: ['pattern'],
                },
            },
        ];
    }

    protected async invokeSubclassTool(
        toolName: string,
        input: ArtifactToolArgs,
        artifactContent: string | Buffer,
    ): Promise<ArtifactToolResult> {
        const csv = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');
        const parsed = parseCsv(csv);

        switch (toolName) {
            case 'get_columns':
                return { success: true, data: { columns: parsed.columns, rowCount: parsed.rows.length } };
            case 'get_rows':
                return this.handleGetRows(parsed, input);
            case 'search':
                return this.handleSearch(parsed, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown tool: "${toolName}".` };
        }
    }

    private handleGetRows(parsed: ParsedCsv, input: ArtifactToolArgs): ArtifactToolResult {
        const start = Math.max(0, Number(input.start ?? 0));
        const count = Math.max(0, Number(input.count ?? 50));
        const window = parsed.rows.slice(start, start + count);
        const rows = window.map(cells => zipRow(parsed.columns, cells));
        return { success: true, data: { start, count: window.length, total: parsed.rows.length, rows } };
    }

    private handleSearch(parsed: ParsedCsv, input: ArtifactToolArgs): ArtifactToolResult {
        const pattern = String(input.pattern ?? '');
        const flags = typeof input.flags === 'string' ? input.flags : '';
        const column = typeof input.column === 'string' ? input.column : undefined;
        const colIndex = column ? parsed.columns.indexOf(column) : -1;
        if (column && colIndex === -1) {
            return { success: false, data: null, errorMessage: `Column "${column}" not found. Available: ${parsed.columns.join(', ')}.` };
        }

        const compiled = CompileSafeToolRegex(pattern, flags);
        if (!compiled.Regex) {
            return { success: false, data: null, errorMessage: compiled.ErrorMessage ?? `Invalid or unsafe regex: "${pattern}".` };
        }

        const rowIndices: number[] = [];
        const cellTexts: string[] = [];
        for (let r = 0; r < parsed.rows.length; r++) {
            const cells = parsed.rows[r];
            if (colIndex >= 0) {
                rowIndices.push(r);
                cellTexts.push(cells[colIndex] ?? '');
            } else {
                for (const cell of cells) {
                    rowIndices.push(r);
                    cellTexts.push(cell);
                }
            }
        }

        const batchResult = ExecuteSafeRegexBatchWithRecovery(compiled.Regex, cellTexts, performance.now() + 1500);
        const matchedRowSet = new Set<number>();
        for (let i = 0; i < batchResult.Matches.length; i++) {
            if (batchResult.Matches[i]) {
                matchedRowSet.add(rowIndices[i]);
            }
        }

        const matches: Array<{ rowIndex: number; row: Record<string, string> }> = [];
        for (const rowIndex of matchedRowSet) {
            matches.push({ rowIndex, row: zipRow(parsed.columns, parsed.rows[rowIndex]) });
        }

        return {
            success: true,
            data: {
                matchCount: matches.length,
                matches,
                ...(batchResult.BudgetExpired || batchResult.TimedOut.some(Boolean)
                    ? { partial: true, budgetExpired: batchResult.BudgetExpired }
                    : {}),
            },
        };
    }
}

function zipRow(columns: string[], cells: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) {
        out[columns[i]] = cells[i] ?? '';
    }
    return out;
}

/**
 * RFC 4180-ish CSV parser: handles quoted cells with embedded commas, escaped
 * quotes (""), and CRLF or LF line endings. First row is treated as headers.
 */
function parseCsv(input: string): ParsedCsv {
    const rows: string[][] = [];
    let cell = '';
    let row: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(cell);
            cell = '';
        } else if (ch === '\n' || ch === '\r') {
            row.push(cell);
            cell = '';
            if (row.length > 1 || row[0] !== '') {
                rows.push(row);
            }
            row = [];
            if (ch === '\r' && input[i + 1] === '\n') i++;
        } else {
            cell += ch;
        }
    }
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    const columns = rows.shift() ?? [];
    return { columns, rows };
}
