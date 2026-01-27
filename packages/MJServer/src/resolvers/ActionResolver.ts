import { Resolver, Mutation, Arg, Ctx } from "type-graphql";
import { ActionEngineServer } from "@memberjunction/actions";
import { EntityActionEngineServer } from "@memberjunction/actions";
import { Metadata, UserInfo, BaseEntity, CompositeKey, KeyValuePair, LogError } from "@memberjunction/core";
import { ActionParam, ActionResult } from "@memberjunction/actions-base";
import { Field, InputType, ObjectType } from "type-graphql";
import { KeyValuePairInput } from "../generic/KeyValuePairInput.js";
import { AppContext, ProviderInfo } from "../types.js";
import { CopyScalarsAndArrays } from "@memberjunction/global";
import { GetReadOnlyProvider } from "../util.js";
import { ResolverBase } from "../generic/ResolverBase.js";

/**
 * Input type for action parameters
 * Used to pass parameters to actions when invoking them
 */
@InputType()
export class ActionParamInput {
  /**
   * The name of the parameter
   */
  @Field()
  Name: string;

  /**
   * The value of the parameter
   * Complex objects should be serialized to JSON strings
   */
  @Field({ nullable: true })
  Value: string;

  /**
   * The data type of the parameter
   * Used for type conversion on the server
   */
  @Field()
  Type: string;
}

/**
 * Input type for running an action
 */
@InputType()
export class RunActionInput {
  /**
   * The ID of the action to run
   */
  @Field()
  ActionID: string;

  /**
   * Parameters to pass to the action
   */
  @Field(() => [ActionParamInput], { nullable: true })
  Params?: ActionParamInput[];

  /**
   * Whether to skip logging the action execution
   * Defaults to false
   */
  @Field(() => Boolean, { nullable: true })
  SkipActionLog?: boolean;
}
 
/**
 * Represents a collection of key-value pairs that make up a composite key
 * Used for both primary keys and foreign keys
 */
@InputType()
export class CompositeKeyInput {
  /**
   * The collection of key-value pairs that make up the composite key
   */
  @Field(() => [KeyValuePairInput])
  KeyValuePairs: KeyValuePairInput[];
}

/**
 * Input type for running entity actions
 */
@InputType()
export class EntityActionInput {
  /**
   * The ID of the entity action to run
   */
  @Field()
  EntityActionID: string;

  /**
   * The type of invocation (SingleRecord, View, List, etc.)
   */
  @Field()
  InvocationType: string;

  /**
   * The name of the entity
   * This is the preferred way to identify an entity as it's more human-readable than EntityID
   */
  @Field(() => String, { nullable: true })
  EntityName?: string;
  
  /**
   * The ID of the entity
   * Use EntityName instead when possible for better code readability
   * @deprecated Use EntityName instead when possible
   */
  @Field(() => String, { nullable: true })
  EntityID?: string;

  /**
   * The primary key of the entity record to act on
   * This is used for SingleRecord invocation types
   */
  @Field(() => CompositeKeyInput, { nullable: true })
  PrimaryKey?: CompositeKeyInput;

  /**
   * The ID of the list to operate on
   * This is used for List invocation types
   */
  @Field(() => String, { nullable: true })
  ListID?: string;

  /**
   * The ID of the view to operate on
   * This is used for View invocation types
   */
  @Field(() => String, { nullable: true })
  ViewID?: string;

  /**
   * Additional parameters to pass to the action
   */
  @Field(() => [ActionParamInput], { nullable: true })
  Params?: ActionParamInput[];
}

/**
 * Output type for action results
 * Used to return results from actions to clients
 */
@ObjectType()
export class ActionResultOutput {
  /**
   * Whether the action was executed successfully
   */
  @Field()
  Success: boolean;

  /**
   * Optional message describing the result of the action
   */
  @Field({ nullable: true })
  Message?: string;

  /**
   * Optional result code from the action
   */
  @Field(() => String, { nullable: true })
  ResultCode?: string;

  /**
   * Optional result data from the action
   * Complex objects are serialized to JSON strings
   */
  @Field(() => String, { nullable: true })
  ResultData?: string;
}

/**
 * Resolver for action-related GraphQL operations
 * Handles running actions and entity actions through GraphQL
 */
@Resolver()
export class ActionResolver extends ResolverBase {
  /**
   * Mutation for running an action
   * @param input The input parameters for running the action
   * @param ctx The GraphQL context containing user authentication information
   * @returns The result of running the action
   */
  @Mutation(() => ActionResultOutput)
  async RunAction(
    @Arg("input") input: RunActionInput,
    @Ctx() ctx: AppContext
  ): Promise<ActionResultOutput> {
    try {
      // Check API key scope authorization for action execution
      await this.CheckAPIKeyScopeAuthorization('action:execute', input.ActionID, ctx.userPayload);

      // Get the user from context
      const user = ctx.userPayload.userRecord;
      if (!user) {
        throw new Error("User is not authenticated");
      }

      // Initialize the action engine
      await ActionEngineServer.Instance.Config(false, user);

      // Get the action by ID
      const action = this.findActionById(input.ActionID);

      // Parse the parameters
      const params = this.parseActionParameters(input.Params);

      // Run the action
      const result = await this.executeAction(action, user, params, input.SkipActionLog);

      // Return the result
      return this.createActionResult(result);
    } catch (e) {
      return this.handleActionError(e);
    }
  }

