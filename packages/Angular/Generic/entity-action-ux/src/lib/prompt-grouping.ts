/**
 * @fileoverview Pure grouping/filtering for the AI-prompt selector. Extracted for unit-testability.
 * @module @memberjunction/ng-entity-action-ux
 */

/** A flat prompt option from the metadata view. */
export interface PromptOption { ID: string; Name: string; Category: string; }

/** A category group of prompts (preserves the encounter order of categories). */
export interface PromptGroup { Category: string; Prompts: PromptOption[]; }

/** Groups prompts by their category name (blank → "Uncategorized"), preserving input order. */
export function groupPromptsByCategory(prompts: PromptOption[]): PromptGroup[] {
    const groups: PromptGroup[] = [];
    const index = new Map<string, PromptGroup>();
    for (const p of prompts) {
        const category = p.Category || 'Uncategorized';
        let group = index.get(category);
        if (!group) {
            group = { Category: category, Prompts: [] };
            index.set(category, group);
            groups.push(group);
        }
        group.Prompts.push(p);
    }
    return groups;
}

/** Case-insensitive name filter that drops emptied groups. */
export function filterPromptGroups(groups: PromptGroup[], query: string): PromptGroup[] {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
        .map((g) => ({ Category: g.Category, Prompts: g.Prompts.filter((p) => p.Name.toLowerCase().includes(q)) }))
        .filter((g) => g.Prompts.length > 0);
}
