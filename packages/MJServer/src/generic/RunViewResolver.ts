import { Arg, Ctx, Field, InputType, Int, ObjectType, PubSubEngine, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { ResolverBase } from './ResolverBase.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadOnlyProvider } from '../util.js';
import { UserViewEntity } from '@memberjunction/core-entities';

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

@ObjectType()
export class RunViewResultRow {
  @Field(() => String)
  ID: string;

  @Field(() => String)
  EntityID: string;

  @Field(() => String)
  Data: string;
}

@ObjectType()
export class RunViewGenericResultRow {
  @Field(() => String)
  ID: string;

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

      const viewInfo = super.safeFirstArrayElement<UserViewEntity>(await super.findBy<UserViewEntity>(provider, "User Views", { Name: input.ViewName }, userPayload.userRecord));
      const returnData = this.processRawData(rawData.Results, viewInfo.EntityID);
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

      const viewInfo = super.safeFirstArrayElement<UserViewEntity>(await super.findBy<UserViewEntity>(provider, "User Views", { ID: input.ViewID }, userPayload.userRecord));
      const returnData = this.processRawData(rawData.Results, viewInfo.EntityID);
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
      const returnData = this.processRawData(rawData.Results, entity.ID);
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
        const returnData: any[] = this.processRawData(data.Results, entity.ID);

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
      if (rawData === null) return null;

      const entity = provider.Entities.find((e) => e.Name === input.ViewName);
      const entityId = entity ? entity.ID : null;
      const returnData = this.processRawData(rawData.Results, entityId);
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
      LogError(err);
      return null;
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
      if (rawData === null) return null;

      const viewInfo = super.safeFirstArrayElement<UserViewEntity>(await super.findBy<UserViewEntity>(provider, "User Views", { ID: input.ViewID }, userPayload.userRecord));
      const returnData = this.processRawData(rawData.Results, viewInfo.EntityID);
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
      LogError(err);
      return null;
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
      if (rawData === null) return null;

      const entity = provider.Entities.find((e) => e.Name === input.EntityName);
      if (!entity) {
        LogError(new Error(`Entity with name ${input.EntityName} not found`));
        return null;
      }
      const returnData = this.processRawData(rawData.Results, entity.ID);
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
      LogError(err);
      return null;
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
        const returnData: any[] = this.processRawData(data.Results, entity.ID);

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

  protected processRawData(rawData: any[], entityId: string): RunViewResultRow[] {
    const returnResult = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      returnResult.push({
        ID: row.ID.toString(),
        EntityID: entityId,
        Data: JSON.stringify(row),
      });
    }
    return returnResult;
  }
}