  /**
   * Finds an action by its ID
   * @param actionID The ID of the action to find
   * @returns The action
   * @throws Error if the action is not found
   * @private
   */
  private findActionById(actionID: string): any {
    const action = ActionEngineServer.Instance.Actions.find(a => a.ID === actionID);
    if (!action) {
      throw new Error(`Action with ID ${actionID} not found`);
    }
    return action;
  }

  /**
   * Parses action parameters from the input
   * @param inputParams The input parameters
   * @returns The parsed parameters
   * @private
   */
  private parseActionParameters(inputParams?: ActionParamInput[]): ActionParam[] {
    if (!inputParams || inputParams.length === 0) {
      return [];
    }

    return inputParams.map(p => {
      let value: any = p.Value;
      
      // Try to parse JSON for complex values
      try {
        if (p.Value && (p.Type === 'object' || p.Type === 'array')) {
          value = JSON.parse(p.Value);
        }
      } catch (e) {
        // If parsing fails, keep the original value
        const error = e as Error;
        LogError(`Failed to parse parameter value as JSON: ${error.message}`);
      }
      
      return {
        Name: p.Name,
        Value: value,
        Type: 'Input' // Default to Input type since we're sending parameters
      };
    });
  }

  /**
   * Executes an action
   * @param action The action to execute
   * @param user The user context
   * @param params The action parameters
   * @param skipActionLog Whether to skip action logging
   * @returns The action result
   * @private
   */
  private async executeAction(
    action: any, 
    user: UserInfo, 
    params: ActionParam[], 
    skipActionLog?: boolean
  ): Promise<ActionResult> {
    return await ActionEngineServer.Instance.RunAction({
      Action: action,
      ContextUser: user,
      Params: params,
      SkipActionLog: skipActionLog,
      Filters: []
    });
  }

  /**
   * Creates an action result from the execution result
   * @param result The execution result
   * @returns The formatted action result
   * @private
   */
  private createActionResult(result: ActionResult): ActionResultOutput {
    const x =(result.Params || result.RunParams.Params || [])
              .filter(p => p.Type.trim().toLowerCase() === 'output' ||
                           p.Type.trim().toLowerCase() === 'both')     ;
    return {
      Success: result.Success,
      Message: result.Message,
      ResultCode: result.Result?.ResultCode,
      ResultData: x && x.length > 0 ? JSON.stringify(CopyScalarsAndArrays(x)) : undefined
    };
  }

  /**
   * Handles errors in the action resolver
   * @param e The error
   * @returns An error result
   * @private
   */
  private handleActionError(e: unknown): ActionResultOutput {
    const error = e as Error;
    LogError(`Error in RunAction resolver: ${error}`);
    return {
      Success: false,
      Message: `Error executing action: ${error.message}`
    };
  }

  /**
   * Mutation for running an entity action
   * @param input The input parameters for running the entity action
   * @param ctx The GraphQL context containing user authentication information
   * @returns The result of running the entity action
   */
  @Mutation(() => ActionResultOutput)
  async RunEntityAction(
    @Arg("input") input: EntityActionInput,
    @Ctx() ctx: AppContext
  ): Promise<ActionResultOutput> {
    try {
      // Check API key scope authorization for entity action execution
      await this.CheckAPIKeyScopeAuthorization('action:execute', input.EntityActionID, ctx.userPayload);

      const user = ctx.userPayload.userRecord;
      if (!user) {
        throw new Error("User is not authenticated");
      }

      // Initialize the entity action engine
      await EntityActionEngineServer.Instance.Config(false, user);

      // Get the entity action by ID
      const entityAction = this.getEntityAction(input.EntityActionID);

      // Create the base parameters
      const params = this.createBaseParams(entityAction, input.InvocationType, user);

      // Add entity object if we have entity information and primary key
      if ((input.EntityID || input.EntityName) && input.PrimaryKey && input.PrimaryKey.KeyValuePairs.length > 0) {
        await this.addEntityObject(ctx.providers, params, input, user);
      }

      // Add other parameters
      this.addOptionalParams(params, input);

      // Run the entity action
      const result = await EntityActionEngineServer.Instance.RunEntityAction(params);

      // Return the result
      return {
        Success: result.Success,
        Message: result.Message,
        ResultData: JSON.stringify(result)
      };
    } catch (e) {
      return this.handleError(e);
    }
  }
 
