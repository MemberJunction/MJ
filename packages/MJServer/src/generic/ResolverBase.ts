import { EntityPermissionType, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { AuditLogEntity, UserViewEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { PubSubEngine } from 'type-graphql';
import { DataSource } from 'typeorm';

import { UserPayload } from '../types';
import { RunDynamicViewInput, RunViewByIDInput, RunViewByNameInput } from './RunViewResolver';

export class ResolverBase {

  protected MapFieldNamesToCodeNames(entityName: string, dataObject: any) {
    // for the given entity name provided, check to see if there are any fields
    // where the code name is different from the field name, and for just those
    // fields, iterate through the dataObject and REPLACE the property that has the field name
    // with the CodeName, because we can't transfer those via GraphQL as they are not
    // valid property names in GraphQL
    if (dataObject) {
      const md = new Metadata();
      const entityInfo = md.Entities.find((e) => e.Name === entityName);
      if (!entityInfo) 
        throw new Error(`Entity ${entityName} not found in metadata`);
      const fields = entityInfo.Fields.filter((f) => f.Name !== f.CodeName);
      fields.forEach((f) => {
        if (dataObject.hasOwnProperty(f.Name)) {
          dataObject[f.CodeName] = dataObject[f.Name];
          delete dataObject[f.Name];
        }
      });  
    }
    return dataObject;
  }

  protected ArrayMapFieldNamesToCodeNames(entityName: string, dataObjectArray: []) {
    // iterate through the array and call MapFieldNamesToCodeNames for each element
    if (dataObjectArray && dataObjectArray.length > 0) {
      dataObjectArray.forEach((element) => {
        this.MapFieldNamesToCodeNames(entityName, element);
      });  
    }
    return dataObjectArray;
  }

  protected async findBy(dataSource: DataSource, entity: string, params: any) {
    // build the SQL query based on the params passed in
    const md = new Metadata();
    const e = md.Entities.find((e) => e.Name === entity);
    if (!e) throw new Error(`Entity ${entity} not found in metadata`);
    // now build a SQL string using the entityInfo and using the properties in the params object
    let sql = `SELECT * FROM ${e.SchemaName}.${e.BaseView} WHERE `;
    const keys = Object.keys(params);
    keys.forEach((k, i) => {
      if (i > 0) sql += ' AND ';
      // look up the field in the entityInfo to see if it needs quotes
      const field = e.Fields.find((f) => f.Name === k);
      if (!field) throw new Error(`Field ${k} not found in entity ${entity}`);
      const quotes = field.NeedsQuotes ? "'" : '';
      sql += `${k} = ${quotes}${params[k]}${quotes}`;
    });

    // ok, now we have a SQL string, run it and return the results
    const result = await dataSource.query(sql);
    return result;
  }

  async RunViewByNameGeneric(viewInput: RunViewByNameInput, dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      const viewInfo: UserViewEntity = this.safeFirstArrayElement(await this.findBy(dataSource, 'User Views', { Name: viewInput.ViewName }));;
      return this.RunViewGenericInternal(
        viewInfo,
        dataSource,
        viewInput.ExtraFilter,
        viewInput.OrderBy,
        viewInput.UserSearchString,
        viewInput.ExcludeUserViewRunID,
        viewInput.OverrideExcludeFilter,
        viewInput.SaveViewResults,
        viewInput.Fields,
        viewInput.IgnoreMaxRows,
        viewInput.ExcludeDataFromAllPriorViewRuns,
        viewInput.ForceAuditLog,
        viewInput.AuditLogDescription,
        userPayload,
        pubSub
      );
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async RunViewByIDGeneric(viewInput: RunViewByIDInput, dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      const viewInfo: UserViewEntity = this.safeFirstArrayElement(await this.findBy(dataSource, 'User Views', { ID: viewInput.ViewID }));
      return this.RunViewGenericInternal(
        viewInfo,
        dataSource,
        viewInput.ExtraFilter,
        viewInput.OrderBy,
        viewInput.UserSearchString,
        viewInput.ExcludeUserViewRunID,
        viewInput.OverrideExcludeFilter,
        viewInput.SaveViewResults,
        viewInput.Fields,
        viewInput.IgnoreMaxRows,
        viewInput.ExcludeDataFromAllPriorViewRuns,
        viewInput.ForceAuditLog,
        viewInput.AuditLogDescription,
        userPayload,
        pubSub
      );
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async RunDynamicViewGeneric(viewInput: RunDynamicViewInput, dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      const md = new Metadata();
      const entity = md.Entities.find((e) => e.Name === viewInput.EntityName);
      if (!entity) throw new Error(`Entity ${viewInput.EntityName} not found in metadata`);

      const viewInfo: UserViewEntity = {
        ID: -1,
        Entity: viewInput.EntityName,
        EntityID: entity.ID as number,
        EntityBaseView: entity.BaseView as string,
      } as UserViewEntity; // only providing a few bits of data here, but it's enough to get the view to run

      return this.RunViewGenericInternal(
        viewInfo,
        dataSource,
        viewInput.ExtraFilter,
        viewInput.OrderBy,
        viewInput.UserSearchString,
        viewInput.ExcludeUserViewRunID,
        viewInput.OverrideExcludeFilter,
        false,
        viewInput.Fields,
        viewInput.IgnoreMaxRows,
        false,
        viewInput.ForceAuditLog,
        viewInput.AuditLogDescription,
        userPayload,
        pubSub
      );
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  protected CheckUserReadPermissions(entityName: string, userPayload: UserPayload | null) {
    const md = new Metadata();
    const entityInfo = md.Entities.find((e) => e.Name === entityName);
    if (!userPayload) throw new Error(`userPayload is null`);

    // first check permissions, the logged in user must have read permissions on the entity to run the view
    if (entityInfo) {
      const userInfo = UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload.email.toLowerCase().trim()); // get the user record from MD so we have ROLES attached, don't use the one from payload directly
      if (!userInfo) throw new Error(`User ${userPayload.email} not found in metadata`);

      const userPermissions = entityInfo.GetUserPermisions(userInfo);
      if (!userPermissions.CanRead) throw new Error(`User ${userPayload.email} does not have read permissions on ${entityInfo.Name}`);
    } else throw new Error(`Entity not found in metadata`);
  }

  protected async RunViewGenericInternal(
    viewInfo: UserViewEntity,
    dataSource: DataSource,
    extraFilter: string,
    orderBy: string,
    userSearchString: string,
    excludeUserViewRunID: number | undefined,
    overrideExcludeFilter: string | undefined,
    saveViewResults: boolean | undefined,
    fields: string[] | undefined,
    ignoreMaxRows: boolean | undefined,
    excludeDataFromAllPriorViewRuns: boolean | undefined,
    forceAuditLog: boolean | undefined,
    auditLogDescription: string | undefined,
    userPayload: UserPayload | null,
    pubSub: PubSubEngine
  ) {
    try {
      if (viewInfo && userPayload) {
        const md = new Metadata();
        const user = UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
        if (!user) throw new Error(`User ${userPayload?.email} not found in metadata`);

        const entityInfo = md.Entities.find((e) => e.Name === viewInfo.Entity);
        if (!entityInfo) throw new Error(`Entity ${viewInfo.Entity} not found in metadata`);

        const rv = new RunView();
        const result = await rv.RunView(
          {
            ViewID: viewInfo.ID,
            ViewName: viewInfo.Name,
            EntityName: viewInfo.Entity,
            ExtraFilter: extraFilter,
            OrderBy: orderBy,
            Fields: fields,
            UserSearchString: userSearchString,
            ExcludeUserViewRunID: excludeUserViewRunID,
            OverrideExcludeFilter: overrideExcludeFilter,
            SaveViewResults: saveViewResults,
            ExcludeDataFromAllPriorViewRuns: excludeDataFromAllPriorViewRuns,
            IgnoreMaxRows: ignoreMaxRows,
            ForceAuditLog: forceAuditLog,
            AuditLogDescription: auditLogDescription,
          },
          user
        );
        return result;
      } else return null;
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  protected async createRecordAccessAuditLogRecord(userPayload: UserPayload, entityName: string, recordId: any): Promise<any> {
    try {
      const md = new Metadata();
      const entityInfo = md.Entities.find((e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
      if (!entityInfo) throw new Error(`Entity ${entityName} not found in metadata`);

      if (entityInfo.AuditRecordAccess) {
        const userInfo = UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
        const auditLogTypeName = 'Record Accessed';
        const auditLogType = md.AuditLogTypes.find((a) => a.Name.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase());

        if (!userInfo) throw new Error(`User ${userPayload?.email} not found in metadata`);
        if (!auditLogType) throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

        return await this.createAuditLogRecord(userPayload, null, auditLogTypeName, 'Success', null, entityInfo.ID, recordId);
      }
    } catch (e) {
      console.log(e);
    }
  }

  protected getRowLevelSecurityWhereClause(entityName: string, userPayload: UserPayload, type: EntityPermissionType, returnPrefix: string) {
    const md = new Metadata();
    const entityInfo = md.Entities.find((e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
    if (!entityInfo) throw new Error(`Entity ${entityName} not found in metadata`);
    const user = UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
    if (!user) throw new Error(`User ${userPayload?.email} not found in metadata`);

    return entityInfo.GetUserRowLevelSecurityWhereClause(user, type, returnPrefix);
  }

  protected async createAuditLogRecord(
    userPayload: UserPayload,
    authorizationName: string | null,
    auditLogTypeName: string,
    status: string,
    details: string | null,
    entityId: number,
    recordId: any | null
  ): Promise<any> {
    try {
      const md = new Metadata();
      const userInfo = UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
      const authorization = authorizationName
        ? md.Authorizations.find((a) => a.Name.trim().toLowerCase() === authorizationName.trim().toLowerCase())
        : null;
      const auditLogType = md.AuditLogTypes.find((a) => a.Name.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase());

      if (!userInfo) throw new Error(`User ${userPayload?.email} not found in metadata`);
      if (!auditLogType) throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

      const auditLog = <AuditLogEntity>await md.GetEntityObject('Audit Logs', userInfo); // must pass user context on back end as we're not authenticated the same way as the front end
      auditLog.NewRecord();
      auditLog.UserID = userInfo.ID;
      auditLog.AuditLogTypeName = auditLogType.Name;
      if (authorization) auditLog.AuthorizationName = authorization.Name;
      auditLog.Status = status;
      if (details) auditLog.Details = details;
      auditLog.EntityID = entityId;
      if (recordId) auditLog.RecordID = recordId;

      if (await auditLog.Save()) return auditLog;
      else throw new Error(`Error saving audit log record`);
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  protected safeFirstArrayElement(arr: any[]) {
    if (arr && arr.length > 0) {
      return arr[0];
    }
    return null;
  }

  protected packageSPParam(paramValue: any, quoteString: string) {
    return paramValue === null || paramValue === undefined ? null : quoteString + paramValue + quoteString;
  }

  protected GetUserFromEmail(email: string): UserInfo | undefined {
    const md = new Metadata();
    return UserCache.Users.find((u) => u.Email.toLowerCase().trim() === email.toLowerCase().trim());
  }
  protected GetUserFromPayload(userPayload: UserPayload): UserInfo | undefined {
    if (!userPayload || !userPayload.email) return undefined;

    const md = new Metadata();
    return UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload.email.toLowerCase().trim());
  }

  public get MJCoreSchema(): string {
    return Metadata.Provider.ConfigData.MJCoreSchemaName;
  }
}
