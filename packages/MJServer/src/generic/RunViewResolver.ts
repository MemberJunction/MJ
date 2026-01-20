import { Arg, Ctx, Field, InputType, Int, ObjectType, PubSubEngine, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { ResolverBase } from './ResolverBase.js';
import { LogError, LogStatus, EntityInfo, RunViewWithCacheCheckResult, RunViewsWithCacheCheckResponse, RunViewWithCacheCheckParams } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadOnlyProvider } from '../util.js';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { KeyValuePairOutputType } from './KeyInputOutputTypes.js';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

/********************************************************************************
 * The PURPOSE of this resolver is to provide a generic way to run a view and return the results.
 * The best practice is to use the strongly typed sub-class of this resolver for each entity.
 * that way you get back strongly typed results. If you need a generic way to call a view and get
 * back the results, and have your own type checking in place, this resolver can be used.
 *
 */
//****************************************************************************
// INPUT TYPE for Running Views
//****************************************************************************
@InputType()
export class RunViewByIDInput {
  @Field(() => String)
  ViewID: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid condition to append to the view WHERE clause. For example, UpdatedAt >= Some Date - if not provided, no filter is applied',
  })
  ExtraFilter: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid order by clause sort the results on the server. For example, CreatedAt DESC to order by row creation date in reverse order. Any Valid SQL Order By clause is okay - if not provided, no server-side sorting is applied',
  })
  OrderBy: string;

  @Field(() => [String], {
    nullable: true,
    description:
      'Optional, array of entity field names, if not provided, ID and all other columns used in the view columns are returned. If provided, only the fields in the array are returned.',
  })
  Fields?: string[];

  @Field(() => String, { nullable: true })
  UserSearchString: string;

  @Field(() => String, { nullable: true, description: 'Pass in a UserViewRun ID value to exclude all records from that run from results' })
  ExcludeUserViewRunID?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Pass in a valid condition to append to the view WHERE clause to override the Exclude List. For example, UpdatedAt >= Some Date',
  })
  OverrideExcludeFilter?: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to True, the results of this view are saved into a new UserViewRun record and the UserViewRun.ID is passed back in the results.',
  })
  SaveViewResults?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, the resulting data will filter out ANY records that were ever returned by this view, when the SaveViewResults property was set to true. This is useful if you want to run a particular view over time and make sure the results returned each time are new to the view.',
  })
  ExcludeDataFromAllPriorViewRuns?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.',
  })
  IgnoreMaxRows?: boolean;

  @Field(() => Int, {
    nullable: true,
    description:
      'if a value > 0 is provided, and IgnoreMaxRows is set to false, this value is used for the max rows to be returned by the view.',
  })
  MaxRows?: number;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to true, an Audit Log record will be created for the view run, regardless of the property settings in the entity for auditing view runs',
  })
  ForceAuditLog?: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      "if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.",
  })
  AuditLogDescription?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in entity_object, simple, or count_only as options to specify the type of result you want back. Defaults to simple if not provided',
  })
  ResultType?: string;

  @Field(() => Int, {
    nullable: true,
    description: 'If a value > 0 is provided, this value will be used to offset the rows returned.',
  })
  StartRow?: number;
}

@InputType()
export class RunViewByNameInput {
  @Field(() => String)
  ViewName: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid condition to append to the view WHERE clause. For example, UpdatedAt >= Some Date - if not provided, no filter is applied',
  })
  ExtraFilter: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid order by clause sort the results on the server. For example, CreatedAt DESC to order by row creation date in reverse order. Any Valid SQL Order By clause is okay - if not provided, no server-side sorting is applied',
  })
  OrderBy: string;

  @Field(() => [String], {
    nullable: true,
    description:
      'Optional, array of entity field names, if not provided, ID and all other columns used in the view are returned. If provided, only the fields in the array are returned.',
  })
  Fields?: string[];

  @Field(() => String, { nullable: true })
  UserSearchString: string;

  @Field(() => String, { nullable: true, description: 'Pass in a UserViewRun ID value to exclude all records from that run from results' })
  ExcludeUserViewRunID?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Pass in a valid condition to append to the view WHERE clause to override the Exclude List. For example, UpdatedAt >= Some Date',
  })
  OverrideExcludeFilter?: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to True, the results of this view are saved into a new UserViewRun record and the UserViewRun.ID is passed back in the results.',
  })
  SaveViewResults?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, the resulting data will filter out ANY records that were ever returned by this view, when the SaveViewResults property was set to true. This is useful if you want to run a particular view over time and make sure the results returned each time are new to the view.',
  })
  ExcludeDataFromAllPriorViewRuns?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.',
  })
  IgnoreMaxRows?: boolean;

  @Field(() => Int, {
    nullable: true,
    description:
      'if a value > 0 is provided, and IgnoreMaxRows is set to false, this value is used for the max rows to be returned by the view.',
  })
  MaxRows?: number;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to true, an Audit Log record will be created for the view run, regardless of the property settings in the entity for auditing view runs',
  })
  ForceAuditLog?: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      "if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.",
  })
  AuditLogDescription?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in entity_object, simple, or count_only as options to specify the type of result you want back. Defaults to simple if not provided',
  })
  ResultType?: string;

  @Field(() => Int, {
    nullable: true,
    description: 'If a value > 0 is provided, this value will be used to offset the rows returned.',
  })
  StartRow?: number;
}

