/**
 * @fileoverview Generation prompt constants and builders for synthetic duplicates
 * and hard negatives.
 *
 * @module @memberjunction/integration-test-suite
 */

/**
 * System prompt instructing the model to generate a synthetic duplicate rewrite
 * of an existing entity record.
 */
export const DUPLICATE_GENERATION_SYSTEM_PROMPT =
    `You are an expert data generation system helping to benchmark duplicate detection algorithms. ` +
    `Your task is to take a source record and rewrite it exactly the way a person re-entering the SAME real-world entity would. ` +
    `The rewrite must represent the identical underlying entity or operation, but with realistic human data-entry variations:\n` +
    `- Typos, common abbreviations, and reordered words\n` +
    `- Shorter, abbreviated, or rephrased descriptions\n` +
    `- Alternative casing, punctuation, and spacing\n` +
    `Vary the intensity between light variations (e.g. minor typo or casing difference) and heavy rewrites (e.g. colloquial abbreviations and concise description).\n\n` +
    `STRICT OUTPUT FORMAT:\n` +
    `Respond ONLY with a valid JSON object containing exactly the requested fields. ` +
    `Do not include markdown code fences, comments, or any keys other than the requested fields. ` +
    `Every requested field must have a non-empty string value.`;

/**
 * System prompt instructing the model to generate a synthetic hard negative
 * (a distinct new entity plausibly similar to a source record).
 */
export const HARD_NEGATIVE_GENERATION_SYSTEM_PROMPT =
    `You are an expert data generation system helping to benchmark duplicate detection algorithms. ` +
    `Your task is to generate a NEW, DISTINCT record that is plausibly similar to a source record, but represents a clearly DIFFERENT entity or operation (a hard negative).\n` +
    `Examples of plausible hard negatives:\n` +
    `- The same operation for a different vendor, system, or target (e.g. "Create Salesforce Lead" vs "Create HubSpot Lead")\n` +
    `- A different operation within the same domain or vendor (e.g. "Send Slack Message" vs "Archive Slack Channel")\n` +
    `- A distinct business entity with overlapping keywords or domain terminology\n` +
    `It must NOT be a duplicate of the source record, but must share enough context that a naive similarity search might surface it.\n\n` +
    `STRICT OUTPUT FORMAT:\n` +
    `Respond ONLY with a valid JSON object containing exactly the requested fields. ` +
    `Do not include markdown code fences, comments, or any keys other than the requested fields. ` +
    `Every requested field must have a non-empty string value.`;

/**
 * Builds the user prompt for duplicate rewrite generation.
 *
 * @param entityName The name of the entity (e.g. 'MJ: Actions').
 * @param sourceValues The source record's field values.
 * @param fields The list of fields to include in the output.
 */
export function BuildDuplicateUserPrompt(
    entityName: string,
    sourceValues: Record<string, unknown>,
    fields: readonly string[]
): string {
    const sourceSummary = fields
        .map(f => `${f}: ${JSON.stringify(sourceValues[f] ?? '')}`)
        .join('\n');

    return (
        `Entity: "${entityName}"\n\n` +
        `Source Record Fields:\n${sourceSummary}\n\n` +
        `Instructions:\n` +
        `Rewrite the source record above as a human re-entry of the SAME entity.\n` +
        `Your JSON output MUST contain exactly these keys: ${fields.map(f => `"${f}"`).join(', ')}.\n` +
        `Ensure each field value is a non-empty string.`
    );
}

/**
 * Builds the user prompt for hard negative (new record) generation.
 *
 * @param entityName The name of the entity (e.g. 'MJ: Actions').
 * @param sourceValues The near source record's field values.
 * @param fields The list of fields to include in the output.
 */
export function BuildHardNegativeUserPrompt(
    entityName: string,
    sourceValues: Record<string, unknown>,
    fields: readonly string[]
): string {
    const sourceSummary = fields
        .map(f => `${f}: ${JSON.stringify(sourceValues[f] ?? '')}`)
        .join('\n');

    return (
        `Entity: "${entityName}"\n\n` +
        `Reference Record Fields:\n${sourceSummary}\n\n` +
        `Instructions:\n` +
        `Generate a NEW, DIFFERENT record in "${entityName}" that is plausibly similar in topic/domain to the reference record above, but represents a clearly DIFFERENT entity or action.\n` +
        `Your JSON output MUST contain exactly these keys: ${fields.map(f => `"${f}"`).join(', ')}.\n` +
        `Ensure each field value is a non-empty string.`
    );
}
