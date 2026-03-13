import { EntityPermissionType, IRunViewProvider } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { Arg, Ctx, Query, Resolver, InputType, Field } from 'type-graphql';
import { MJEntity_, MJEntityResolverBase } from '../generated/generated.js';
import sql from 'mssql';
import { GetReadOnlyProvider } from '../util.js';

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
      IncludeSchemas && IncludeSchemas.length > 0 ? `SchemaName IN (${IncludeSchemas.map((s) => `'${s}'`).join(',')})` : '';
    const excludeSchemaSQL =
      ExcludeSchemas && ExcludeSchemas.length > 0 ? `SchemaName NOT IN (${ExcludeSchemas.map((s) => `'${s}'`).join(',')})` : '';
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
    const rv = provider as any as IRunViewProvider;
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