@InputType()
export class RunDynamicViewInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid condition to use as the view WHERE clause. For example, UpdatedAt >= Some Date - if not provided, no filter is applied',
  })
  ExtraFilter: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid order by clause sort the results on the server. For example, CreatedAt DESC to order by row creation date in reverse order. Any Valid SQL Order By clause is okay - if not provided, no server-side sorting is applied',
  })
  OrderBy: string;

  @Field(() => [String], {
    nullable: true,
    description:
      'Optional, array of entity field names, if not provided, all columns are returned. If provided, only the fields in the array are returned.',
  })
  Fields?: string[];

  @Field(() => String, { nullable: true })
  UserSearchString: string;

  @Field(() => String, { nullable: true, description: 'Pass in a UserViewRun ID value to exclude all records from that run from results' })
  ExcludeUserViewRunID?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Pass in a valid condition to append to the view WHERE clause to override the Exclude List. For example, UpdatedAt >= Some Date',
  })
  OverrideExcludeFilter?: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.',
  })
  IgnoreMaxRows?: boolean;

  @Field(() => Int, {
    nullable: true,
    description:
      'if a value > 0 is provided, and IgnoreMaxRows is set to false, this value is used for the max rows to be returned by the view.',
  })
  MaxRows?: number;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to true, an Audit Log record will be created for the view run, regardless of the property settings in the entity for auditing view runs',
  })
  ForceAuditLog?: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      "if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.",
  })
  AuditLogDescription?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in entity_object, simple, or count_only as options to specify the type of result you want back. Defaults to simple if not provided',
  })
  ResultType?: string;

  @Field(() => Int, {
    nullable: true,
    description: 'If a value > 0 is provided, this value will be used to offset the rows returned.',
  })
  StartRow?: number;
}

@InputType()
export class RunViewGenericInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid condition to use as the view WHERE clause. For example, UpdatedAt >= Some Date - if not provided, no filter is applied',
  })
  ExtraFilter: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in a valid order by clause sort the results on the server. For example, CreatedAt DESC to order by row creation date in reverse order. Any Valid SQL Order By clause is okay - if not provided, no server-side sorting is applied',
  })
  OrderBy: string;

  @Field(() => [String], {
    nullable: true,
    description:
      'Optional, array of entity field names, if not provided, all columns are returned. If provided, only the fields in the array are returned.',
  })
  Fields?: string[];

  @Field(() => String, { nullable: true })
  UserSearchString: string;

  @Field(() => String, { nullable: true, description: 'Pass in a UserViewRun ID value to exclude all records from that run from results' })
  ExcludeUserViewRunID?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Pass in a valid condition to append to the view WHERE clause to override the Exclude List. For example, UpdatedAt >= Some Date',
  })
  OverrideExcludeFilter?: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to True, the results of this view are saved into a new UserViewRun record and the UserViewRun.ID is passed back in the results.',
  })
  SaveViewResults?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, the resulting data will filter out ANY records that were ever returned by this view, when the SaveViewResults property was set to true. This is useful if you want to run a particular view over time and make sure the results returned each time are new to the view.',
  })
  ExcludeDataFromAllPriorViewRuns?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.',
  })
  IgnoreMaxRows?: boolean;

  @Field(() => Int, {
    nullable: true,
    description:
      'if a value > 0 is provided, and IgnoreMaxRows is set to false, this value is used for the max rows to be returned by the view.',
  })
  MaxRows?: number;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'If set to true, an Audit Log record will be created for the view run, regardless of the property settings in the entity for auditing view runs',
  })
  ForceAuditLog?: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      "if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.",
  })
  AuditLogDescription?: string;

  @Field(() => String, {
    nullable: true,
    description:
      'Optional, pass in entity_object, simple, or count_only as options to specify the type of result you want back. Defaults to simple if not provided',
  })
  ResultType?: string;

  @Field(() => Int, {
    nullable: true,
    description: 'If a value > 0 is provided, this value will be used to offset the rows returned.',
  })
  StartRow?: number;
}

