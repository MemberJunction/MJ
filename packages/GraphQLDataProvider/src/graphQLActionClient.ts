import { ActionParam, ActionResult, EntityActionInvocationParams, EntityActionResult } from "@memberjunction/actions-base";
import { CompositeKey, LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/**
 * Client for executing actions and entity actions through GraphQL.
 * This class provides an easy way to execute actions from a client application,
 * similar to how the ActionEngine and EntityActionEngine work on the server.
 * 
 * The GraphQLActionClient follows the same naming convention as other GraphQL clients
 * in the MemberJunction ecosystem, such as GraphQLSystemUserClient.
 * 
 * @example
 * ```typescript
 * // Create the client
 * const actionClient = new GraphQLActionClient(graphQLProvider);
 * 
 * // Run a regular action
 * const result = await actionClient.RunAction("action-id", [
 *   { Name: "parameter1", Value: "value1", Type: "Input" }
 * ]);
 * 
 * // Run an entity action
 * const entityActionResult = await actionClient.RunEntityAction({
 *   EntityAction: action,
 *   InvocationType: { Name: "SingleRecord" },
 *   EntityObject: entityObject,
 *   ContextUser: user
 * });
 * ```
 */
export class GraphQLActionClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     * @private
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLActionClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run an action by its ID with the specified parameters.
     * 
     * This method invokes an action on the server through GraphQL and returns the result.
     * Action parameters are automatically serialized as needed, and results are deserialized
     * for complex data types.
     * 
     * @param actionID The ID of the action to run
     * @param params Optional parameters to pass to the action
     * @param skipActionLog Whether to skip logging the action execution (defaults to false)
     * @returns A Promise that resolves to an ActionResult object containing the result of running the action
     * 
     * @example
     * ```typescript
     * const result = await actionClient.RunAction("action-id", [
     *   { Name: "param1", Value: "value1", Type: "Input" }
     * ]);
     * 
     * if (result.Success) {
     *   // Action was successful
     *   console.log(result.Message);
     * }
     * ```
     */
    public async RunAction(
        actionID: string, 
        params?: ActionParam[], 
        skipActionLog: boolean = false
    ): Promise<ActionResult> {
        try {
            // Prepare the input variables
            const serializedParams = this.serializeActionParameters(params);
            const variables = this.createActionVariables(actionID, serializedParams, skipActionLog);
            
            // Execute the mutation
            const result = await this.executeActionMutation(variables);
            
            // Process the result
            return this.processActionResult(result, params);
        } catch (e) {
            return this.handleActionError(e, params);
        }
    }

    /**
     * Serializes action parameters to ensure complex objects are properly JSON-encoded
     * @param params The action parameters to serialize
     * @returns The serialized parameters
     * @private
     */
    private serializeActionParameters(params?: ActionParam[]): any[] | undefined {
        if (!params) {
            return undefined;
        }

        return params.map(p => {
            let value = p.Value;
            if (value !== null && value !== undefined && typeof value === 'object') {
                value = JSON.stringify(value);
            }
            return {
                ...p,
                Value: value
            };
        });
    }

    /**
     * Creates the variables for the action mutation
     * @param actionID The ID of the action to run
     * @param params The serialized action parameters
     * @param skipActionLog Whether to skip action logging
     * @returns The action variables
     * @private
     */
    private createActionVariables(
        actionID: string, 
        params?: any[], 
        skipActionLog: boolean = false
    ): any {
        return {
            input: {
                ActionID: actionID,
                Params: params,
                SkipActionLog: skipActionLog
            }
        };
    }

    /**
     * Executes the action mutation
     * @param variables The variables for the mutation
     * @returns The result of the mutation
     * @private
     */
    private async executeActionMutation(variables: any): Promise<any> {
        const mutation = gql`
            mutation RunAction($input: RunActionInput!) {
                RunAction(input: $input) {
                    Success
                    Message
                    ResultCode
                    ResultData
                }
            }
        `;

        return await this._dataProvider.ExecuteGQL(mutation, variables);
    }

    /**
     * Processes the result of an action
     * @param result The result from the GraphQL query
     * @param originalParams The original parameters passed to the action
     * @returns The processed action result
     * @private
     */
    private processActionResult(result: any, originalParams?: ActionParam[]): ActionResult {
        if (!result?.RunAction) {
            throw new Error("Invalid response from server");
        }

        // Parse the ResultData if it exists
        let resultData = undefined;
        try {
            if (result.RunAction.ResultData) {
                resultData = JSON.parse(result.RunAction.ResultData);
            }
        } catch (e) {
            LogError(`Failed to parse action result data: ${e}`);
        }

        // Return a properly formatted ActionResult
        return {
            Success: result.RunAction.Success,
            Message: result.RunAction.Message,
            Result: resultData,
            LogEntry: null, // We don't return the log entry to clients
            Params: originalParams || [],
            RunParams: null // We don't return the run params to clients
        };
    }

    /**
     * Handles errors in the action execution
     * @param e The error
     * @param originalParams The original parameters passed to the action
     * @returns An error result
     * @private
     */
    private handleActionError(e: unknown, originalParams?: ActionParam[]): ActionResult {
        const error = e as Error;
        LogError(`Error running action: ${error}`);
        return {
            Success: false,
            Message: `Error: ${error.message}`,
            Result: null,
            LogEntry: null,
            Params: originalParams || [],
            RunParams: null
        };
    }

    /**
     * Run an entity action with the specified parameters.
     * 
     * This method invokes an entity action on the server through GraphQL and returns the result.
     * Entity actions are operations that can be performed on entity records, such as validation,
     * business logic, or custom processing. They can operate on a single record, a view, or a list.
     * 
     * @param params The parameters for the entity action, including the action to run, 
     *               invocation type, entity object or view/list IDs, and optional parameters
     * @returns A Promise that resolves to an EntityActionResult object containing the result
     * 
     * @example
     * ```typescript
     * // Run an entity action on a single record
     * const result = await actionClient.RunEntityAction({
     *   EntityAction: action,
     *   InvocationType: { Name: "SingleRecord" },
     *   EntityObject: entityObject,
     *   ContextUser: user
     * });
     * 
     * // Run an entity action on a view
     * const viewResult = await actionClient.RunEntityAction({
     *   EntityAction: action,
     *   InvocationType: { Name: "View" },
     *   ViewID: "view-id",
     *   ContextUser: user
     * });
     * ```
     */
    public async RunEntityAction(params: EntityActionInvocationParams): Promise<EntityActionResult> {
        try {
            // Create the GraphQL input
            const input = this.createEntityActionInput(params);

            // Execute the GraphQL mutation
            const result = await this.executeEntityActionMutation(input);

            // Process the result
            return this.processEntityActionResult(result);
        } catch (e) {
            return this.handleEntityActionError(e);
        }
    }

    /**
     * Creates the GraphQL input for an entity action
     * @param params The entity action parameters
     * @returns The GraphQL input
     * @private
     */
    private createEntityActionInput(params: EntityActionInvocationParams): any {
        const input: any = {
            EntityActionID: params.EntityAction.ID,
            InvocationType: params.InvocationType.Name,
            ListID: params.ListID,
            ViewID: params.ViewID,
        };
        
        // Add parameters if available
        if ((params as any).Params) {
            input.Params = this.convertActionParams((params as any).Params);
        }
        
        // Add entity information if available
        if (params.EntityObject) {
            this.addEntityInformation(input, params.EntityObject);
        }

        return input;
    }

    /**
     * Converts action parameters to the format expected by the GraphQL API
     * @param params The action parameters
     * @returns The converted parameters
     * @private
     */
    private convertActionParams(params: any[]): any[] {
        return params.map(p => {
            let value = p.Value;
            if (value !== null && value !== undefined && typeof value === 'object') {
                value = JSON.stringify(value);
            }
            return {
                Name: p.Name,
                Value: value,
                Type: p.Type
            };
        });
    }

    /**
     * Adds entity information to the input object
     * @param input The input object to add to
     * @param entityObject The entity object
     * @private
     */
    private addEntityInformation(input: any, entityObject: any): void {
        // Prefer using entity name instead of ID for better code readability
        input.EntityName = entityObject.EntityInfo?.Name;
        
        // Convert the entity's primary key to the expected format
        if (entityObject.PrimaryKey) {
            input.PrimaryKey = this.convertPrimaryKey(entityObject.PrimaryKey);
        }
    }

    /**
     * Converts a primary key object to the format expected by the GraphQL API
     * @param primaryKey The primary key object
     * @returns The converted primary key
     * @private
     */
    private convertPrimaryKey(primaryKey: any): any {
        return {
            KeyValuePairs: primaryKey.KeyValuePairs.map(kvp => this.convertKeyValuePair(kvp))
        };
    }

    /**
     * Converts a key-value pair to a string format
     * @param kvp The key-value pair
     * @returns The converted key-value pair
     * @private
     */
    private convertKeyValuePair(kvp: any): any {
        return {
            FieldName: kvp.FieldName,
            Value: kvp.Value !== null && kvp.Value !== undefined ? 
                  (typeof kvp.Value === 'object' ? JSON.stringify(kvp.Value) : kvp.Value.toString()) 
                  : null
        };
    }

    /**
     * Executes the GraphQL mutation for an entity action
     * @param input The GraphQL input
     * @returns The GraphQL result
     * @private
     */
    private async executeEntityActionMutation(input: any): Promise<any> {
        const mutation = gql`
            mutation RunEntityAction($input: EntityActionInput!) {
                RunEntityAction(input: $input) {
                    Success
                    Message
                    ResultData
                }
            }
        `;

        return await this._dataProvider.ExecuteGQL(mutation, { input });
    }

    /**
     * Processes the result of an entity action
     * @param result The GraphQL result
     * @returns The processed entity action result
     * @private
     */
    private processEntityActionResult(result: any): EntityActionResult {
        if (!result?.RunEntityAction) {
            throw new Error("Invalid response from server");
        }

        // Parse the ResultData
        let resultData = {};
        try {
            if (result.RunEntityAction.ResultData) {
                resultData = JSON.parse(result.RunEntityAction.ResultData);
            }
        } catch (e) {
            LogError(`Failed to parse entity action result data: ${e}`);
        }

        // Return a properly formatted EntityActionResult
        return {
            Success: result.RunEntityAction.Success,
            Message: result.RunEntityAction.Message,
            RunParams: null, // We don't return run params to clients
            LogEntry: null,  // We don't return the log entry to clients
            ...resultData
        };
    }

    /**
     * Handles errors in the entity action
     * @param e The error
     * @returns An error result
     * @private
     */
    private handleEntityActionError(e: unknown): EntityActionResult {
        const error = e as Error;
        LogError(`Error running entity action: ${error}`);
        return {
            Success: false,
            Message: `Error: ${error.message}`,
            RunParams: null,
            LogEntry: null
        };
    }
}