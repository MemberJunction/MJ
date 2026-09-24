import type { WorkQueueTableName } from '../constants';
import { SqlParamList } from './SqlParamList';
import { QualifiedTable } from './sqlExecution';
import type { SqlBuilderContext, SqlParam, SqlStatement } from './WorkQueueSqlExecutor';
import type { WorkQueueProcedureName } from './procedures';

/** One procedure argument: the parameter's declared name and the value bound to it. */
export interface ProcedureParam {
    Name: string;
    Value: SqlParam;
}

/**
 * Renders calls to the `spWorkQueue*` procedures through the provider's dialect (plan 12 / CD9). Named arguments
 * on SQL Server (`EXEC [s].[p] @A=@p0, @B=@p1`), positional on PostgreSQL (`SELECT * FROM s."p"($1, $2)`), which
 * is the same shape the task graph's claim store uses — the call wrapper belongs to the dialect, so neither form
 * is spelled out here. Arguments are always given in the procedure's declared order so the positional form is
 * correct too.
 */
export abstract class ProcedureCallBuilder {
    constructor(protected readonly Context: SqlBuilderContext) {}

    protected Call(procedure: WorkQueueProcedureName, params: ProcedureParam[]): SqlStatement {
        const list = new SqlParamList(this.Context);
        const placeholders = params.map(param => {
            const placeholder = list.Add(param.Value);
            return this.Context.PlatformKey === 'postgresql' ? placeholder : `@${param.Name}=${placeholder}`;
        });
        return { SQL: this.Context.Dialect.ProcedureCallSyntax(this.Context.MJCoreSchemaName, procedure, placeholders), Params: list.Values };
    }

    /** For the rare raw statement (test-only helpers); never for a queue write. */
    protected Table(name: WorkQueueTableName): string {
        return QualifiedTable(this.Context, name);
    }

    protected NewParams(): SqlParamList {
        return new SqlParamList(this.Context);
    }

    protected Statement(sql: string, params: SqlParamList): SqlStatement {
        return { SQL: sql.trim(), Params: params.Values };
    }
}
