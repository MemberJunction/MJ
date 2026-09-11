/**
 * Apply-time warnings for DECLARED integration rows that an apply silently leaves out.
 *
 * An IntegrationObject / IntegrationObjectField is never deleted — a comprehensive rediscovery
 * that does not observe a declared row sets it `Status='Disabled'` instead (reversible on a later
 * discovery), and a schema-limit breach can do the same. The apply path then rebuilds its source
 * schema from ACTIVE rows only, so those rows simply are not in the schema it materializes: the
 * table appears without the column, or a requested object is not created at all, and nothing in
 * the apply output says why.
 *
 * The decision is kept pure here — the resolver supplies the rows and surfaces the strings — so it
 * is testable without standing up the resolver or the metadata provider, matching how
 * `decideAbsentDeactivations` and `ComputeRemovedDependencyWarnings` are factored.
 */

/** A row reduced to what the warning needs: its name and its lifecycle status. */
export type NamedStatusRow = { Name: string; Status: string | null };

export type InactiveRowWarningInput = {
    /**
     * The object names this apply asked for, exactly as requested. `null`/empty means "everything
     * active", in which case deactivated OBJECTS are not reported: a large catalog can legitimately
     * carry hundreds of them and announcing those on every apply is noise, not signal. Requested
     * objects are always reported, because the caller named them and got nothing.
     */
    RequestedNames?: string[] | null;
    /** Every object on the integration, active or not. */
    AllObjects: NamedStatusRow[];
    /**
     * Fields keyed by object name, for the objects this apply actually materializes. Only those
     * objects need their fields: a non-materialized object's fields are reported by the object
     * warning, not one line per field.
     */
    FieldsByObjectName: Record<string, NamedStatusRow[]>;
};

/**
 * Renders a name list for an operator-facing warning: every name when the list is short, and a
 * capped sample plus a count when it is not. Apply runs against catalogs with hundreds of objects,
 * so an uncapped list turns a useful warning into a wall of text nobody reads.
 */
export function SummarizeNames(names: string[], max = 12): string {
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')}, and ${names.length - max} more`;
}

const isActive = (row: NamedStatusRow): boolean => row.Status === 'Active';

/**
 * Builds the operator-facing warnings for declared rows this apply will not materialize.
 * Returns an empty array when everything declared and in scope is Active.
 */
export function ComputeInactiveRowWarnings(input: InactiveRowWarningInput): string[] {
    const warnings: string[] = [];
    const requested = input.RequestedNames && input.RequestedNames.length > 0
        ? new Set(input.RequestedNames.map(n => n.toLowerCase()))
        : null;

    if (requested) {
        const inactiveRequested = input.AllObjects
            .filter(o => requested.has(o.Name.toLowerCase()) && !isActive(o))
            .map(o => `${o.Name} (${o.Status ?? 'no status'})`);
        if (inactiveRequested.length > 0) {
            warnings.push(
                `${inactiveRequested.length} requested object(s) are not Active and were NOT materialized — ` +
                `${SummarizeNames(inactiveRequested)}. An object is deactivated (never deleted) when an ` +
                `authoritative rediscovery does not observe it, or when it exceeded a schema limit; re-run ` +
                `discovery against a source that exposes it, or re-enable it on MJ: Integration Objects.`,
            );
        }
    }

    for (const [objectName, fields] of Object.entries(input.FieldsByObjectName)) {
        const dropped = fields.filter(f => !isActive(f)).map(f => `${f.Name} (${f.Status ?? 'no status'})`);
        if (dropped.length === 0) continue;
        warnings.push(
            `${objectName}: ${dropped.length} declared field(s) are not Active and were NOT materialized — ` +
            `${SummarizeNames(dropped)}. A field is deactivated (never deleted) when an authoritative ` +
            `rediscovery does not observe it; re-run discovery against a source that exposes it, or re-enable ` +
            `it on MJ: Integration Object Fields.`,
        );
    }

    return warnings;
}
