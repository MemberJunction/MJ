import type { EntityFormOverrideRow } from './form-resolver.service';

/** One entry in the toolbar's form picker. */
export interface FormVariantChoice {
    ID: string;
    Label: string;
    Scope: 'User' | 'Role' | 'Global';
    Status: 'Active' | 'Pending' | 'Inactive';
}

/**
 * The forms the picker offers, out of every override that applies to this user.
 *
 * Applying a custom form does not merge it into whatever was there before: the new form
 * becomes live and the previous one is set aside, both rows intact. So the set aside ones
 * belong in the picker — without them a user who applies a second form can never get back
 * to the first, and "swap" would mean "discard".
 *
 * Two kinds of row are left out. A `Pending` row is an unfinished draft an agent is still
 * iterating on, not a form anyone chose. And a set-aside row that shares its name with a
 * newer one is a superseded VERSION of the same form rather than a different form, so only
 * the newest of each name is offered; the older versions stay reachable through the form's
 * own version history.
 *
 * `rows` must arrive newest-first within each name, which is the order the resolver returns.
 */
export function FormVariantChoices(rows: readonly EntityFormOverrideRow[]): FormVariantChoice[] {
    const seenNames = new Set<string>();
    const choices: FormVariantChoice[] = [];
    for (const row of rows) {
        if (row.Status === 'Pending') continue;
        const label = row.Name?.trim() || `Override ${row.ID.substring(0, 8)}`;
        if (row.Status === 'Inactive') {
            const lineage = label.toLowerCase();
            if (seenNames.has(lineage)) continue;
            seenNames.add(lineage);
        } else {
            seenNames.add(label.toLowerCase());
        }
        choices.push({ ID: row.ID, Label: label, Scope: row.Scope, Status: row.Status });
    }
    return choices;
}
