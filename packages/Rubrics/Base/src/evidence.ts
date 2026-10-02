/** One quote the human scorer typed. Other evidence kinds keep their own Type. */
export interface QuoteEvidence {
    Type: 'Quote';
    Text: string;
}

/**
 * Evidence stored on a score. A typed list is kept. Plain text becomes one quote.
 * Empty text is null, not a string stuffed into the JSON column.
 */
export function EvidenceJson(value: unknown): string | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value.length === 0 ? null : JSON.stringify(value);
    const text = String(value).trim();
    if (!text) return null;
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text) as unknown;
            if (Array.isArray(parsed)) return parsed.length === 0 ? null : JSON.stringify(parsed);
        } catch {
            // The scorer typed a sentence that happens to start with a bracket.
        }
    }
    const quote: QuoteEvidence = { Type: 'Quote', Text: text };
    return JSON.stringify([quote]);
}