//****************************************************************************
// INPUT/OUTPUT TYPES for RunViewsWithCacheCheck
//****************************************************************************

@InputType()
export class RunViewCacheStatusInput {
  @Field(() => String, { description: 'The maximum __mj_UpdatedAt value from cached results' })
  maxUpdatedAt: string;

  @Field(() => Int, { description: 'The number of rows in cached results' })
  rowCount: number;
}

@InputType()
export class RunViewWithCacheCheckInput {
  @Field(() => RunDynamicViewInput, { description: 'The RunView parameters' })
  params: RunDynamicViewInput;

  @Field(() => RunViewCacheStatusInput, {
    nullable: true,
    description: 'Optional cache status - if provided, server will check if cache is current'
  })
  cacheStatus?: RunViewCacheStatusInput;
}

@ObjectType()
export class DifferentialDataOutput {
  @Field(() => [RunViewGenericResultRow], {
    description: 'Records that have been created or updated since the client\'s maxUpdatedAt'
  })
  updatedRows: RunViewGenericResultRow[];

  @Field(() => [String], {
    description: 'Primary key values (as concatenated strings) of records that have been deleted'
  })
  deletedRecordIDs: string[];
}

@ObjectType()
export class RunViewWithCacheCheckResultOutput {
  @Field(() => Int, { description: 'The index of this view in the batch request' })
  viewIndex: number;

  @Field(() => String, { description: "'current', 'differential', 'stale', or 'error'" })
  status: string;

  @Field(() => [RunViewGenericResultRow], {
    nullable: true,
    description: 'Fresh results - only populated when status is stale (full refresh)'
  })
  Results?: RunViewGenericResultRow[];

  @Field(() => DifferentialDataOutput, {
    nullable: true,
    description: 'Differential update data - only populated when status is differential'
  })
  differentialData?: DifferentialDataOutput;

  @Field(() => String, { nullable: true, description: 'Max __mj_UpdatedAt from results when stale or differential' })
  maxUpdatedAt?: string;

  @Field(() => Int, { nullable: true, description: 'Row count of results when stale or differential (total after applying delta)' })
  rowCount?: number;

  @Field(() => String, { nullable: true, description: 'Error message if status is error' })
  errorMessage?: string;
}

@ObjectType()
export class RunViewsWithCacheCheckOutput {
  @Field(() => Boolean, { description: 'Whether the overall operation succeeded' })
  success: boolean;

  @Field(() => [RunViewWithCacheCheckResultOutput], { description: 'Results for each view in the batch' })
  results: RunViewWithCacheCheckResultOutput[];

  @Field(() => String, { nullable: true, description: 'Overall error message if success is false' })
  errorMessage?: string;
}

//****************************************************************************
// OUTPUT TYPES for RunView Results
//****************************************************************************

@ObjectType()
export class RunViewResultRow {
  @Field(() => [KeyValuePairOutputType], {
    description: 'Primary key values for the record'
  })
  PrimaryKey: KeyValuePairOutputType[];

  @Field(() => String)
  EntityID: string;

  @Field(() => String)
  Data: string;
}

@ObjectType()
export class RunViewGenericResultRow {
  @Field(() => [KeyValuePairOutputType], { 
    description: 'Primary key values for the record' 
  })
  PrimaryKey: KeyValuePairOutputType[];

  @Field(() => String)
  EntityID: string;

  @Field(() => String)
  Data: string;
}

@ObjectType()
export class RunViewResult {
  @Field(() => [RunViewResultRow])
  Results: RunViewResultRow[];

  @Field(() => String, { nullable: true })
  UserViewRunID?: string;

  @Field(() => Int, { nullable: true })
  RowCount: number;

  @Field(() => Int, { nullable: true })
  TotalRowCount: number;

  @Field(() => Int, { nullable: true })
  ExecutionTime: number;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => Boolean, { nullable: false })
  Success: boolean;
}

