import { BaseEntity, CompositeKey, EntityFieldTSType, EntityPermissionType, LogError, Metadata, RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { AuditLogEntity, UserViewEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { PubSubEngine } from 'type-graphql';
import { GraphQLError } from 'graphql';
import { DataSource } from 'typeorm';

import { RunViewGenericParams, UserPayload } from '../types.js';
import { RunDynamicViewInput, RunViewByIDInput, RunViewByNameInput } from './RunViewResolver.js';
import { DeleteOptionsInput } from './DeleteOptionsInput.js';
import { MJGlobal } from '@memberjunction/global';
import { PUSH_STATUS_UPDATES_TOPIC } from './PushStatusResolver.js';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';

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
      if (!entityInfo) throw new Error(`Entity ${entityName} not found in metadata`);
      // const fields = entityInfo.Fields.filter((f) => f.Name !== f.CodeName || f.Name.startsWith('__mj_'));
      const mapper = new FieldMapper();
      entityInfo.Fields.forEach((f) => {
        if (dataObject.hasOwnProperty(f.Name)) {
          // GraphQL doesn't allow us to pass back fields with __ so we are mapping our special field cases that start with __mj_ to _mj__ for transport - they are converted back on the other side automatically
          const mappedFieldName = mapper.MapFieldName(f.CodeName)
          if (mappedFieldName !== f.Name) {
            dataObject[mappedFieldName] = dataObject[f.Name];
            delete dataObject[f.Name];
          }
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
      const viewInfo: UserViewEntity = this.safeFirstArrayElement(
        await this.findBy(dataSource, 'User Views', { Name: viewInput.ViewName })
      );
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
        viewInput.ResultType,
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
        viewInput.ResultType,
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
        ID: "",
        Entity: viewInput.EntityName,
        EntityID: entity.ID,
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
        viewInput.ResultType,
        userPayload,
        pubSub
      );
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async RunViewsGeneric(viewInputs: (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[], dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    let md: Metadata | null = null;
    let params: RunViewGenericParams[] = [];
    for(const viewInput of viewInputs) {
      try {
        let viewInfo: UserViewEntity | null = null;

        if(viewInput.ViewName) {
          viewInfo = this.safeFirstArrayElement(
            await this.findBy(dataSource, 'User Views', { Name: viewInput.ViewName })
          );
        }
        else if(viewInput.ViewID) {
          viewInfo = this.safeFirstArrayElement(await this.findBy(dataSource, 'User Views', { ID: viewInput.ViewID }));
        }
        else if(viewInput.EntityName) {
          md = md || new Metadata();
          const entity = md.Entities.find((e) => e.Name === viewInput.EntityName);
          if (!entity) {
            throw new Error(`Entity ${viewInput.EntityName} not found in metadata`);
          }

          // only providing a few bits of data here, but it's enough to get the view to run
          viewInfo = {
            ID: "",
            Entity: viewInput.EntityName,
            EntityID: entity.ID,
            EntityBaseView: entity.BaseView,
          } as UserViewEntity;
        }
        else{
          throw new Error("Unable to determine input type");
        }

        params.push({
          viewInfo: viewInfo,
          dataSource: dataSource,
          extraFilter: viewInput.ExtraFilter,
          orderBy: viewInput.OrderBy,
          userSearchString: viewInput.UserSearchString,
          excludeUserViewRunID: viewInput.ExcludeUserViewRunID,
          overrideExcludeFilter: viewInput.OverrideExcludeFilter,
          saveViewResults: viewInput.EntityName ? false : viewInput.SaveViewResults,
          fields: viewInput.Fields,
          ignoreMaxRows: viewInput.IgnoreMaxRows,
          excludeDataFromAllPriorViewRuns: viewInput.EntityName ? false : viewInput.ExcludeDataFromAllPriorViewRuns,
          forceAuditLog: viewInput.ForceAuditLog,
          auditLogDescription: viewInput.AuditLogDescription,
          resultType: viewInput.ResultType,
          userPayload,
          pubSub
        });

      } catch (err) {
        LogError(err);
        return null;
      }
    }

    let results: RunViewResult[] = await this.RunViewsGenericInternal(params);
    return results;
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
    excludeUserViewRunID: string | undefined,
    overrideExcludeFilter: string | undefined,
    saveViewResults: boolean | undefined,
    fields: string[] | undefined,
    ignoreMaxRows: boolean | undefined,
    excludeDataFromAllPriorViewRuns: boolean | undefined,
    forceAuditLog: boolean | undefined,
    auditLogDescription: string | undefined,
    resultType: string | undefined,
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

        // figure out the result type from the input string (if provided)
        let rt: 'simple' | 'entity_object' | 'count_only' = 'simple';
        switch (resultType?.trim().toLowerCase()) {
          case 'count_only':
            rt = 'count_only';
            break;
          case 'entity_object':
          default:
            rt = 'simple'; // use simple as the default AND for entity_object becuase on teh server we don't really pass back a true entity_object anyway, just passing back the simple object anyway
            break;
        }

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
            ResultType: rt,
          },
          user
        );
        // go through the result and convert all fields that start with __mj_*** to _mj__*** for GraphQL transport
        const mapper = new FieldMapper();
        if (result && result.Success) {
          for (const r of result.Results) {
            mapper.MapFields(r);
          }
        }
        return result;
      } else return null;
    } catch (err) {
      console.log(err);
      throw err;
    }
  }

  protected async RunViewsGenericInternal(params: RunViewGenericParams[]): Promise<RunViewResult[]> {
    try {
      let md: Metadata | null = null;
      const rv = new RunView();
      let RunViewParams: RunViewParams[] = [];
      let contextUser: UserInfo | null = null;
      for(const param of params){
        if (param.viewInfo && param.userPayload) {
          md = md || new Metadata();
          const user: UserInfo = UserCache.Users.find((u) => u.Email.toLowerCase().trim() === param.userPayload?.email.toLowerCase().trim());
          if (!user) {
            throw new Error(`User ${param.userPayload?.email} not found in metadata`);
          }

          contextUser = contextUser || user;

          const entityInfo = md.Entities.find((e) => e.Name === param.viewInfo.Entity);
          if (!entityInfo){
            throw new Error(`Entity ${param.viewInfo.Entity} not found in metadata`);
          }
        }

        // figure out the result type from the input string (if provided)
        let rt: 'simple' | 'entity_object' | 'count_only' = 'simple';
        switch (param.resultType?.trim().toLowerCase()) {
          case 'count_only':
            rt = 'count_only';
            break;
          // use simple as the default AND for entity_object
          // becuase on teh server we don't really pass back
          // a true entity_object anyway, just passing back
          // the simple object anyway
          case 'entity_object':
          default:
            rt = 'simple';
            break;
        }

        RunViewParams.push({
          ViewID: param.viewInfo.ID,
          ViewName: param.viewInfo.Name,
          EntityName: param.viewInfo.Entity,
          ExtraFilter: param.extraFilter,
          OrderBy: param.orderBy,
          Fields: param.fields,
          UserSearchString: param.userSearchString,
          ExcludeUserViewRunID: param.excludeUserViewRunID,
          OverrideExcludeFilter: param.overrideExcludeFilter,
          SaveViewResults: param.saveViewResults,
          ExcludeDataFromAllPriorViewRuns: param.excludeDataFromAllPriorViewRuns,
          IgnoreMaxRows: param.ignoreMaxRows,
          ForceAuditLog: param.forceAuditLog,
          AuditLogDescription: param.auditLogDescription,
          ResultType: rt,
        });
      }

      let runViewResults: RunViewResult[] = await rv.RunViews(RunViewParams, contextUser);

      // go through the result and convert all fields that start with __mj_*** to _mj__*** for GraphQL transport
      const mapper = new FieldMapper();
      for(const runViewResult of runViewResults){
        if (runViewResult && runViewResult.Success) {
          for (const result of runViewResult.Results) {
            mapper.MapFields(result);
          }
        }
      }

      return runViewResults;
    }
    catch (err) {
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
    entityId: string,
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

      const auditLog = await md.GetEntityObject<AuditLogEntity>('Audit Logs', userInfo); // must pass user context on back end as we're not authenticated the same way as the front end
      auditLog.NewRecord();
      auditLog.UserID = userInfo.ID;
      auditLog.AuditLogTypeID = auditLogType.ID;

      if (authorization)
        auditLog.AuthorizationID = authorization.ID;

      if (status?.trim().toLowerCase() === 'success') auditLog.Status = 'Success';
      else auditLog.Status = 'Failed';

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

  protected ListenForEntityMessages(entityObject: BaseEntity, pubSub: PubSubEngine, userPayload: UserPayload) {
    // listen for events from the entityObject in case it is a long running task and we can push messages back to the client via pubSub
    MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
      if (event) {
        if (event.component === entityObject && event.args && event.args.message) {
          // message from our entity object, relay it to the client
          pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
              status: 'OK',
              type: 'EntityObjectStatusMessage',
              entityName: entityObject.EntityInfo.Name,
              primaryKey: entityObject.PrimaryKey,
              message: event.args.message,
            }),
            sessionId: userPayload.sessionId,
          });
        }
      }
    });
  }

  protected async CreateRecord(entityName: string, input: any, dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    if (await this.BeforeCreate(dataSource, input)) {
      // fire event and proceed if it wasn't cancelled
      const entityObject = await new Metadata().GetEntityObject(entityName, this.GetUserFromPayload(userPayload));
      entityObject.NewRecord();
      entityObject.SetMany(input);

      this.ListenForEntityMessages(entityObject, pubSub, userPayload);

      if (await entityObject.Save()) {
        // save worked, fire the AfterCreate event and then return all the data
        await this.AfterCreate(dataSource, input); // fire event
        return this.MapFieldNamesToCodeNames(entityName, entityObject.GetAll());
      }
      // save failed, return null
      else throw entityObject.LatestResult.Message;
    } else return null;
  }

  // Before/After CREATE Event Hooks for Sub-Classes to Override
  protected async BeforeCreate(dataSource: DataSource, input: any): Promise<boolean> {
    return true;
  }
  protected async AfterCreate(dataSource: DataSource, input: any) {}

  protected async UpdateRecord(entityName: string, input: any, dataSource: DataSource, userPayload: UserPayload, pubSub: PubSubEngine) {
    if (await this.BeforeUpdate(dataSource, input)) {
      // fire event and proceed if it wasn't cancelled
      const md = new Metadata();
      const userInfo = this.GetUserFromPayload(userPayload);
      const entityObject = await md.GetEntityObject(entityName, userInfo);
      const entityInfo = entityObject.EntityInfo;
      const clientNewValues = {};
      Object.keys(input).forEach((key) => {
        if (key !== 'OldValues___')
          clientNewValues[key] = input[key];
      }); // grab all the props except for the OldValues property

      if (entityInfo.TrackRecordChanges || !input.OldValues___) {
        // We get here because EITHER the entity tracks record changes OR the client did not provide OldValues, so we need to load the old values from the DB
        const cKey = new CompositeKey(
          entityInfo.PrimaryKeys.map((pk) => {
            return {
              FieldName: pk.Name,
              Value: input[pk.CodeName],
            };
          })
        );

        if (await entityObject.InnerLoad(cKey)) {
          // load worked, now, only IF we have OldValues, we need to check them against the values in the DB we just loaded.
          if (input.OldValues___) {
            // we DO have OldValues, so we need to do a more in depth analysis
            this.TestAndSetClientOldValuesToDBValues(input, clientNewValues, entityObject);
          } 
          else {
            // no OldValues, so we can just set the new values from input
            entityObject.SetMany(input);
          }
        } else {
          // save failed, return null
          throw new GraphQLError(`Record not found for ${entityName} with key ${JSON.stringify(cKey)}`, {
            extensions: { code: 'LOAD_ENTITY_ERROR', entityName },
          });
        }
      } 
      else {
        // we get here if we are NOT tracking changes and we DO have OldValues, so we can load from them
        const oldValues = {};
        // for each item in the oldValues array, add it to the oldValues object
        input.OldValues___?.forEach((item) => (oldValues[item.Key] = item.Value));

        // 1) load the old values, this will be the initial state of the object
        entityObject.LoadFromData(oldValues);

        // 2) set the new values from the input, not including the OldValues property
        entityObject.SetMany(clientNewValues);
      }

      this.ListenForEntityMessages(entityObject, pubSub, userPayload);
      if (await entityObject.Save()) {
        // save worked, fire afterevent and return all the data
        await this.AfterUpdate(dataSource, input); // fire event
        return this.MapFieldNamesToCodeNames(entityName, entityObject.GetAll());
      } else {
        throw new GraphQLError(entityObject.LatestResult?.Message ?? 'Unknown error', {
          extensions: { code: 'SAVE_ENTITY_ERROR', entityName },
        });
      }
    } else
      throw new GraphQLError('Save Canceled by BeforeSave() handler in ResolverBase', {
        extensions: { code: 'SAVE_ENTITY_ERROR', entityName },
      });
  }

  /**
   * This routine compares the OldValues property in the input object to the values in the DB that we just loaded. If there are differences, we need to check to see if the client
   * is trying to update any of those fields (e.g. overlap). If there is overlap, we throw an error. If there is no overlap, we can proceed with the update even if the DB Values
   * and the ClientOldValues are not 100% the same, so long as there is no overlap in the specific FIELDS that are different.
   *
   * ASSUMES: input object has an OldValues___ property that is an array of Key/Value pairs that represent the old values of the record that the client is trying to update.
   */
  protected TestAndSetClientOldValuesToDBValues(input: any, clientNewValues: any, entityObject: BaseEntity) {
    // we have OldValues, so we need to compare them to the values we just loaded from the DB
    const clientOldValues = {};
    // for each item in the oldValues array, add it to the clientOldValues object
    input.OldValues___.forEach((item) => {
      // we need to do a quick transform on the values to make sure they match the TS Type for the given field because item.Value will always be a string
      const field = entityObject.EntityInfo.Fields.find((f) => f.CodeName === item.Key);
      let val = item.Value;
      if ((val === null || val === undefined) && field.DefaultValue !== null && field.DefaultValue !== undefined && !field.AllowsNull)
        val = field.DefaultValue; // set default value as the field was never set and it does NOT allow nulls

      if (field) {
        switch (field.TSType) {
          case EntityFieldTSType.Number:
            val = val !== null && val !== undefined ? parseInt(val) : null;
            break;
          case EntityFieldTSType.Boolean:
            val = val === null || val === undefined || val === 'false' || val === '0' || parseInt(val) === 0 ? false : true;
            break;
          case EntityFieldTSType.Date:
            // first, if val is a string and it is actually a number (milliseconds since epoch), convert it to a number.
            if (val !== null && val !== undefined && val.toString().trim() !== '' && !isNaN(val)) val = parseInt(val);

            val = val !== null && val !== undefined ? new Date(val) : null;
            break;
          default:
            break; // already a string
        }
      }
      clientOldValues[item.Key] = val;
    });

    // clientOldValues now has all of the oldValues the CLIENT passed us. Now we need to build the same kind of object
    // with the DB values
    const dbValues = entityObject.GetAll();

    // now we need to compare clientOldValues and dbValues and have a new array that has entries for any differences and have FieldName, clientOldValue and dbValue as properties
    const dbDifferences = [];
    Object.keys(clientOldValues).forEach((key) => {
      const f = entityObject.EntityInfo.Fields.find((f) => f.CodeName === key);
      let different = false;
      switch (typeof clientOldValues[key]) {
        case 'number':
          different = clientOldValues[key] !== dbValues[key];
          break;
        case 'boolean':
          different = clientOldValues[key] !== dbValues[key];
          break;
        case 'object':
          if (clientOldValues[key] instanceof Date) {
            different = clientOldValues[key].getTime() !== dbValues[key].getTime();
          }
          break;
        default:
          different = clientOldValues[key] !== dbValues[key];
          break;
      }
      if (different && f && !f.ReadOnly) {
        // only include updateable fields
        dbDifferences.push({
          FieldName: key,
          ClientOldValue: clientOldValues[key],
          DBValue: dbValues[key],
        });
      }
    });

    if (dbDifferences.length > 0) {
      // now we have an array of any dbDifferences with length > 0, between the clientOldValues and the dbValues, we need to check to see if any of the differences are on fields that the client is trying to update
      // first step is to get clientNewValues into an object that is like clientOldValues, get the diff and then compare that diff to the differences array that shows diff between DB and ClientOld
      const clientDifferences = [];
      Object.keys(clientOldValues).forEach((key) => {
        const f = entityObject.EntityInfo.Fields.find((f) => f.CodeName === key);
        if (clientOldValues[key] !== clientNewValues[key] && f && f.AllowUpdateAPI && !f.IsPrimaryKey) {
          // only include updateable fields
          clientDifferences.push({
            FieldName: key,
            ClientOldValue: clientOldValues[key],
            ClientNewValue: clientNewValues[key],
          });
        }
      });

      // now we have clientDifferences which shows what the client thinks they are changing. And, we have the dbDifferences array that shows changes between the clientOldValues and the dbValues
      // if there is ANY overlap in the FIELDS that appear in both arrays, we need to throw an error
      const overlap = clientDifferences.filter((cd) => dbDifferences.find((dd) => dd.FieldName === cd.FieldName));
      if (overlap.length > 0) {
        const msg = {
          Message:
            'Inconsistency between old values provided for changed fields, and the values of one or more of those fields in the database. Update operation cancelled.',
          ClientDifferences: clientDifferences,
          DBDifferences: dbDifferences,
          Overlap: overlap,
        };
        throw new Error(JSON.stringify(msg));
      }
    }

    // If we get here that means we've not thrown an exception, so there is
    // NO OVERLAP, so we can set the new values from the data provided from the client now...
    entityObject.SetMany(clientNewValues);
  }

  protected async DeleteRecord(
    entityName: string,
    key: CompositeKey,
    options: DeleteOptionsInput,
    dataSource: DataSource,
    userPayload: UserPayload,
    pubSub: PubSubEngine
  ) {
    if (await this.BeforeDelete(dataSource, key)) {
      // fire event and proceed if it wasn't cancelled
      const entityObject = await new Metadata().GetEntityObject(entityName, this.GetUserFromPayload(userPayload));
      await entityObject.InnerLoad(key);
      const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
      if (await entityObject.Delete(options)) {
        await this.AfterDelete(dataSource, key); // fire event
        return returnValue;
      } else {
        throw new GraphQLError(entityObject.LatestResult?.Message ?? 'Unknown error', {
          extensions: { code: 'DELETE_ENTITY_ERROR', entityName },
        });
      }
    } else {
      throw new GraphQLError('Delete operation canceled by BeforeDelete() handler in ResolverBase', {
        extensions: { code: 'DELETE_ENTITY_ERROR', entityName },
      });
    }
  }

  // Before/After DELETE Event Hooks for Sub-Classes to Override
  protected async BeforeDelete(dataSource: DataSource, key: CompositeKey): Promise<boolean> {
    return true;
  }
  protected async AfterDelete(dataSource: DataSource, key: CompositeKey) {}

  // Before/After UPDATE Event Hooks for Sub-Classes to Override
  protected async BeforeUpdate(dataSource: DataSource, input: any): Promise<boolean> {
    return true;
  }
  protected async AfterUpdate(dataSource: DataSource, input: any) {}
}
