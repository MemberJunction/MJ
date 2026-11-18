import type { RowFilterParameterBinder } from '@memberjunction/core';
import { NamedQueryParameter, TypedQueryParameter } from './typedQueryParameter.js';

/** One bound row-filter value, in the form the provider's driver binds. */
export type RowFilterBoundParameter = NamedQueryParameter | TypedQueryParameter;

/**
 * Collects the user values a RunView's row filter binds (#5713). The provider supplies how one value
 * becomes a placeholder and a parameter; the collector numbers them in the order the filter text
 * asks for them, one per occurrence, so the same filters always produce the same text and the
 * parameters line up with it.
 */
export class RowFilterParameterCollector implements RowFilterParameterBinder {
    /** The parameters, in placeholder order. */
    public readonly Parameters: RowFilterBoundParameter[] = [];

    constructor(
        private readonly create: (index: number, value: string) => { Placeholder: string; Parameter: RowFilterBoundParameter } | null,
    ) {}

    /** Records `value` and returns its placeholder, or null to keep it literal. */
    public Bind(_token: string, value: string): string | null {
        const made = this.create(this.Parameters.length, value);
        if (!made) {
            return null;
        }
        this.Parameters.push(made.Parameter);
        return made.Placeholder;
    }
}