  /**
   * Gets an entity action by ID
   * @param actionID The ID of the entity action
   * @returns The entity action
   * @throws Error if entity action is not found
   * @private
   */
  private getEntityAction(actionID: string): any {
    const entityAction = EntityActionEngineServer.Instance.EntityActions.find(ea => ea.ID === actionID);
    if (!entityAction) {
      throw new Error(`EntityAction with ID ${actionID} not found`);
    }
    return entityAction;
  }

  /**
   * Creates the base parameters for the entity action
   * @param entityAction The entity action
   * @param invocationTypeName The invocation type name
   * @param user The authenticated user
   * @returns The base parameters
   * @private
   */
  private createBaseParams(entityAction: any, invocationTypeName: string, user: UserInfo): any {
    return {
      EntityAction: entityAction,
      InvocationType: { Name: invocationTypeName },
      ContextUser: user,
      Params: [],
    };
  }

  /**
   * Adds the entity object to the parameters
   * @param params The parameters to add to
   * @param input The input parameters
   * @param user The authenticated user
   * @private
   */
  private async addEntityObject(providers: Array<ProviderInfo>, params: any, input: EntityActionInput, user: UserInfo): Promise<void> {
    const md = GetReadOnlyProvider(providers);
    
    // Find the entity by ID or name
    let entity;
    if (input.EntityName) {
      entity = md.Entities.find(e => e.Name === input.EntityName);
      if (!entity) {
        throw new Error(`Entity with name ${input.EntityName} not found`);
      }
    } else if (input.EntityID) {
      entity = md.Entities.find(e => e.ID === input.EntityID);
      if (!entity) {
        throw new Error(`Entity with ID ${input.EntityID} not found`);
      }
    }

    if (!entity) {
      throw new Error("Entity information is required");
    }

    // Create a composite key and load the entity object
    const compositeKey = this.createCompositeKey(entity, input.PrimaryKey);
    const entityObject = await md.GetEntityObject(entity.Name);
    await entityObject.InnerLoad(compositeKey);
    params['EntityObject'] = entityObject;
  }

  /**
   * Creates a composite key from the input
   * @param entity The entity information
   * @param primaryKey The primary key input
   * @returns The composite key
   * @private
   */
  private createCompositeKey(entity: any, primaryKey: CompositeKeyInput): CompositeKey {
    const compositeKey = new CompositeKey();
    
    for (const kvp of primaryKey.KeyValuePairs) {
      // Convert value based on the field type if necessary
      const field = entity.Fields.find(f => f.Name === kvp.Key);
      let value: any = kvp.Value;
      
      // If the field is found, try to convert to proper type
      if (field) {
        value = this.convertValueToProperType(value, field);
      }
      
      // Add to composite key
      const kvPair = new KeyValuePair();
      kvPair.FieldName = kvp.Key;
      kvPair.Value = value;
      compositeKey.KeyValuePairs.push(kvPair);
    }
    
    return compositeKey;
  }

  /**
   * Converts a value to the proper type based on the field information
   * @param value The value to convert
   * @param field The field information
   * @returns The converted value
   * @private
   */
  private convertValueToProperType(value: any, field: any): any {
    // Simple conversion, could be enhanced for other types
    if (field.Type.toLowerCase().match(/int|decimal|float|money|numeric|real/) && !isNaN(Number(value))) {
      return Number(value);
    } else if (field.Type.toLowerCase().includes('date') && !isNaN(Date.parse(value))) {
      return new Date(value);
    }
    return value;
  }

  /**
   * Adds optional parameters to the entity action parameters
   * @param params The parameters to add to
   * @param input The input parameters
   * @private
   */
  private addOptionalParams(params: any, input: EntityActionInput): void {
    // Add list ID if provided
    if (input.ListID) {
      params['ListID'] = input.ListID;
    }

    // Add view ID if provided
    if (input.ViewID) {
      params['ViewID'] = input.ViewID;
    }

    // Add additional parameters if provided
    if (input.Params && input.Params.length > 0) {
      params.Params = input.Params.map(p => this.convertParameterValue(p));
    }
  }

  /**
   * Converts a parameter value to the proper format
   * @param p The parameter to convert
   * @returns The converted parameter
   * @private
   */
  private convertParameterValue(p: ActionParamInput): any {
    let value: any = p.Value;
    
    // Try to parse JSON for complex values
    try {
      if (p.Value && (p.Type === 'object' || p.Type === 'array')) {
        value = JSON.parse(p.Value);
      }
    } catch (e) {
      // If parsing fails, keep the original value
      const error = e as Error;
      LogError(`Failed to parse parameter value as JSON: ${error.message}`);
    }
    
    return {
      Name: p.Name,
      Value: value,
      Type: 'Input' // Default to Input type since we're sending parameters
    };
  }

  /**
   * Handles errors in the entity action resolver
   * @param e The error
   * @returns An error result
   * @private
   */
  private handleError(e: unknown): ActionResultOutput {
    const error = e as Error;
    LogError(`Error in RunEntityAction resolver: ${error}`);
    return {
      Success: false,
      Message: `Error executing entity action: ${error.message}`
    };
  }
}