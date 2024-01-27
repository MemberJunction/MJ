import { EntityPermissionType } from '@memberjunction/core';
import { AppContext } from '../types';
import { Arg, Ctx, Query, Resolver, InputType, Field } from 'type-graphql';
import { Entity_, EntityResolverBase } from '../generated/generated';



@Resolver(Entity_)
export class EntityResolver extends EntityResolverBase {
  @Query(() => [Entity_])
  EntitiesBySchemas(
    @Ctx() { dataSource, userPayload }: AppContext,
    @Arg('IncludeSchemas', () => [String], { nullable: true }) IncludeSchemas?: string[],
    @Arg('ExcludeSchemas', () => [String], { nullable: true }) ExcludeSchemas?: string[]
  ) {
    this.CheckUserReadPermissions('Entities', userPayload);
    const rlsWhere = this.getRowLevelSecurityWhereClause('Entities', userPayload, EntityPermissionType.Read, ' WHERE');
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
    if (schemaSQL) totalWhere = ` WHERE ${schemaSQL}`;
    if (rlsWhere) {
      if (totalWhere) totalWhere = `${totalWhere} AND ${rlsWhere}`;
      else totalWhere = ` WHERE ${rlsWhere}`;
    }
    const sSQL = `SELECT * FROM [${this.MJCoreSchema}].vwEntities${totalWhere}`;
    return dataSource.query(sSQL);
  }
}
