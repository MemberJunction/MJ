/**
 * TableNormalizer — one LLM call per TABLE (not per column), upstream of embedding.
 *
 * For each in-scope table, a single LLM call sees:
 *   - The table's name + description + sibling columns
 *   - Every column's identity + description + sample values + FK/PK status
 *
 * The call returns one normalized entry per column with:
 *   - conceptName            : canonical snake_case (`email_address`, `customer_id`, ...)
 *   - normalizationStrategy  : how values should be compared
 *   - normalizedDescription  : business-concept-focused, system-agnostic sentence
 *   - isUsefulOrganicKey     : false for audit/system/free-form (filtered out)
 *   - confidence + reasoning
 *
 * Why per-table instead of per-column:
 *   - Fewer calls (5K cols across 500 tables → 500 calls instead of 5K). At
 *     Gemini Flash pricing, that's ~$0.04 instead of ~$0.20 for APTIFY-scale.
 *   - System prompt amortizes across all columns in the table.
 *   - The LLM sees siblings as context — knowing the table has FirstName + LastName
 *     next to an Email column reveals it's a person email, not a server hostname.
 *   - More token-efficient: one JSON array out instead of N independent objects.
 *
 * The single most important constraint: same-concept columns from DIFFERENT
 * TABLES (across systems) must produce the same conceptName and a similar
 * normalizedDescription so the embedding step naturally clusters them. The
 * prompt enforces this via a canonical concept-name list.
 */

import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { createLLMInstance } from '../utils/llm-factory.js';
import { AIConfig } from '../types/config.js';
import { OrganicKeyNormalizationStrategy } from '../types/organic-keys.js';
import { cleanAndParseJSON } from '../utils/json.js';

/** One column's input to the normalizer. */
export interface NormalizerInputColumn {
    schema: string;
    table: string;
    column: string;
    dataType: string;
    /** Original LLM-generated description from DBAutoDoc's prior analysis pass. */
    originalDescription: string;
    /** Sample values from the column's actual data. */
    sampleValues: string[];
    /** Whether the column participates in any FK (declared or detected). */
    participatesInFK: boolean;
    fkTarget?: { schema: string; table: string; column: string } | null;
    isPrimaryKey: boolean;
}

/** All columns of one table, batched for a single LLM call. */
export interface TableNormalizationInput {
    schema: string;
    schemaDescription?: string;
    table: string;
    tableDescription?: string;
    columns: NormalizerInputColumn[];
}

/** One column's normalized output. */
export interface NormalizedColumn extends NormalizerInputColumn {
    conceptName: string;
    normalizationStrategy: OrganicKeyNormalizationStrategy;
    customNormalizationExpression?: string;
    normalizedDescription: string;
    isUsefulOrganicKey: boolean;
    confidence: number;
    reasoning: string;
}

/** Aggregate result of normalizing many tables. */
export interface NormalizationBatchResult {
    /** Useful organic-key columns surviving normalization (filtered to isUsefulOrganicKey=true). */
    normalized: NormalizedColumn[];
    /** Columns the normalizer marked isUsefulOrganicKey=false (audit, free-form, etc.). */
    rejected: number;
    /** Tables where the LLM call failed entirely. */
    errors: number;
    tokens: { total: number; input: number; output: number };
}

export interface NormalizerOptions {
    /** Concurrency for per-table LLM calls. Default 8. */
    concurrency?: number;
    /** Max retries per table on transient failures. Default 2. */
    maxRetries?: number;
    /** Progress callback (done count, total count). */
    onProgress?: (done: number, total: number) => void;
}

export class TableNormalizer {
    private readonly llm: BaseLLM;

    constructor(private readonly aiConfig: AIConfig) {
        this.llm = createLLMInstance(aiConfig.provider, aiConfig.apiKey);
    }

