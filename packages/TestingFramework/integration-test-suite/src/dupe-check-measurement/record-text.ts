/**
 * @fileoverview The rule for spotting record text in the measurement's outputs, which hold IDs and
 * scores only.
 *
 * @module @memberjunction/integration-test-suite
 */

/**
 * Whether a text is distinctive enough to count as record text: longer than five characters and
 * not an ID. Trivial values ("true", numbers, short words) would match by chance.
 */
export function IsDistinctiveRecordText(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.length > 5 && !/^[0-9a-f-]{10,}$/i.test(trimmed);
}

/** The first distinctive record text found in the content, case-insensitively, or null. */
export function FindRecordText(content: string, recordTexts: readonly string[]): string | null {
    const lowerContent = content.toLowerCase();
    for (const text of recordTexts) {
        const trimmed = String(text).trim();
        if (IsDistinctiveRecordText(trimmed) && lowerContent.includes(trimmed.toLowerCase())) {
            return trimmed;
        }
    }
    return null;
}

/** Whether the content contains any distinctive record text. */
export function ContainsRecordText(content: string, recordTexts: readonly string[]): boolean {
    return FindRecordText(content, recordTexts) !== null;
}
