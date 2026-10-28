import { createHash } from "node:crypto";
import type { DatabasePlatform } from "@memberjunction/core";
import type { DescribedColumn } from "@memberjunction/generic-database-provider";
import { AnalyzeQueryTemplate, DescribeDiagnostic } from "./templateFacts";
import type { TemplateAnalysis } from "./templateFacts";
import { DescribeQueryOutput } from "./describeFacts";
import type { DescribedOutput } from "./describeFacts";
import { BindColumnSource, EntityObjectIndex } from "./sourceBinding";
import type {
    QueryExtractionInput,
    QueryExtractionResult,
    QueryExtractionStatus,
    QueryFieldFact,
} from "./extractionTypes";

/** Messages and the status they raise the run to. */
interface Findings {
    readonly Errors: string[];
    readonly Warnings: string[];
    readonly Notes: string[];
}

/**
 * Establishes a query's facts from its SQL and the database server, without writing anything:
 *
 * - from MJ's parser: whether it is a template, its parameters (with composition pass-throughs),
 *   its compositions, the entities it reads, its doc comments and the save-time rules;
 * - from the server: its output columns (name, order, exact type, nullability, source), for the
 *   base render and every branch render, mapped through MJ metadata.
 *
 * In `Save` mode a save-time rule error or a repeated output name refuses the save
 * (`Refusal`); in `Refresh` mode they are recorded with status `Error`. An external-data-source
 * query is not described (`Skipped`); a describe failure keeps the stored fields (`Error`). A
 * query that reads a table named by a template parameter is not described either: its output
 * depends on the arguments, so its stored (declared) fields are kept and a note says why.
 */
export async function ComputeQueryExtraction(input: QueryExtractionInput): Promise<QueryExtractionResult> {
    const analysis = AnalyzeQueryTemplate(input);
    const findings: Findings = { Errors: [], Warnings: [], Notes: [] };
    const refusal = saveRefusal(input, analysis.Errors.map(d => DescribeDiagnostic(d, input.SQL)), analysis.DuplicateOutputNames);
    if (refusal) return resultOf(input, analysis, null, findings, refusal);
    recordAnalysis(input, analysis, findings);
    if (input.IsExternal) {
        return { ...resultOf(input, analysis, null, findings, null), Entities: null, Status: 'Skipped',
            Messages: ['The query reads an external data source, which the database server cannot describe; its fields and entities were left as they are.', ...messagesOf(findings)] };
    }
    if (analysis.ReadsParameterNamedSource) {
        findings.Notes.push(PARAMETER_NAMED_SOURCE_NOTE);
        return resultOf(input, analysis, null, findings, null);
    }
    const output = await DescribeQueryOutput(input, analysis.Template, analysis.Parameters);
    const outputRefusal = saveRefusal(input, [], output.DuplicateNames);
    if (outputRefusal) return resultOf(input, analysis, null, findings, outputRefusal);
    recordOutput(output, analysis, findings);
    const fields = output.Failure === null ? fieldFacts(output.Columns, analysis, input, findings) : null;
    return resultOf(input, analysis, fields, findings, null);
}

/** Why the fields of a query that reads a parameter-named table are not taken from a describe. */
export const PARAMETER_NAMED_SOURCE_NOTE = 'The query reads a table or view named by a template parameter, so its output columns depend on the arguments ' +
    'and no sample render describes them; its fields were left as they are (declare them in the query\'s metadata).';

/**
 * The hash of the SQL the child rows are extracted from: SHA-256 (hex) of the dialect key and
 * the platform SQL, so the same text on another platform hashes differently.
 */
export function ExtractionSQLHash(sql: string, platform: DatabasePlatform): string {
    return createHash('sha256').update(`${platform}\n${sql}`).digest('hex');
}

/** Why a new or edited query must be refused; `null` when it may be saved or this is a refresh. */
function saveRefusal(input: QueryExtractionInput, errors: readonly string[], duplicates: readonly string[]): string | null {
    const reasons = [...errors];
    if (duplicates.length > 0) reasons.push(duplicateMessage(duplicates));
    if (input.Mode !== 'Save' || reasons.length === 0) return null;
    return `Query "${input.QueryName}" was not saved:\n${reasons.join('\n')}`;
}