    /** Normalize one table — one LLM call returning per-column entries. */
    public async normalizeTable(
        input: TableNormalizationInput,
        maxRetries = 2,
    ): Promise<{
        normalized: NormalizedColumn[];
        tokens: { total: number; input: number; output: number };
        errorMessage?: string;
    }> {
        if (input.columns.length === 0) {
            return { normalized: [], tokens: { total: 0, input: 0, output: 0 } };
        }

        const userPrompt = buildUserPrompt(input);
        const params: ChatParams = {
            model: this.aiConfig.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: this.aiConfig.temperature ?? 0,
            maxOutputTokens: this.aiConfig.maxTokens,
            responseFormat: 'JSON',
        };

        let lastError = '';
        let cumTokens = { total: 0, input: 0, output: 0 };
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let result: ChatResult | undefined;
            try {
                result = await this.llm.ChatCompletion(params);
            } catch (err) {
                lastError = `LLM call threw: ${(err as Error).message}`;
                continue;
            }
            if (!result.success) {
                lastError = `LLM call failed: ${result.errorMessage ?? 'unknown'}`;
                continue;
            }

            const content = result.data?.choices?.[0]?.message?.content ?? '';
            const usage = result.data?.usage;
            cumTokens = {
                total: cumTokens.total + (usage?.totalTokens ?? 0),
                input: cumTokens.input + (usage?.promptTokens ?? 0),
                output: cumTokens.output + (usage?.completionTokens ?? 0),
            };

            let parsed: LLMTableResponse | null = null;
            try {
                parsed = cleanAndParseJSON<LLMTableResponse>(content);
            } catch (err) {
                lastError = `JSON parse threw: ${(err as Error).message}. Content prefix: ${content.slice(0, 200)}`;
                if (attempt < maxRetries) continue;
                return { normalized: [], tokens: cumTokens, errorMessage: lastError };
            }
            if (!parsed || !Array.isArray(parsed.columns)) {
                lastError = `JSON parse returned bad shape. Content prefix: ${content.slice(0, 200)}`;
                if (attempt < maxRetries) continue;
                return { normalized: [], tokens: cumTokens, errorMessage: lastError };
            }

            // Match the LLM's response entries back to input columns by name.
            const byName = new Map(input.columns.map((c) => [c.column.toLowerCase(), c]));
            const normalized: NormalizedColumn[] = [];
            for (const entry of parsed.columns) {
                if (!entry || typeof entry.column !== 'string') continue;
                const inputCol = byName.get(entry.column.toLowerCase());
                if (!inputCol) continue; // LLM hallucinated a column name; skip
                normalized.push({
                    ...inputCol,
                    conceptName: entry.conceptName ?? '',
                    normalizationStrategy: entry.normalizationStrategy ?? 'LowerCaseTrim',
                    customNormalizationExpression: sanitizePlaceholder(entry.customNormalizationExpression),
                    normalizedDescription: entry.normalizedDescription ?? '',
                    isUsefulOrganicKey: !!entry.isUsefulOrganicKey,
                    confidence: clamp01(entry.confidence),
                    reasoning: entry.reasoning ?? '',
                });
            }
            return { normalized, tokens: cumTokens };
        }
        return { normalized: [], tokens: cumTokens, errorMessage: lastError || 'unknown failure after retries' };
    }

    /** Batch normalize many tables with bounded concurrency. */
    public async normalizeAll(
        tables: TableNormalizationInput[],
        opts: NormalizerOptions = {},
    ): Promise<NormalizationBatchResult> {
        const concurrency = Math.max(1, opts.concurrency ?? 8);
        const maxRetries = Math.max(0, opts.maxRetries ?? 2);

        const allNormalized: NormalizedColumn[] = [];
        let rejected = 0;
        let errors = 0;
        let total = 0;
        let input = 0;
        let output = 0;
        let completed = 0;

        let cursor = 0;
        const runners = Array.from({ length: concurrency }, async () => {
            while (true) {
                const idx = cursor++;
                if (idx >= tables.length) return;
                const r = await this.normalizeTable(tables[idx], maxRetries);
                total += r.tokens.total;
                input += r.tokens.input;
                output += r.tokens.output;

                if (r.errorMessage) {
                    errors++;
                } else {
                    for (const n of r.normalized) {
                        if (n.isUsefulOrganicKey) allNormalized.push(n);
                        else rejected++;
                    }
                }
                completed++;
                opts.onProgress?.(completed, tables.length);
            }
        });
        await Promise.all(runners);
        return { normalized: allNormalized, rejected, errors, tokens: { total, input, output } };
    }
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are translating database columns into a NORMALIZED BUSINESS-CONCEPT REPRESENTATION
for organic-key detection per MemberJunction PR #2193.

═══ PR #2193 — WHAT AN ORGANIC KEY IS ═══

An organic key is a column whose value can be used to MATCH two rows that
refer to the SAME real-world entity, WITHOUT going through a declared foreign
key. PR #2193 lets the framework "join by value" wherever the schema lacks an
explicit FK link (cross-system data, late-bound integrations, denormalized
warehouses, partial schemas).