@ObjectType()
export class RunViewGenericResult {
  @Field(() => [RunViewGenericResultRow])
  Results: RunViewGenericResultRow[];

  @Field(() => String, { nullable: true })
  UserViewRunID?: string;

  @Field(() => Int, { nullable: true })
  RowCount: number;

  @Field(() => Int, { nullable: true })
  TotalRowCount: number;

  @Field(() => Int, { nullable: true })
  ExecutionTime: number;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => Boolean, { nullable: false })
  Success: boolean;
}

@Resolver(RunViewResultRow)
export class RunViewResolver extends ResolverBase {
  @Query(() => RunViewResult)
  async RunViewByName(
    @Arg('input', () => RunViewByNameInput) input: RunViewByNameInput,
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData = await super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
      if (rawData === null) 
        return null;

      const viewInfo = super.safeFirstArrayElement<UserViewEntityExtended>(await super.findBy<UserViewEntityExtended>(provider, "User Views", { Name: input.ViewName }, userPayload.userRecord));
      const entity = provider.Entities.find((e) => e.ID === viewInfo.EntityID);
      const returnData = this.processRawData(rawData.Results, viewInfo.EntityID, entity);
      return {
        Results: returnData,
        UserViewRunID: rawData?.UserViewRunID,
        RowCount: rawData?.RowCount,
        TotalRowCount: rawData?.TotalRowCount,
        ExecutionTime: rawData?.ExecutionTime,
      };
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  @Query(() => RunViewResult)
  async RunViewByID(
    @Arg('input', () => RunViewByIDInput) input: RunViewByIDInput,
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData = await super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
      if (rawData === null) 
        return null;

      const viewInfo = super.safeFirstArrayElement<UserViewEntityExtended>(await super.findBy<UserViewEntityExtended>(provider, "User Views", { ID: input.ViewID }, userPayload.userRecord));
      const entity = provider.Entities.find((e) => e.ID === viewInfo.EntityID);
      const returnData = this.processRawData(rawData.Results, viewInfo.EntityID, entity);
      return {
        Results: returnData,
        UserViewRunID: rawData?.UserViewRunID,
        RowCount: rawData?.RowCount,
        TotalRowCount: rawData?.TotalRowCount,
        ExecutionTime: rawData?.ExecutionTime,
      };
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  @Query(() => RunViewResult)
  async RunDynamicView(
    @Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput,
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData = await super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
      if (rawData === null) return null;

      const entity = provider.Entities.find((e) => e.Name === input.EntityName);
      const returnData = this.processRawData(rawData.Results, entity.ID, entity);
      return {
        Results: returnData,
        UserViewRunID: rawData?.UserViewRunID,
        RowCount: rawData?.RowCount,
        TotalRowCount: rawData?.TotalRowCount,
        ExecutionTime: rawData?.ExecutionTime,
      };
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  @Query(() => [RunViewGenericResult])
  async RunViews(
    @Arg('input', () => [RunViewGenericInput]) input: (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[],
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData: RunViewGenericResult[] = await super.RunViewsGeneric(input, provider, userPayload);
      if (!rawData) {
        return null;
      }

      let results: RunViewGenericResult[] = [];
      for (const [index, data] of rawData.entries()) {
        const entity = provider.Entities.find((e) => e.Name === input[index].EntityName);
        const returnData: any[] = this.processRawData(data.Results, entity.ID, entity);

        results.push({
          Results: returnData,
          UserViewRunID: data?.UserViewRunID,
          RowCount: data?.RowCount,
          TotalRowCount: data?.TotalRowCount,
          ExecutionTime: data?.ExecutionTime,
          Success: data?.Success,
        });
      }

      return results;
    } catch (err) {
      LogError(err);
      return null;
    }
  }

  @RequireSystemUser()
  @Query(() => RunViewResult)
  async RunViewByNameSystemUser(
    @Arg('input', () => RunViewByNameInput) input: RunViewByNameInput,
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData = await super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
      if (rawData === null) {
        return {
          Results: [],
          Success: false,
          ErrorMessage: `Failed to execute view: ${input.ViewName}`,
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 0
        };
      }

      const entity = provider.Entities.find((e) => e.Name === input.ViewName);
      const entityId = entity ? entity.ID : null;
      const returnData = this.processRawData(rawData.Results, entityId, entity);
      return {
        Results: returnData,
        UserViewRunID: rawData?.UserViewRunID,
        RowCount: rawData?.RowCount,
        TotalRowCount: rawData?.TotalRowCount,
        ExecutionTime: rawData?.ExecutionTime,
        Success: rawData?.Success,
        ErrorMessage: rawData?.ErrorMessage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      LogError(err);
      return {
        Results: [],
        Success: false,
        ErrorMessage: errorMessage,
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0
      };
    }
  }

  @RequireSystemUser()
  @Query(() => RunViewResult)
  async RunViewByIDSystemUser(
    @Arg('input', () => RunViewByIDInput) input: RunViewByIDInput,
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData = await super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
      if (rawData === null) {
        return {
          Results: [],
          Success: false,
          ErrorMessage: `Failed to execute view with ID: ${input.ViewID}`,
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 0
        };
      }

      const viewInfo = super.safeFirstArrayElement<UserViewEntityExtended>(await super.findBy<UserViewEntityExtended>(provider, "User Views", { ID: input.ViewID }, userPayload.userRecord));
      const entity = provider.Entities.find((e) => e.ID === viewInfo.EntityID);
      const returnData = this.processRawData(rawData.Results, viewInfo.EntityID, entity);
      return {
        Results: returnData,
        UserViewRunID: rawData?.UserViewRunID,
        RowCount: rawData?.RowCount,
        TotalRowCount: rawData?.TotalRowCount,
        ExecutionTime: rawData?.ExecutionTime,
        Success: rawData?.Success,
        ErrorMessage: rawData?.ErrorMessage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      LogError(err);
      return {
        Results: [],
        Success: false,
        ErrorMessage: errorMessage,
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0
      };
    }
  }

  @RequireSystemUser()
  @Query(() => RunViewResult)
  async RunDynamicViewSystemUser(
    @Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput,
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData = await super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
      if (rawData === null) {
        return {
          Results: [],
          Success: false,
          ErrorMessage: 'Failed to execute dynamic view',
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 0
        };
      }

      const entity = provider.Entities.find((e) => e.Name === input.EntityName);
      if (!entity) {
        const errorMsg = `Entity ${input.EntityName} not found in metadata`;
        LogError(new Error(errorMsg));
        return {
          Results: [],
          Success: false,
          ErrorMessage: errorMsg,
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 0
        };
      }
      const returnData = this.processRawData(rawData.Results, entity.ID, entity);
      return {
        Results: returnData,
        UserViewRunID: rawData?.UserViewRunID,
        RowCount: rawData?.RowCount,
        TotalRowCount: rawData?.TotalRowCount,
        ExecutionTime: rawData?.ExecutionTime,
        Success: rawData?.Success,
        ErrorMessage: rawData?.ErrorMessage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      LogError(err);
      return {
        Results: [],
        Success: false,
        ErrorMessage: errorMessage,
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0
      };
    }
  }

  @RequireSystemUser()
  @Query(() => [RunViewGenericResult])
  async RunViewsSystemUser(
    @Arg('input', () => [RunViewGenericInput]) input: (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[],
    @Ctx() { providers, userPayload }: AppContext,
    pubSub: PubSubEngine
  ) {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
      const rawData: RunViewGenericResult[] = await super.RunViewsGeneric(input, provider, userPayload);
      if (!rawData) {
        return null;
      }

      let results: RunViewGenericResult[] = [];
      for (const [index, data] of rawData.entries()) {
        const entity = provider.Entities.find((e) => e.Name === input[index].EntityName);
        if (!entity) {
          LogError(new Error(`Entity with name ${input[index].EntityName} not found`));
          continue;
        }
        const returnData: any[] = this.processRawData(data.Results, entity.ID, entity);

        results.push({
          Results: returnData,
          UserViewRunID: data?.UserViewRunID,
          RowCount: data?.RowCount,
          TotalRowCount: data?.TotalRowCount,
          ExecutionTime: data?.ExecutionTime,
          Success: data?.Success,
          ErrorMessage: data?.ErrorMessage,
        });
      }

      return results;
    } catch (err) {
      LogError(err);
      return null;
    }
  }

  /**
   * RunViewsWithCacheCheck - Smart cache validation for batch RunViews.
   * For each view, if cacheStatus is provided, the server checks if the cache is current.
   * If current, returns status='current' with no data. If stale, returns status='stale' with fresh data.
   */
  @Query(() => RunViewsWithCacheCheckOutput)
  async RunViewsWithCacheCheck(
    @Arg('input', () => [RunViewWithCacheCheckInput]) input: RunViewWithCacheCheckInput[],
    @Ctx() { providers, userPayload }: AppContext
  ): Promise<RunViewsWithCacheCheckOutput> {
    try {
      const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });

      // Cast provider to SQLServerDataProvider to access RunViewsWithCacheCheck method
      const sqlProvider = provider as unknown as SQLServerDataProvider;
      if (!sqlProvider.RunViewsWithCacheCheck) {
        throw new Error('Provider does not support RunViewsWithCacheCheck');
      }

      // Convert GraphQL input types to core types
      const coreParams: RunViewWithCacheCheckParams[] = input.map(item => ({
        params: {
          EntityName: item.params.EntityName,
          ExtraFilter: item.params.ExtraFilter,
          OrderBy: item.params.OrderBy,
          Fields: item.params.Fields,
          UserSearchString: item.params.UserSearchString,
          ExcludeUserViewRunID: item.params.ExcludeUserViewRunID,
          OverrideExcludeFilter: item.params.OverrideExcludeFilter,
          IgnoreMaxRows: item.params.IgnoreMaxRows,
          MaxRows: item.params.MaxRows,
          ForceAuditLog: item.params.ForceAuditLog,
          AuditLogDescription: item.params.AuditLogDescription,
          ResultType: (item.params.ResultType || 'simple') as 'simple' | 'entity_object' | 'count_only',
          StartRow: item.params.StartRow,
        },
        cacheStatus: item.cacheStatus ? {
          maxUpdatedAt: item.cacheStatus.maxUpdatedAt,
          rowCount: item.cacheStatus.rowCount,
        } : undefined,
      }));

      const response = await sqlProvider.RunViewsWithCacheCheck(coreParams, userPayload.userRecord);

      // Transform results to include processed data rows
      const transformedResults: RunViewWithCacheCheckResultOutput[] = response.results.map((result, index) => {
        const inputItem = input[index];
        const entity = provider.Entities.find(e => e.Name === inputItem.params.EntityName);

        // If we have differential data but no entity, that's a configuration error
        if (result.status === 'differential' && result.differentialData && !entity) {
          throw new Error(
            `Entity '${inputItem.params.EntityName}' not found in provider metadata but server returned differential data. ` +
            `This may indicate a metadata sync issue.`
          );
        }

        if (result.status === 'differential' && result.differentialData && entity) {
          // Process differential data into GraphQL-compatible format
          const processedUpdatedRows = this.processRawData(
            result.differentialData.updatedRows as Record<string, unknown>[],
            entity.ID,
            entity
          );
          return {
            viewIndex: result.viewIndex,
            status: result.status,
            Results: undefined,
            differentialData: {
              updatedRows: processedUpdatedRows,
              deletedRecordIDs: result.differentialData.deletedRecordIDs,
            },
            maxUpdatedAt: result.maxUpdatedAt,
            rowCount: result.rowCount,
            errorMessage: result.errorMessage,
          };
        }

        if (result.status === 'stale' && result.results && entity) {
          // Process raw data into GraphQL-compatible format (full refresh)
          const processedRows = this.processRawData(result.results as Record<string, unknown>[], entity.ID, entity);
          return {
            viewIndex: result.viewIndex,
            status: result.status,
            Results: processedRows,
            differentialData: undefined,
            maxUpdatedAt: result.maxUpdatedAt,
            rowCount: result.rowCount,
            errorMessage: result.errorMessage,
          };
        }

        return {
          viewIndex: result.viewIndex,
          status: result.status,
          Results: undefined,
          differentialData: undefined,
          maxUpdatedAt: result.maxUpdatedAt,
          rowCount: result.rowCount,
          errorMessage: result.errorMessage,
        };
      });

      return {
        success: response.success,
        results: transformedResults,
        errorMessage: response.errorMessage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      LogError(err);
      return {
        success: false,
        results: [],
        errorMessage,
      };
    }
  }

  protected processRawData(rawData: any[], entityId: string, entityInfo: EntityInfo): RunViewResultRow[] {
    const returnResult = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      
      // Build the primary key array from the entity's primary key fields
      const primaryKey: KeyValuePairOutputType[] = entityInfo.PrimaryKeys.map(pk => ({
        FieldName: pk.Name,
        Value: row[pk.Name]?.toString() || ''
      }));
      
      returnResult.push({
        PrimaryKey: primaryKey,
        EntityID: entityId,
        Data: JSON.stringify(row),
      });
    }
    return returnResult;
  }
}
