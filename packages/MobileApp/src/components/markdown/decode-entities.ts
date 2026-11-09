const MARKED_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
};

/** Decode the handful of HTML entities marked may emit in token text. */
export function decodeEntities(text: string): string {
    // One pass, so a decoded '&' never starts a second entity (&amp;lt; -> &lt;, not <)
    return text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => MARKED_ENTITIES[entity]);
}