KEEP a column as an organic-key candidate when this test passes:

  "If I take two rows that have the same value in this column, do they
   refer to the SAME real-world entity (the same customer, the same person,
   the same order, the same product, the same location, the same legal
   entity, the same communication endpoint)?"

This test is SATISFIED by:
  - Customer / member / employee / person / company / product / order IDs —
    natural OR surrogate. Within a database an EmployeeID of 42 in one table
    DOES refer to the same employee as EmployeeID 42 in another table. That
    is the WHOLE POINT of PR #2193 — these are the matches it makes navigable.
  - Email addresses, phone numbers, fax numbers, URLs.
  - Tax IDs, social security numbers, account numbers, license numbers.
  - ISBNs, SKUs, product codes, part numbers.
  - Postal codes, street addresses, geocodes (they identify a delivery point
    or location entity).
  - Full names, first names, last names, organization names — identifiers of
    persons or organizations even when fuzzy.

FK columns are EXPLICITLY ALLOWED. PR #2193 organic keys often overlap with
FK columns by design — the same EmployeeID that's a declared FK in one table
is the organic match key for tables where the FK isn't declared. Do not
disqualify a column just because it participates in a FK.

REJECT (isUsefulOrganicKey=false) ONLY in these cases:

  - Categorical / enum-like values with a small fixed vocabulary (status =
    'Active'/'Pending'/'Closed'; type = 'A'/'B'/'C'; region code = 'NA'/'EMEA';
    country code = 'US'/'UK'/'FR'). Two rows sharing status='Active' do NOT
    refer to the same real-world entity — they're just both active.

  - Booleans / flags (IsActive, HasDiscount).

  - Measurements, quantities, prices, percentages, aggregates (price, qty,
    discount, count, score, weight).

  - Audit metadata (created_at, modified_by, version, row_version, rowguid,
    last_login_at).

  - Free-form descriptive text (notes, comments, description paragraphs,
    long-text fields).

  - System paths / blob references (photo_path, file_url, attachment_uri)
    when they're pointers to assets rather than the asset's identity.

