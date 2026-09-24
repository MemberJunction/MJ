import type { SqlBuilderContext, SqlParam } from './WorkQueueSqlExecutor';

/** Accumulates bound values and hands back the provider's placeholder for each. */
export class SqlParamList {
    private readonly values: SqlParam[] = [];

    constructor(private readonly context: Pick<SqlBuilderContext, 'BuildParameterPlaceholder'>) {}

    /** Binds a value and returns its placeholder. A placeholder may be repeated in the SQL text. */
    public Add(value: SqlParam): string {
        const placeholder = this.context.BuildParameterPlaceholder(this.values.length);
        this.values.push(value);
        return placeholder;
    }

    public get Values(): SqlParam[] {
        return [...this.values];
    }
}
