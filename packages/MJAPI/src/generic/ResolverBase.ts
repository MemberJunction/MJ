import { EntityPermissionType, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { PubSubEngine, UserPayload } from '@memberjunction/server';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { DataSource } from 'typeorm';
import { Entity_, UserView_ } from '../generated/generated';
import { RunDynamicViewInput, RunViewByIDInput, RunViewByNameInput } from './RunViewResolver';

export class ResolverBase {
  async RunViewByNameGeneric(viewInput: RunViewByNameInput, dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      const viewInfo: UserView_ | null = await dataSource.getRepository(UserView_).findOneBy({ Name: viewInput.ViewName });
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
      const viewInfo: UserView_ | null = await dataSource.getRepository(UserView_).findOneBy({ ID: viewInput.ViewID });
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
      const entity = await dataSource.getRepository(Entity_).findOneBy({ Name: viewInput.EntityName });

      const viewInfo: UserView_ = {
        ID: -1,
        Entity: viewInput.EntityName,
        EntityID: entity?.ID as number,
        // EntityBaseView: entity?.ID === 22 ? '' : (entity?.BaseView as string), // fake error
        EntityBaseView: entity?.BaseView as string,
      } as UserView_; // only providing a few bits of data here, but it's enough to get the view to run

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
    viewInfo: UserView_ | null,
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

  protected async createRecordAccessAuditLogRecord(userPayload: UserPayload, entityName: string, recordId: number): Promise<any> {
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
    recordId: number | null
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

      const auditLog = await md.GetEntityObject('Audit Logs', userInfo); // must pass user context on back end as we're not authenticated the same way as the front end
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