DO NOT REJECT a column just because:
  - It is auto-increment (auto-increment IDs are still valid organic keys
    across tables in the same system).
  - It is a foreign key (FKs are valid organic keys, see above).
  - It "identifies a location, not the parent row's entity" (a postal code
    DOES identify a delivery location entity, which is a valid organic-key
    use; clustering will decide whether it's useful).
  - Names "could collide" (low uniqueness lowers confidence but does NOT
    disqualify — names are valid organic-key candidates per PR #2193).

═══ YOUR TASK ═══

For each column you receive, produce a JSON object with these fields. Look at
the sibling columns and the table's purpose for context — they often clarify
whether a value identifies or categorizes.

1. normalizedDescription — A STRUCTURED BUSINESS-FOCUSED SENTENCE that any
   reader (or embedding model) can use to recognize this kind of value. Use
   this exact structural template:

     "<value-kind> identifying <entity-kind>; <normalization rule>."

   Example shapes:
     "RFC-5322 email address identifying a natural person; case-insensitive
      whitespace-trimmed equality."
     "E.164 phone number identifying a person or organization; digits-only
      equality after stripping formatting."
     "Customer identifier (auto-increment or business code) identifying a
      customer entity across tables; exact equality after trimming."
     "Employee identifier identifying an employee across HR tables; exact
      equality."
     "Postal / ZIP code identifying a delivery area; exact equality after
      trimming."
     "Family name (last name) identifying a natural person; case-insensitive
      whitespace-trimmed equality."

   For REJECTED columns, the template flips:
     "ISO-3166 country code (categorical, 250 buckets); not an entity
      identifier; not applicable."
     "Order line quantity (measurement); not an entity identifier; not
      applicable."
     "Modification timestamp (audit metadata); not applicable."

   Same-concept columns from different tables MUST produce highly similar
   normalizedDescription strings so they cluster geometrically. Generic prose
   ("a code", "an identifier") is NOT acceptable — name the value kind
   (email address, phone number, customer id, postal code, family name, etc.)
   and the entity kind explicitly.

2. conceptName — A canonical snake_case label for this value kind
   (e.g. "email_address", "phone_number", "postal_code", "customer_id",
   "employee_id", "person_family_name"). Use the same name for the same
   concept across tables. Used as a cluster label hint downstream.

3. normalizationStrategy — How equality should be tested at match time:
     "LowerCaseTrim"  (default for case-insensitive text)
     "Trim"           (whitespace only)
     "ExactMatch"     (codes, IDs that are case-sensitive)
     "Custom"         (provide customNormalizationExpression — a SQL expression
                      that MUST use the literal placeholder {{FieldName}} where the
                      column reference goes, e.g.
                      REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', ''). Do NOT use
                      'value', 'x', or a column name — only {{FieldName}}.)

4. isUsefulOrganicKey — Apply the test at the top of the prompt:
   "If I take two rows with the same value in this column, do they refer to
   the SAME real-world entity?" True for IDs, emails, phones, names,
   addresses, codes that are entity-level. False ONLY for categorical
   enums, booleans, measurements, audit metadata, free-form text, and
   asset paths.

5. confidence — 0.0 to 1.0. Reflect uncertainty honestly; sample values that
   contradict the column name should lower confidence even if you commit to
   a judgment.

6. reasoning — One short sentence stating why this kind of value satisfies
   or fails the test in field 4.

Sample values are the strongest signal. If the column is named "Status" but
samples are all distinct uuid-like tokens, trust the data over the name.

Output STRICT JSON only, no markdown fences:
{
  "columns": [
    {
      "column": "<exact column name from input>",
      "conceptName": "snake_case_name",
      "normalizationStrategy": "LowerCaseTrim" | "Trim" | "ExactMatch" | "Custom",
      "customNormalizationExpression": "...",
      "normalizedDescription": "<structured sentence per template above>",
      "isUsefulOrganicKey": true,
      "confidence": 0.95,
      "reasoning": "One short sentence."
    }
  ]
}

Include EVERY column from the input, in the same order. Match the "column" field
exactly to the input column name.`;

/**
 * Normalize whatever column placeholder the LLM used in a Custom expression to the
 * canonical {{FieldName}} token that CodeGen + the PR #2193 runtime substitute. The
 * prompt asks for {{FieldName}}, but models frequently emit `value`, `x`, `col`, or
 * `column` instead — this guards against the resulting silent runtime breakage where
 * the literal placeholder would survive into the executed SQL.
 */
function sanitizePlaceholder(expr: string | undefined): string | undefined {
    if (!expr) return expr;
    let out = expr;
    // Already correct — leave alone.
    if (/\{\{\s*FieldName\s*\}\}/.test(out)) {
        return out.replace(/\{\{\s*FieldName\s*\}\}/g, '{{FieldName}}');
    }
    // Replace common standalone placeholder identifiers (word-boundary, not inside quotes).
    // Order matters: longer tokens first.
    for (const token of ['column', 'value', 'col', 'x']) {
        const re = new RegExp(`\\b${token}\\b`, 'g');
        if (re.test(out)) {
            out = out.replace(re, '{{FieldName}}');
            break; // only the first matching convention is the placeholder
        }
    }
    return out;
}



// ─── Internal types ─────────────────────────────────────────────────────────

interface LLMColumnEntry {
    column: string;
    conceptName: string;
    normalizationStrategy: OrganicKeyNormalizationStrategy;
    customNormalizationExpression?: string;
    normalizedDescription: string;
    isUsefulOrganicKey: boolean;
    confidence: number;
    reasoning: string;
}

interface LLMTableResponse {
    columns: LLMColumnEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildUserPrompt(input: TableNormalizationInput): string {
    const lines: string[] = [];
    lines.push(`Table: ${input.schema}.${input.table}`);
    if (input.schemaDescription) lines.push(`Schema purpose: ${truncate(input.schemaDescription, 240)}`);
    if (input.tableDescription) lines.push(`Table purpose:  ${truncate(input.tableDescription, 240)}`);
    lines.push('');
    lines.push(`Columns (${input.columns.length}):`);
    for (const c of input.columns) {
        lines.push(`  - ${c.column}  [${c.dataType}]${c.isPrimaryKey ? '  PK' : ''}${c.participatesInFK ? `  FK${c.fkTarget ? `→${c.fkTarget.schema}.${c.fkTarget.table}.${c.fkTarget.column}` : ''}` : ''}`);
        if (c.originalDescription) lines.push(`      description: ${truncate(c.originalDescription, 240)}`);
        if (c.sampleValues && c.sampleValues.length > 0) {
            const samples = c.sampleValues
                .slice(0, 5)
                .map((v) => JSON.stringify(truncate(String(v), 80)))
                .join(', ');
            lines.push(`      samples: [${samples}]`);
        }
    }
    lines.push('');
    lines.push('Output the normalized JSON per the system prompt — one entry per column, in order.');
    return lines.join('\n');
}

function clamp01(x: number): number {
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}

function truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
