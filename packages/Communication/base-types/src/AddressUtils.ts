/**
 * Email address-list parsing utilities for MemberJunction Communication providers.
 *
 * Inbound providers surface recipient lists in different shapes: MS Graph returns
 * structured recipient objects, while Gmail (and raw RFC 5322 sources generally)
 * return the raw `To:` / `Cc:` header value — a comma-separated list in which display
 * names may themselves contain commas inside double quotes
 * (e.g. `"Doe, Jane" <jane@example.com>, bob@example.com`).
 *
 * @module AddressUtils
 */

/**
 * Parses an RFC 5322 style address-list header value (`To:` / `Cc:` / `Bcc:`) into
 * bare email addresses.
 *
 * Handles:
 * - Quoted display names containing commas: `"Doe, Jane" <jane@x.com>` → `jane@x.com`
 * - Angle-bracket forms with unquoted names: `Jane Doe <jane@x.com>` → `jane@x.com`
 * - Bare addresses: `jane@x.com` → `jane@x.com`
 * - Empty / null / undefined input → `[]`
 * - Entries with no plausible address (nothing containing `@`) are dropped
 *
 * @param headerValue - the raw header value, or null/undefined when the header is absent
 * @returns bare email addresses, in original order
 */
export function parseEmailAddressList(headerValue: string | null | undefined): string[] {
    if (!headerValue || !headerValue.trim()) {
        return [];
    }
    return splitOutsideQuotes(headerValue)
        .map(extractEmailAddress)
        .filter((address): address is string => address !== null);
}

/**
 * Splits an address-list string on commas that fall outside double-quoted sections,
 * so quoted display names containing commas stay intact.
 */
function splitOutsideQuotes(value: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of value) {
        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if (ch === ',' && !inQuotes) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    parts.push(current);
    return parts;
}

/**
 * Extracts the bare email address from a single address-list entry.
 * Prefers the angle-bracket form (`Display Name <addr@host>`); falls back to
 * treating the whole entry as a bare address. Returns null when no plausible
 * address is present.
 */
function extractEmailAddress(entry: string): string | null {
    const trimmed = entry.trim();
    if (!trimmed) {
        return null;
    }
    const angleMatch = trimmed.match(/<([^<>]*)>\s*$/);
    const candidate = (angleMatch ? angleMatch[1] : trimmed).trim();
    return candidate.includes('@') ? candidate : null;
}
