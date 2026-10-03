/** Test helper: parse a session `Config` JSON string into a plain object. */
export function parseConfigObjectForTest(raw: string | null): Record<string, unknown> {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}