function duplicateMessage(duplicates: readonly string[]): string {
    return `The query returns more than one column named ${duplicates.map(d => `"${d}"`).join(', ')} (names compare without case). ` +
        'Give each output column its own name, for example with an alias.';
}

/** Records what the template analysis found: refresh-mode rule errors, warnings, unread facts, orphaned authored parameters. */
function recordAnalysis(input: QueryExtractionInput, analysis: TemplateAnalysis, findings: Findings): void {
    findings.Errors.push(...analysis.Errors.map(d => DescribeDiagnostic(d, input.SQL)));
    if (analysis.DuplicateOutputNames.length > 0) findings.Errors.push(duplicateMessage(analysis.DuplicateOutputNames));
    findings.Warnings.push(...analysis.Warnings.map(d => DescribeDiagnostic(d, input.SQL)), ...analysis.Notes);
    const used = new Set(analysis.Parameters.map(p => p.Name.toLowerCase()));
    for (const known of input.KnownParameters) {
        if (known.IsAuthored && !used.has(known.Name.toLowerCase())) {
            findings.Warnings.push(`The authored parameter "${known.Name}" is not used by the SQL. It is kept, and a value passed for it is accepted and ignored.`);
        }
    }
}

/** Records the describe outcome: a failure, refresh-mode duplicates the parser did not already report, branch-only columns. */
function recordOutput(output: DescribedOutput, analysis: TemplateAnalysis, findings: Findings): void {
    if (output.Failure !== null) findings.Errors.push(`${output.Failure.trim().replace(/[.;]?$/, '.')} The stored fields were left as they are.`);
    const reported = new Set(analysis.DuplicateOutputNames.map(n => n.toLowerCase()));
    const duplicates = output.DuplicateNames.filter(n => !reported.has(n.toLowerCase()));
    if (duplicates.length > 0) findings.Errors.push(duplicateMessage(duplicates));
    if (output.BranchOnlyColumns.length > 0) {
        findings.Notes.push(`Columns only some branches of the template return: ${output.BranchOnlyColumns.join(', ')}.`);
    }
}

/** The field facts of the described output, in order; unnamed columns are skipped and reported. */
function fieldFacts(columns: readonly DescribedColumn[], analysis: TemplateAnalysis, input: QueryExtractionInput, findings: Findings): QueryFieldFact[] {
    const index = new EntityObjectIndex(input.Entities);
    const facts: QueryFieldFact[] = [];
    for (const column of columns) {
        if (column.Name.trim().length === 0) {
            findings.Warnings.push(`Output column ${column.Ordinal} has no name, so it has no field row. Give it an alias.`);
            continue;
        }
        const source = BindColumnSource(column.Source, index);
        facts.push({
            Name: column.Name, Sequence: facts.length + 1, SQLBaseType: column.SQLBaseType, SQLFullType: column.SQLFullType,
            IsNullable: column.IsNullable, IsComputed: column.IsComputed,
            SourceEntityID: source.SourceEntityID, SourceEntityFieldID: source.SourceEntityFieldID,
            SourceFieldName: source.SourceFieldName, SourceObjectName: source.SourceObjectName,
            DocDescription: analysis.FieldDocs.get(column.Name.toLowerCase()) ?? null, SourceDescription: source.SourceDescription,
        });
    }
    return facts;
}

function resultOf(input: QueryExtractionInput, analysis: TemplateAnalysis, fields: QueryFieldFact[] | null, findings: Findings, refusal: string | null): QueryExtractionResult {
    return {
        UsesTemplate: analysis.UsesTemplate,
        Refusal: refusal,
        Status: statusOf(findings),
        Messages: messagesOf(findings),
        Hash: ExtractionSQLHash(input.SQL, input.Platform),
        Fields: fields,
        Parameters: analysis.Parameters,
        Entities: analysis.Entities,
        Dependencies: analysis.Dependencies,
    };
}

function statusOf(findings: Findings): QueryExtractionStatus {
    if (findings.Errors.length > 0) return 'Error';
    return findings.Warnings.length > 0 ? 'Warning' : 'OK';
}

function messagesOf(findings: Findings): string[] {
    return [...findings.Errors, ...findings.Warnings, ...findings.Notes];
}
