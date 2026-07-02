import { EntityPermissionType, IRunViewProvider } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { Arg, Ctx, Query, Resolver } from 'type-graphql';
import { MJEntity_, MJEntityResolverBase } from '../generated/generated.js';
import { GetReadOnlyProvider } from '../util.js';

const VALID_SCHEMA_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function sanitizeSchemaNames(names: string[]): string[] {
  return names.filter((s) => VALID_SCHEMA_NAME.test(s));
}

function buildSchemaInClause(columnName: string, schemas: string[], negate: boolean): string {
  const sanitized = sanitizeSchemaNames(schemas);
  if (sanitized.length === 0) return '';
  const operator = negate ? 'NOT IN' : 'IN';
  return `${columnName} ${operator} (${sanitized.map((s) => `'${s}'`).join(',')})`;
}

@Resolver(MJEntity_)
export class EntityResolver extends MJEntityResolverBase {
  @Query(() => [MJEntity_])
  async EntitiesBySchemas(
    @Ctx() { providers, userPayload }: AppContext,
    @Arg('IncludeSchemas', () => [String], { nullable: true }) IncludeSchemas?: string[],
    @Arg('ExcludeSchemas', () => [String], { nullable: true }) ExcludeSchemas?: string[]
  ) {
    this.CheckUserReadPermissions('Entities', userPayload);
    const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
    const rlsWhere = this.getRowLevelSecurityWhereClause(provider, 'Entities', userPayload, EntityPermissionType.Read, ' WHERE');
    const includeSchemaSQL =
      IncludeSchemas && IncludeSchemas.length > 0 ? buildSchemaInClause('SchemaName', IncludeSchemas, false) : '';
    const excludeSchemaSQL =
      ExcludeSchemas && ExcludeSchemas.length > 0 ? buildSchemaInClause('SchemaName', ExcludeSchemas, true) : '';
    let schemaSQL = '';
    if (includeSchemaSQL) schemaSQL = includeSchemaSQL;
    if (excludeSchemaSQL) {
      if (schemaSQL) schemaSQL = `${schemaSQL} AND ${excludeSchemaSQL}`;
      else schemaSQL = excludeSchemaSQL;
    }
    let totalWhere = '';
    if (schemaSQL) totalWhere = `${schemaSQL}`;
    if (rlsWhere) {
      if (totalWhere) totalWhere = `${totalWhere} AND ${rlsWhere}`;
      else totalWhere = ` ${rlsWhere}`;
    }
    const rv = provider as IRunViewProvider;
    const result = await rv.RunView({
      EntityName: 'MJ: Entities',
      ExtraFilter: totalWhere,
    }, userPayload.userRecord);
    if (result && result.Success) {
      return result.Results;
    }
    else {
      throw new Error(`Failed to fetch entities: ${result?.ErrorMessage || 'Unknown error'}`);
    }
  }
}
