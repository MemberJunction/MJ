import { CompositeKey, LogError, KeyValuePair, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { gql, GraphQLClient } from 'graphql-request'
import { ActionItemInput, RolesAndUsersInput, SyncDataResult, SyncRolesAndUsersResult } from './rolesAndUsersType';
import { 
    RunAIPromptParams, 
    RunAIPromptResult, 
    ExecuteSimplePromptParams,
    SimplePromptResult,
    EmbedTextParams,
    EmbedTextResult
} from './graphQLAIClient';
import { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/**
 * Specialized client that is designed to be used exclusively on the server side
 * by the System User using the MJ API KEY. This is designed to allow server side
 * code such as within the context of an MJAPI server to talk to another MAJPI server
 * but as the client.
 * 
 * It is possible for a server to use the regular @GraphQLDataProvider client to talk
 * to another MJAPI server, but that would require the server to have a user account
 * and the server would have to be able to log in as that user via a JWT token. This
 * is not always possible or convenient in the flow. 
 * 
 * Also the standard client configuration process has a certain amount over overhead
 * in always loading up certain metadata that is not necessary for many system user
 * operations.
 * 
 * Finaly, this client can be used in parallel with the regular client to allow a server
 * to mix and match the two as needed.
 */
export class GraphQLSystemUserClient {
    private _client: GraphQLClient;
    private _sessionId: string;
    /**
     * Returns the underlying GraphQL client which is an instance of the GraphQLClient object
     * from the graphql-request package. This is useful if you want to perform any operation
     * that is not directly supported by this class via specialized methods.
     */
    public get Client(): GraphQLClient {
        return this._client;
    }

    /**
     * @param url MJAPI server URL
     * @param token Optional, JWT token that is used for a normal user authentication flow. This is required if mjAPIKey is not provided.
     * @param sessionId Optional, UUID that is used to track a session. This can be any string.
     * @param mjAPIKey Shared Secret key that is provided for system user authentication. This is required if token is not provided.
     * @returns 
     */
    constructor (url: string, token: string, sessionId: string, mjAPIKey: string) {
        const headers: Record<string, string> = { 
            'x-session-id': sessionId,
        };
        this._sessionId = sessionId;
        if (token)
            headers.authorization = 'Bearer ' + token;
        if (mjAPIKey)
            headers['x-mj-api-key'] = mjAPIKey;

        this._client = new GraphQLClient(url, {
            headers
        });
    }

    /**
     * Calls the GetData() query on the server to execute any number of provided SQL queries in parallel and returns the results.
     * The queries MUST BE read only and not perform any DML operations. The remote server will execute the queries using a special
     * lower-privilege user that is not allowed to perform any form of write operations.
     * @param queries an array of SQL queries to execute on the remote server
     * @param accessToken the short-lived access token that is required to perform this operation. This is different from the MJAPI key and is used for a second factor and is a short-lived token. You will receive this token 
     * when an MJAPI calls your server to request something along with the URL to call back.
     * @returns 
     */
    public async GetData(queries: string[], accessToken: string): Promise<GetDataOutput> {
        try {
            const query = `query GetData($input: GetDataInputType!) {
                GetData(input: $input) {
                    Success
                    ErrorMessages
                    Queries
                    Results
                }
            }`
            const result = await this.Client.request(query, {input: {Queries: queries, Token: accessToken}}) as {GetData: GetDataOutput};
            if (result && result.GetData) {
                // for each succesful item, we will parse and return the array of objects instead of the string
                return {
                    Success: result.GetData.Success,
                    Results: result.GetData.Results.map(r => r ? SafeJSONParse(r) : null),
                    ErrorMessages: result.GetData.ErrorMessages,
                    Queries: result.GetData.Queries 
                }
            }
            else {
                return {
                    Success: false,
                    Results: [],
                    ErrorMessages: result.GetData?.ErrorMessages ?? ['Unknown error'],
                    Queries: result.GetData?.Queries ?? queries
                }
            }
        }
        catch (e) {
            // Extract clean error message - the GraphQL error response contains the actual SQL error
            let cleanError = e instanceof Error ? e.message : String(e);

            // Try to extract just the SQL error from GraphQL response
            // Look for the actual error message before the JSON payload
            const match = cleanError.match(/Error: ([^:]+)\./);
            if (match) {
                cleanError = match[1] + '.';
            }

            // Only log verbose details if in verbose mode
            if (IsVerboseLoggingEnabled()) {
                const verboseError = `GraphQLSystemUserClient::GetData - Error getting data - ${e}`;
                LogError(verboseError);
            }

            return {
                Success: false,
                Results: [],
                ErrorMessages: [cleanError],
                Queries: queries
            }
        }
    }

    /**
     * This method will return a list of all entities that are available on the remote server. This is a lightweight call that only returns the basic metadata for each entity and does not include all of the attributes at 
     * either the entity or the field level. This is useful for getting a list of entities that are available on the remote server and knowing their IDs and Entity Field IDs on the remote server. For core MemberJunction 
     * entities and entity fields, the ID values are globally unique and set by the MemberJunction distribution, however, for other entities that are generated on each target system they can vary so it is best to use
     * lookups name or a combination of SchemaName and BaseTable to uniquely identify an entity.
     * @param client 
     * @returns 
     */
    public async GetAllRemoteEntities(): Promise<SimpleRemoteEntityOutput> {
        try {
            const query = `query GetAllEntities {
                GetAllEntities {
                    Success
                    ErrorMessage
                    Results {
                        ID
                        Name
                        Description
                        SchemaName
                        BaseView
                        BaseTable
                        CodeName
                        ClassName
                        Fields {
                            ID
                            Name
                            Description
                            Type
                            AllowsNull
                            MaxLength
                        }
                    }
                }
            }`

            const result = (await this.Client.request(query)) as {GetAllEntities: SimpleRemoteEntityOutput};
            if (result && result.GetAllEntities) {
                return result.GetAllEntities;
            }
            else {
                return {
                    Success: false,
                    Results: [],
                    ErrorMessage: result.GetAllEntities?.ErrorMessage ?? 'Unknown error'
                }
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::GetAllRemoteEntities - Error getting remote entities - ${e}`);
            return {
                Success: false,
                Results: [],
                ErrorMessage: e
            }
        }
    }

    /**
     * This method is used to invoke the data synchronization mutation on the remote server. This method is used to create, update, or delete records in the remote server. The method takes an array of ActionItemInput objects
     * Each of the ActionItemInput objects represents a single action to take on a single entity. The action can be Create, Update, CreateOrUpdate, Delete, or DeleteWithFilter. The RecordJSON field is used for Create, CreateOrUpdate and Update whereas
     * the DeleteFilter field is used for DeleteWithFilter. The PrimaryKey and AlternateKey fields are used to identify the record to be acted upon. 
     * 
     * Use of the AlternateKey is important for situations where you might have divergent primary keys across systems. For example for user entities that are individually generated on each system by CodeGen, the primary key will
     * be different per system, so you would use the combination of the SchemaName and BaseTable to identify the entity and then use the AlternateKey to provide the combination of these fields to uniquely identify the record for updates.
     * @param items 
     * @returns 
     */
    public async SyncData(items: ActionItemInput[]): Promise<SyncDataResult> {
        try {
            // call the resolver to sync the roles and users
            const query = `mutation SyncData($items: [ActionItemInputType!]!) {
                SyncData(items: $items) {
                    Success
                    Results {
                        Success
                        ErrorMessage
                        EntityName
                        Type
                        PrimaryKey {
                            KeyValuePairs {
                                FieldName
                                Value    
                            }
                        }
                        AlternateKey {
                            KeyValuePairs {
                                FieldName
                                Value    
                            }
                        }
                        DeleteFilter
                        RecordJSON
                    }
                }
            }`
            const d = <{SyncData: SyncDataResult}>await this.Client.request(query, {items});
            if (d && d.SyncData) {
                return d.SyncData;
            }
            else {
                return {
                    Success: false,
                    Results: []
                }
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::SyncData - Error syncing data - ${e}`);
            return {
                Success: false,
                Results: []
            }
        }
    }

    /**
     * This method will sync the roles and users on the remote server. This method is used to create, update, or delete roles and users on the remote server. 
     * The method takes a RolesAndUsersInput object that contains an array of RoleInput objects. Note that this will not result in the removal of roles on the 
     * remote server that are deemed to be built-in MemberJunction roles such as Developer, Integration and UI.
     * @param data 
     * @returns 
     */
    public async SyncRolesAndUsers(data: RolesAndUsersInput): Promise<SyncRolesAndUsersResult> {
        try {
            // call the resolver to sync the roles and users
            const query = `mutation SyncRolesAndUsers($data: RolesAndUsersInputType!) {
                SyncRolesAndUsers(data: $data) {
                    Success
                }
            }`
            const d = await this.Client.request(query, {data}) as {SyncRolesAndUsers: SyncRolesAndUsersResult};
            if (d && d.SyncRolesAndUsers) {
                return d.SyncRolesAndUsers;
            }
            else {
                return {
                    Success: false
                }
            }
        }   
        catch (e) {
            LogError(`GraphQLSystemUserClient::SyncRolesAndUsers - Error syncing roles and users - ${e}`);
            return {
                Success: false
            }
        }     
    }

    /**
     * Runs a view by name using the RunViewByNameSystemUser resolver.
     * @param input - View input parameters for running by name
     * @returns Promise containing the view execution results
     */
    public async RunViewByName(input: RunViewByNameSystemUserInput): Promise<RunViewSystemUserResult> {
        try {
            const query = `query RunViewByNameSystemUser($input: RunViewByNameInput!) {
                RunViewByNameSystemUser(input: $input) {
                    Results {
                        PrimaryKey {
                            FieldName
                            Value
                        }
                        EntityID
                        Data
                    }
                    UserViewRunID
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    ErrorMessage
                    Success
                }
            }`

            const result = await this.Client.request(query, { input }) as { RunViewByNameSystemUser: RunViewSystemUserResult };
            if (result && result.RunViewByNameSystemUser) {
                return result.RunViewByNameSystemUser;
            } else {
                return {
                    Results: [],
                    Success: false,
                    ErrorMessage: 'Failed to execute view by name'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::RunViewByNameSystemUser - Error running view by name - ${e}`);
            return {
                Results: [],
                Success: false,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Runs a view by ID using the RunViewByIDSystemUser resolver.
     * @param input - View input parameters for running by ID
     * @returns Promise containing the view execution results
     */
    public async RunViewByID(input: RunViewByIDSystemUserInput): Promise<RunViewSystemUserResult> {
        try {
            const query = `query RunViewByIDSystemUser($input: RunViewByIDInput!) {
                RunViewByIDSystemUser(input: $input) {
                    Results {
                        PrimaryKey {
                            FieldName
                            Value
                        }
                        EntityID
                        Data
                    }
                    UserViewRunID
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    ErrorMessage
                    Success
                }
            }`

            const result = await this.Client.request(query, { input }) as { RunViewByIDSystemUser: RunViewSystemUserResult };
            if (result && result.RunViewByIDSystemUser) {
                return result.RunViewByIDSystemUser;
            } else {
                return {
                    Results: [],
                    Success: false,
                    ErrorMessage: 'Failed to execute view by ID'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::RunViewByIDSystemUser - Error running view by ID - ${e}`);
            return {
                Results: [],
                Success: false,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Runs a dynamic view using the RunDynamicViewSystemUser resolver.
     * @param input - View input parameters for dynamic view execution
     * @returns Promise containing the view execution results
     */
    public async RunDynamicView(input: RunDynamicViewSystemUserInput): Promise<RunViewSystemUserResult> {
        try {
            const query = `query RunDynamicViewSystemUser($input: RunDynamicViewInput!) {
                RunDynamicViewSystemUser(input: $input) {
                    Results {
                        PrimaryKey {
                            FieldName
                            Value
                        }
                        EntityID
                        Data
                    }
                    UserViewRunID
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    ErrorMessage
                    Success
                }
            }`

            const result = await this.Client.request(query, { input }) as { RunDynamicViewSystemUser: RunViewSystemUserResult };
            if (result && result.RunDynamicViewSystemUser) {
                return result.RunDynamicViewSystemUser;
            } else {
                return {
                    Results: [],
                    Success: false,
                    ErrorMessage: 'Failed to execute dynamic view'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::RunDynamicViewSystemUser - Error running dynamic view - ${e}`);
            return {
                Results: [],
                Success: false,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Runs multiple views using the RunViewsSystemUser resolver. This method allows system users
     * to execute view queries with the same functionality as regular users but with system-level privileges.
     * @param input - Array of view input parameters
     * @returns Promise containing the results from all view executions
     */
    public async RunViews(input: RunViewSystemUserInput[]): Promise<RunViewSystemUserResult[]> {
        try {
            const query = `query RunViewsSystemUser($input: [RunViewGenericInput!]!) {
                RunViewsSystemUser(input: $input) {
                    Results {
                        PrimaryKey {
                            FieldName
                            Value
                        }
                        EntityID
                        Data
                    }
                    UserViewRunID
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    ErrorMessage
                    Success
                }
            }`

            const result = await this.Client.request(query, { input }) as { RunViewsSystemUser: RunViewSystemUserResult[] };
            if (result && result.RunViewsSystemUser) {
                return result.RunViewsSystemUser;
            } else {
                return [];
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::RunViewsSystemUser - Error running views - ${e}`);
            return [];
        }
    }

    /**
     * Executes a stored query by ID using the GetQueryDataSystemUser resolver.
     * @param input - Query input parameters for execution by ID
     * @returns Promise containing the query execution results
     */
    public async GetQueryData(input: GetQueryDataSystemUserInput): Promise<RunQuerySystemUserResult> {
        try {
            // Validate that Parameters is a JSON object, not an array
            if (input.Parameters !== undefined && Array.isArray(input.Parameters)) {
                throw new Error('Parameters must be a JSON object, not an array. Use {} for empty parameters instead of [].');
            }

            const query = `query GetQueryDataSystemUser($QueryID: String!, $CategoryID: String, $CategoryPath: String, $Parameters: JSONObject, $MaxRows: Int, $StartRow: Int) {
                GetQueryDataSystemUser(QueryID: $QueryID, CategoryID: $CategoryID, CategoryPath: $CategoryPath, Parameters: $Parameters, MaxRows: $MaxRows, StartRow: $StartRow) {
                    QueryID
                    QueryName
                    Success
                    Results
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    ErrorMessage
                    AppliedParameters
                }
            }`

            const variables: any = { QueryID: input.QueryID };
            if (input.CategoryID !== undefined) variables.CategoryID = input.CategoryID;
            if (input.CategoryPath !== undefined) variables.CategoryPath = input.CategoryPath;
            if (input.Parameters !== undefined) variables.Parameters = input.Parameters;
            if (input.MaxRows !== undefined) variables.MaxRows = input.MaxRows;
            if (input.StartRow !== undefined) variables.StartRow = input.StartRow;

            const result = await this.Client.request(query, variables) as { GetQueryDataSystemUser: RunQuerySystemUserResult };
            
            if (result && result.GetQueryDataSystemUser) {
                // Parse the JSON results for easier consumption
                return {
                    ...result.GetQueryDataSystemUser,
                    Results: result.GetQueryDataSystemUser.Results ? SafeJSONParse(result.GetQueryDataSystemUser.Results) : null
                };
            } else {
                return {
                    QueryID: input.QueryID,
                    QueryName: '',
                    Success: false,
                    Results: null,
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 0,
                    ErrorMessage: 'Query execution failed'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::GetQueryDataSystemUser - Error executing query - ${e}`);
            return {
                QueryID: input.QueryID,
                QueryName: '',
                Success: false,
                Results: null,
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Executes a stored query by name using the GetQueryDataByNameSystemUser resolver.
     * @param input - Query input parameters for execution by name
     * @returns Promise containing the query execution results
     */
    public async GetQueryDataByName(input: GetQueryDataByNameSystemUserInput): Promise<RunQuerySystemUserResult> {
        try {
            // Validate that Parameters is a JSON object, not an array
            if (input.Parameters !== undefined && Array.isArray(input.Parameters)) {
                throw new Error('Parameters must be a JSON object, not an array. Use {} for empty parameters instead of [].');
            }

            const query = `query GetQueryDataByNameSystemUser($QueryName: String!, $CategoryID: String, $CategoryPath: String, $Parameters: JSONObject, $MaxRows: Int, $StartRow: Int) {
                GetQueryDataByNameSystemUser(QueryName: $QueryName, CategoryID: $CategoryID, CategoryPath: $CategoryPath, Parameters: $Parameters, MaxRows: $MaxRows, StartRow: $StartRow) {
                    QueryID
                    QueryName
                    Success
                    Results
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    ErrorMessage
                    AppliedParameters
                }
            }`

            const variables: any = { QueryName: input.QueryName };
            if (input.CategoryID !== undefined) variables.CategoryID = input.CategoryID;
            if (input.CategoryPath !== undefined) variables.CategoryPath = input.CategoryPath;
            if (input.Parameters !== undefined) variables.Parameters = input.Parameters;
            if (input.MaxRows !== undefined) variables.MaxRows = input.MaxRows;
            if (input.StartRow !== undefined) variables.StartRow = input.StartRow;

            const result = await this.Client.request(query, variables) as { GetQueryDataByNameSystemUser: RunQuerySystemUserResult };
            
            if (result && result.GetQueryDataByNameSystemUser) {
                // Parse the JSON results for easier consumption
                return {
                    ...result.GetQueryDataByNameSystemUser,
                    Results: result.GetQueryDataByNameSystemUser.Results ? SafeJSONParse(result.GetQueryDataByNameSystemUser.Results) : null
                };
            } else {
                return {
                    QueryID: '',
                    QueryName: input.QueryName,
                    Success: false,
                    Results: null,
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 0,
                    ErrorMessage: 'Query execution failed'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::GetQueryDataByNameSystemUser - Error executing query - ${e}`);
            return {
                QueryID: '',
                QueryName: input.QueryName,
                Success: false,
                Results: null,
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Creates a new query using the CreateQuerySystemUser mutation. This method is restricted to system users only.
     * @param input - CreateQuerySystemUserInput containing all the query attributes including optional CategoryPath
     * @returns Promise containing the result of the query creation
     */
    public async CreateQuery(input: CreateQueryInput): Promise<CreateQueryResult> {
        try {
            const query = `mutation CreateQuerySystemUser($input: CreateQuerySystemUserInput!) {
                CreateQuerySystemUser(input: $input) {
                    Success
                    ErrorMessage
                    ID
                    Name
                    Description
                    CategoryID
                    Category
                    SQL
                    Status
                    QualityRank
                    EmbeddingVector
                    EmbeddingModelID
                    EmbeddingModelName
                    Fields {
                        ID
                        QueryID
                        Name
                        Description
                        Sequence
                        SQLBaseType
                        SQLFullType
                        SourceEntityID
                        SourceEntity
                        SourceFieldName
                        IsComputed
                        ComputationDescription
                        IsSummary
                        SummaryDescription
                    }
                    Parameters {
                        ID
                        QueryID
                        Name
                        Description
                        Type
                        IsRequired
                        DefaultValue
                        SampleValue
                        ValidationFilters
                    }
                    Entities {
                        ID
                        QueryID
                        EntityID
                        Entity
                    }
                    Permissions {
                        ID
                        QueryID
                        RoleID
                        Role
                    }
                }
            }`

            const result = await this.Client.request(query, { input }) as { CreateQuerySystemUser: CreateQueryResult };
            if (result && result.CreateQuerySystemUser) {
                return result.CreateQuerySystemUser;
            } else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to create query'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::CreateQuery - Error creating query - ${e}`);
            return {
                Success: false,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Updates an existing query with the provided attributes. This method is restricted to system users only.
     * @param input - UpdateQueryInput containing the query ID and fields to update
     * @returns Promise containing the result of the query update including updated fields, parameters, entities, and permissions
     */
    public async UpdateQuery(input: UpdateQueryInput): Promise<UpdateQueryResult> {
        try {
            const query = `mutation UpdateQuerySystemUser($input: UpdateQuerySystemUserInput!) {
                UpdateQuerySystemUser(input: $input) {
                    Success
                    ErrorMessage
                    ID
                    Name
                    Description
                    CategoryID
                    Category
                    SQL
                    Status
                    QualityRank
                    EmbeddingVector
                    EmbeddingModelID
                    EmbeddingModelName
                    Fields {
                        ID
                        QueryID
                        Name
                        Description
                        Sequence
                        SQLBaseType
                        SQLFullType
                        SourceEntityID
                        SourceEntity
                        SourceFieldName
                        IsComputed
                        ComputationDescription
                        IsSummary
                        SummaryDescription
                    }
                    Parameters {
                        ID
                        QueryID
                        Name
                        Description
                        Type
                        IsRequired
                        DefaultValue
                        SampleValue
                        ValidationFilters
                    }
                    Entities {
                        ID
                        QueryID
                        EntityID
                        Entity
                    }
                    Permissions {
                        ID
                        QueryID
                        RoleID
                        Role
                    }
                }
            }`

            const result = await this.Client.request(query, { input }) as { UpdateQuerySystemUser: UpdateQueryResult };
            if (result && result.UpdateQuerySystemUser) {
                return result.UpdateQuerySystemUser;
            } else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to update query'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::UpdateQuery - Error updating query - ${e}`);
            return {
                Success: false,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Deletes a query by ID using the DeleteQuerySystemResolver mutation. This method is restricted to system users only.
     * @param ID - The ID of the query to delete
     * @param options - Optional delete options controlling action execution
     * @returns Promise containing the result of the query deletion
     */
    public async DeleteQuery(ID: string, options?: DeleteQueryOptionsInput): Promise<DeleteQueryResult> {
        try {
            // Validate ID is not null/undefined/empty
            if (!ID || ID.trim() === '') {
                LogError('GraphQLSystemUserClient::DeleteQuery - Invalid query ID: ID cannot be null or empty');
                return {
                    Success: false,
                    ErrorMessage: 'Invalid query ID: ID cannot be null or empty'
                };
            }

            const query = `mutation DeleteQuerySystemResolver($ID: String!, $options: DeleteOptionsInput) {
                DeleteQuerySystemResolver(ID: $ID, options: $options) {
                    Success
                    ErrorMessage
                    ID
                    Name
                }
            }`

            const variables: any = { ID: ID };
            if (options !== undefined) {
                variables.options = options;
            }

            const result = await this.Client.request(query, variables) as { DeleteQuerySystemResolver: DeleteQueryResult };
            
            if (result && result.DeleteQuerySystemResolver) {
                return result.DeleteQuerySystemResolver;
            } else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to delete query'
                };
            }
        }
        catch (e) {
            LogError(`GraphQLSystemUserClient::DeleteQuery - Error deleting query - ${e}`);
            return {
                Success: false,
                ErrorMessage: e.toString()
            };
        }
    }

    /**
     * Run an AI prompt with system user privileges.
     * This method allows system-level execution of AI prompts without user authentication.
     * 
     * @param params The parameters for running the AI prompt
     * @returns A Promise that resolves to a RunAIPromptResult object
     * 
     * @example
     * ```typescript
     * const result = await systemClient.RunAIPrompt({
     *   promptId: "prompt-id",
     *   data: { systemData: "value" },
     *   skipValidation: true
     * });
     * ```
     */
    public async RunAIPrompt(params: RunAIPromptParams): Promise<RunAIPromptResult> {
        try {
            // Build the query for system user
            const query = gql`
                query RunAIPromptSystemUser(
                    $promptId: String!,
                    $data: String,
                    $overrideModelId: String,
                    $overrideVendorId: String,
                    $configurationId: String,
                    $skipValidation: Boolean,
                    $templateData: String,
                    $responseFormat: String,
                    $temperature: Float,
                    $topP: Float,
                    $topK: Int,
                    $minP: Float,
                    $frequencyPenalty: Float,
                    $presencePenalty: Float,
                    $seed: Int,
                    $stopSequences: [String!],
                    $includeLogProbs: Boolean,
                    $topLogProbs: Int,
                    $messages: String,
                    $rerunFromPromptRunID: String,
                    $systemPromptOverride: String
                ) {
                    RunAIPromptSystemUser(
                        promptId: $promptId,
                        data: $data,
                        overrideModelId: $overrideModelId,
                        overrideVendorId: $overrideVendorId,
                        configurationId: $configurationId,
                        skipValidation: $skipValidation,
                        templateData: $templateData,
                        responseFormat: $responseFormat,
                        temperature: $temperature,
                        topP: $topP,
                        topK: $topK,
                        minP: $minP,
                        frequencyPenalty: $frequencyPenalty,
                        presencePenalty: $presencePenalty,
                        seed: $seed,
                        stopSequences: $stopSequences,
                        includeLogProbs: $includeLogProbs,
                        topLogProbs: $topLogProbs,
                        messages: $messages,
                        rerunFromPromptRunID: $rerunFromPromptRunID,
                        systemPromptOverride: $systemPromptOverride
                    ) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        tokensUsed
                        promptRunId
                        rawResult
                        validationResult
                        chatResult
                    }
                }
            `;

            // Prepare variables
            const variables = this.preparePromptVariables(params);

            // Execute the query
            const result = await this.Client.request(query, variables) as { RunAIPromptSystemUser: any };

            // Process and return the result
            if (result && result.RunAIPromptSystemUser) {
                return this.processPromptResult(result.RunAIPromptSystemUser);
            } else {
                return {
                    success: false,
                    error: 'Failed to execute AI prompt as system user'
                };
            }
        } catch (e) {
            LogError(`GraphQLSystemUserClient::RunAIPrompt - Error running AI prompt - ${e}`);
            return {
                success: false,
                error: e.toString()
            };
        }
    }

    /**
     * Run an AI agent with system user privileges.
     * This method allows system-level execution of AI agents without user authentication.
     * 
     * @param params The parameters for running the AI agent
     * @returns A Promise that resolves to a RunAIAgentResult object
     * 
     * @example
     * ```typescript
     * const result = await systemClient.RunAIAgent({
     *   agentId: "agent-id",
     *   messages: [{ role: "system", content: "Process data" }],
     *   sessionId: "system-session"
     * });
     * ```
     */
    public async RunAIAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
        try {
            // Build the query for system user
            const query = gql`
                query RunAIAgentSystemUser(
                    $agentId: String!,
                    $messages: String!,
                    $sessionId: String!,
                    $data: String,
                    $templateData: String,
                    $lastRunId: String,
                    $autoPopulateLastRunPayload: Boolean,
                    $configurationId: String
                ) {
                    RunAIAgentSystemUser(
                        agentId: $agentId,
                        messages: $messages,
                        sessionId: $sessionId,
                        data: $data,
                        templateData: $templateData,
                        lastRunId: $lastRunId,
                        autoPopulateLastRunPayload: $autoPopulateLastRunPayload,
                        configurationId: $configurationId
                    ) {
                        success
                        errorMessage
                        executionTimeMs
                        result
                    }
                }
            `;

            // Prepare variables
            const variables = this.prepareAgentVariables(params);

            // Execute the query
            const result = await this.Client.request(query, variables) as { RunAIAgentSystemUser: any };

            // Process and return the result
            if (result && result.RunAIAgentSystemUser) {
                return this.processAgentResult(result.RunAIAgentSystemUser.result);
            } else {
                return {
                    success: false, 
                    agentRun: undefined
                };
            }
        } catch (e) {
            LogError(`GraphQLSystemUserClient::RunAIAgent - Error running AI agent - ${e}`);
            return {
                success: false, 
                agentRun: undefined
            };
        }
    }

    /**
     * Helper method to prepare prompt variables for GraphQL
     * @private
     */
    private preparePromptVariables(params: RunAIPromptParams): Record<string, any> {
        const variables: Record<string, any> = {
            promptId: params.promptId
        };

        // Serialize complex objects to JSON strings
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        }
        if (params.templateData !== undefined) {
            variables.templateData = typeof params.templateData === 'object' ? JSON.stringify(params.templateData) : params.templateData;
        }
        if (params.messages !== undefined) {
            variables.messages = JSON.stringify(params.messages);
        }

        // Add optional scalar parameters
        if (params.overrideModelId !== undefined) variables.overrideModelId = params.overrideModelId;
        if (params.overrideVendorId !== undefined) variables.overrideVendorId = params.overrideVendorId;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;
        if (params.skipValidation !== undefined) variables.skipValidation = params.skipValidation;
        if (params.responseFormat !== undefined) variables.responseFormat = params.responseFormat;
        if (params.temperature !== undefined) variables.temperature = params.temperature;
        if (params.topP !== undefined) variables.topP = params.topP;
        if (params.topK !== undefined) variables.topK = params.topK;
        if (params.minP !== undefined) variables.minP = params.minP;
        if (params.frequencyPenalty !== undefined) variables.frequencyPenalty = params.frequencyPenalty;
        if (params.presencePenalty !== undefined) variables.presencePenalty = params.presencePenalty;
        if (params.seed !== undefined) variables.seed = params.seed;
        if (params.stopSequences !== undefined) variables.stopSequences = params.stopSequences;
        if (params.includeLogProbs !== undefined) variables.includeLogProbs = params.includeLogProbs;
        if (params.topLogProbs !== undefined) variables.topLogProbs = params.topLogProbs;
        if (params.rerunFromPromptRunID !== undefined) variables.rerunFromPromptRunID = params.rerunFromPromptRunID;
        if (params.systemPromptOverride !== undefined) variables.systemPromptOverride = params.systemPromptOverride;

        return variables;
    }

    /**
     * Helper method to prepare agent variables for GraphQL
     * @private
     */
    private prepareAgentVariables(params: ExecuteAgentParams): Record<string, any> {
        const variables: Record<string, any> = {
            agentId: params.agent.ID,
            messages: JSON.stringify(params.conversationMessages),
            sessionId: this._sessionId
        };

        // Serialize optional complex objects to JSON strings
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        }

        // Add optional scalar parameters
        if (params.lastRunId !== undefined) variables.lastRunId = params.lastRunId;
        if (params.autoPopulateLastRunPayload !== undefined) variables.autoPopulateLastRunPayload = params.autoPopulateLastRunPayload;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;

        return variables;
    }

    /**
     * Helper method to process prompt results
     * @private
     */
    private processPromptResult(promptResult: any): RunAIPromptResult {
        // Parse JSON results if they exist
        let parsedResult: any;
        let validationResult: any;
        let chatResult: any;

        try {
            if (promptResult.parsedResult) {
                parsedResult = JSON.parse(promptResult.parsedResult);
            }
        } catch (e) {
            parsedResult = promptResult.parsedResult;
        }

        try {
            if (promptResult.validationResult) {
                validationResult = JSON.parse(promptResult.validationResult);
            }
        } catch (e) {
            validationResult = promptResult.validationResult;
        }

        try {
            if (promptResult.chatResult) {
                chatResult = JSON.parse(promptResult.chatResult);
            }
        } catch (e) {
            chatResult = promptResult.chatResult;
        }

        return {
            success: promptResult.success,
            output: promptResult.output,
            parsedResult,
            error: promptResult.error,
            executionTimeMs: promptResult.executionTimeMs,
            tokensUsed: promptResult.tokensUsed,
            promptRunId: promptResult.promptRunId,
            rawResult: promptResult.rawResult,
            validationResult,
            chatResult
        };
    }

    /**
     * Helper method to process agent results
     * @private
     */
    private processAgentResult(agentResult: any): ExecuteAgentResult {
        return SafeJSONParse(agentResult) as ExecuteAgentResult;
    }

    /**
     * Execute a simple prompt without requiring a stored AI Prompt entity.
     * This method allows system-level execution of simple prompts.
     * 
     * @param params The parameters for the simple prompt execution
     * @returns A Promise that resolves to a SimplePromptResult object
     * 
     * @example
     * ```typescript
     * const result = await systemClient.ExecuteSimplePrompt({
     *   systemPrompt: "You are a data analyst",
     *   modelPower: "medium"
     * });
     * ```
     */
    public async ExecuteSimplePrompt(params: ExecuteSimplePromptParams): Promise<SimplePromptResult> {
        try {
            const query = gql`
                query ExecuteSimplePromptSystemUser(
                    $systemPrompt: String!,
                    $messages: String,
                    $preferredModels: [String!],
                    $modelPower: String,
                    $responseFormat: String
                ) {
                    ExecuteSimplePromptSystemUser(
                        systemPrompt: $systemPrompt,
                        messages: $messages,
                        preferredModels: $preferredModels,
                        modelPower: $modelPower,
                        responseFormat: $responseFormat
                    ) {
                        success
                        result
                        resultObject
                        modelName
                        error
                        executionTimeMs
                    }
                }
            `;

            // Prepare variables
            const variables: Record<string, any> = {
                systemPrompt: params.systemPrompt
            };

            // Convert messages array to JSON string if provided
            if (params.messages && params.messages.length > 0) {
                variables.messages = JSON.stringify(params.messages);
            }

            if (params.preferredModels) {
                variables.preferredModels = params.preferredModels;
            }

            if (params.modelPower) {
                variables.modelPower = params.modelPower;
            }

            if (params.responseFormat) {
                variables.responseFormat = params.responseFormat;
            }

            // Execute the query
            const result = await this.Client.request(query, variables) as { ExecuteSimplePromptSystemUser: any };

            if (!result?.ExecuteSimplePromptSystemUser) {
                return {
                    success: false,
                    modelName: 'Unknown',
                    error: 'Failed to execute simple prompt as system user'
                };
            }

            const promptResult = result.ExecuteSimplePromptSystemUser;

            // Parse resultObject if it exists
            let resultObject: any;
            if (promptResult.resultObject) {
                try {
                    resultObject = JSON.parse(promptResult.resultObject);
                } catch (e) {
                    resultObject = promptResult.resultObject;
                }
            }

            return {
                success: promptResult.success,
                result: promptResult.result,
                resultObject,
                modelName: promptResult.modelName,
                error: promptResult.error,
                executionTimeMs: promptResult.executionTimeMs
            };

        } catch (e) {
            LogError(`GraphQLSystemUserClient::ExecuteSimplePrompt - Error executing simple prompt - ${e}`);
            return {
                success: false,
                modelName: 'Unknown',
                error: e.toString()
            };
        }
    }

    /**
     * Generate embeddings using local embedding models.
     * This method allows system-level generation of text embeddings.
     * 
     * @param params The parameters for embedding generation
     * @returns A Promise that resolves to an EmbedTextResult object
     * 
     * @example
     * ```typescript
     * const result = await systemClient.EmbedText({
     *   textToEmbed: ["System data", "Configuration"],
     *   modelSize: "small"
     * });
     * ```
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        try {
            const query = gql`
                query EmbedTextSystemUser(
                    $textToEmbed: [String!]!,
                    $modelSize: String!
                ) {
                    EmbedTextSystemUser(
                        textToEmbed: $textToEmbed,
                        modelSize: $modelSize
                    ) {
                        embeddings
                        modelName
                        vectorDimensions
                        error
                    }
                }
            `;

            // Prepare variables - handle both single string and array
            const textArray = Array.isArray(params.textToEmbed) 
                ? params.textToEmbed 
                : [params.textToEmbed];

            const variables = {
                textToEmbed: textArray,
                modelSize: params.modelSize
            };

            // Execute the query
            const result = await this.Client.request(query, variables) as { EmbedTextSystemUser: any };

            if (!result?.EmbedTextSystemUser) {
                return {
                    embeddings: Array.isArray(params.textToEmbed) ? [] : [],
                    modelName: 'Unknown',
                    vectorDimensions: 0,
                    error: 'Failed to generate embeddings as system user'
                };
            }

            const embedResult = result.EmbedTextSystemUser;

            // Return single embedding or array based on input
            const returnEmbeddings = Array.isArray(params.textToEmbed)
                ? embedResult.embeddings
                : embedResult.embeddings[0];

            return {
                embeddings: returnEmbeddings,
                modelName: embedResult.modelName,
                vectorDimensions: embedResult.vectorDimensions,
                error: embedResult.error
            };

        } catch (e) {
            LogError(`GraphQLSystemUserClient::EmbedText - Error generating embeddings - ${e}`);
            return {
                embeddings: Array.isArray(params.textToEmbed) ? [] : [],
                modelName: 'Unknown',
                vectorDimensions: 0,
                error: e.toString()
            };
        }
    }

}

/**
 * Output type for GetData calls - contains results from executing multiple SQL queries
 */
export class GetDataOutput {
    /**
     * Indicates if the operation was successful overall. If any individual query failed, this will be false. However, any successful queries will still be returned in the Results array.
     */
    Success: boolean;
    /**
     * The original input of Queries that were run - same order as provided in the request
     */
    Queries: string[];
    /**
     * An ordered array of error messages for each query that was run. This array will always have the same # of entries as Queries. If a query was successful, the corresponding entry will be null.
     */
    ErrorMessages: (string | null)[];
    /**
     * An ordered array of results for each query that was run. This array will always have the same # of entries as Queries. If a query failed, the corresponding entry will be null. Successful results are JSON strings containing the query data.
     */
    Results: (string | null)[];
}

/**
 * Return type for calls to the GetAllRemoteEntities query - provides lightweight entity metadata
 */
export class SimpleRemoteEntityOutput {
    /**
     * Indicates whether the remote entity retrieval was successful
     */
    Success: boolean;
    /**
     * Error message if the operation failed, undefined if successful
     */
    ErrorMessage?: string;
    /**
     * An array of simple entity types that are returned from the remote server - contains basic metadata for each entity
     */
    Results: SimpleRemoteEntity[];
}

/**
 * Represents a simple entity type that is used for lightweight retrieval of partial remote entity metadata 
 */
export class SimpleRemoteEntity {
    /**
     * Unique identifier of the entity on the remote server
     */
    ID: string;
    /**
     * Display name of the entity (e.g., "Users", "Companies")
     */
    Name: string;
    /**
     * Optional description explaining the entity's purpose
     */
    Description?: string;
    /**
     * Database schema name where the entity resides (e.g., "dbo", "custom")
     */
    SchemaName: string;
    /**
     * Name of the database view used for reading this entity
     */
    BaseView: string;
    /**
     * Name of the database table used for storing this entity
     */
    BaseTable: string;
    /**
     * Optional code-friendly name for the entity (typically PascalCase)
     */
    CodeName?: string;
    /**
     * Optional TypeScript/JavaScript class name for the entity
     */
    ClassName?: string;
    /**
     * Array of field definitions for this entity
     */
    Fields: SimpleRemoteEntityField[];
}

/**
 * Represents a field within a remote entity - contains basic field metadata
 */
export class SimpleRemoteEntityField {
    /**
     * Unique identifier of the entity field on the remote server
     */
    ID: string;
    /**
     * Field name (e.g., "FirstName", "Email", "CreatedAt")
     */
    Name: string;
    /**
     * Optional description explaining the field's purpose
     */
    Description?: string;
    /**
     * Data type of the field (e.g., "nvarchar", "int", "datetime", "bit")
     */
    Type: string;
    /**
     * Whether the field can contain null values
     */
    AllowsNull: boolean;
    /**
     * Maximum length for string fields, -1 for unlimited, 0 for non-string types
     */
    MaxLength: number;
}

/**
 * Input type for RunViewByNameSystemUser method calls - executes a saved view by name
 */
export interface RunViewByNameSystemUserInput {
    /**
     * Name of the saved view to execute
     */
    ViewName: string;
    /**
     * Additional WHERE clause conditions to apply (optional)
     */
    ExtraFilter?: string;
    /**
     * ORDER BY clause for sorting results (optional)
     */
    OrderBy?: string;
    /**
     * Specific fields to return, if not specified returns all fields (optional)
     */
    Fields?: string[];
    /**
     * Search string to filter results across searchable fields (optional)
     */
    UserSearchString?: string;
    /**
     * ID of a previous view run to exclude results from (optional)
     */
    ExcludeUserViewRunID?: string;
    /**
     * Override the exclude filter with custom logic (optional)
     */
    OverrideExcludeFilter?: string;
    /**
     * Whether to save the view execution results for future reference (optional)
     */
    SaveViewResults?: boolean;
    /**
     * Whether to exclude data from all prior view runs (optional)
     */
    ExcludeDataFromAllPriorViewRuns?: boolean;
    /**
     * Whether to ignore the view's MaxRows setting and return all results (optional)
     */
    IgnoreMaxRows?: boolean;
    /**
     * Maximum number of rows to return, overrides view setting if specified (optional)
     */
    MaxRows?: number;
    /**
     * Whether to force audit logging for this view execution (optional)
     */
    ForceAuditLog?: boolean;
    /**
     * Description for the audit log entry if ForceAuditLog is true (optional)
     */
    AuditLogDescription?: string;
    /**
     * Type of result format: "simple", "entity_object", etc. (optional)
     */
    ResultType?: string;
    /**
     * Starting row number for pagination (optional, 0-based)
     */
    StartRow?: number;
}

/**
 * Input type for RunViewByIDSystemUser method calls - executes a saved view by its unique ID
 */
export interface RunViewByIDSystemUserInput {
    /**
     * Unique identifier of the saved view to execute
     */
    ViewID: string;
    /**
     * Additional WHERE clause conditions to apply (optional)
     */
    ExtraFilter?: string;
    /**
     * ORDER BY clause for sorting results (optional)
     */
    OrderBy?: string;
    /**
     * Specific fields to return, if not specified returns all fields (optional)
     */
    Fields?: string[];
    /**
     * Search string to filter results across searchable fields (optional)
     */
    UserSearchString?: string;
    /**
     * ID of a previous view run to exclude results from (optional)
     */
    ExcludeUserViewRunID?: string;
    /**
     * Override the exclude filter with custom logic (optional)
     */
    OverrideExcludeFilter?: string;
    /**
     * Whether to save the view execution results for future reference (optional)
     */
    SaveViewResults?: boolean;
    /**
     * Whether to exclude data from all prior view runs (optional)
     */
    ExcludeDataFromAllPriorViewRuns?: boolean;
    /**
     * Whether to ignore the view's MaxRows setting and return all results (optional)
     */
    IgnoreMaxRows?: boolean;
    /**
     * Maximum number of rows to return, overrides view setting if specified (optional)
     */
    MaxRows?: number;
    /**
     * Whether to force audit logging for this view execution (optional)
     */
    ForceAuditLog?: boolean;
    /**
     * Description for the audit log entry if ForceAuditLog is true (optional)
     */
    AuditLogDescription?: string;
    /**
     * Type of result format: "simple", "entity_object", etc. (optional)
     */
    ResultType?: string;
    /**
     * Starting row number for pagination (optional, 0-based)
     */
    StartRow?: number;
}

/**
 * Input type for RunDynamicViewSystemUser method calls - creates and executes a view dynamically based on entity
 */
export interface RunDynamicViewSystemUserInput {
    /**
     * Name of the entity to query (e.g., "Users", "Companies")
     */
    EntityName: string;
    /**
     * Additional WHERE clause conditions to apply (optional)
     */
    ExtraFilter?: string;
    /**
     * ORDER BY clause for sorting results (optional)
     */
    OrderBy?: string;
    /**
     * Specific fields to return, if not specified returns all fields (optional)
     */
    Fields?: string[];
    /**
     * Search string to filter results across searchable fields (optional)
     */
    UserSearchString?: string;
    /**
     * ID of a previous view run to exclude results from (optional)
     */
    ExcludeUserViewRunID?: string;
    /**
     * Override the exclude filter with custom logic (optional)
     */
    OverrideExcludeFilter?: string;
    /**
     * Whether to ignore MaxRows limits and return all results (optional)
     */
    IgnoreMaxRows?: boolean;
    /**
     * Maximum number of rows to return (optional)
     */
    MaxRows?: number;
    /**
     * Whether to force audit logging for this view execution (optional)
     */
    ForceAuditLog?: boolean;
    /**
     * Description for the audit log entry if ForceAuditLog is true (optional)
     */
    AuditLogDescription?: string;
    /**
     * Type of result format: "simple", "entity_object", etc. (optional)
     */
    ResultType?: string;
    /**
     * Starting row number for pagination (optional, 0-based)
     */
    StartRow?: number;
}

/**
 * Input type for RunViewsSystemUser method calls - executes multiple views in parallel
 */
export interface RunViewSystemUserInput {
    /**
     * Name of the entity to query (e.g., "Users", "Companies")
     */
    EntityName: string;
    /**
     * Additional WHERE clause conditions to apply (optional)
     */
    ExtraFilter?: string;
    /**
     * ORDER BY clause for sorting results (optional)
     */
    OrderBy?: string;
    /**
     * Specific fields to return, if not specified returns all fields (optional)
     */
    Fields?: string[];
    /**
     * Search string to filter results across searchable fields (optional)
     */
    UserSearchString?: string;
    /**
     * ID of a previous view run to exclude results from (optional)
     */
    ExcludeUserViewRunID?: string;
    /**
     * Override the exclude filter with custom logic (optional)
     */
    OverrideExcludeFilter?: string;
    /**
     * Whether to ignore MaxRows limits and return all results (optional)
     */
    IgnoreMaxRows?: boolean;
    /**
     * Maximum number of rows to return (optional)
     */
    MaxRows?: number;
    /**
     * Whether to force audit logging for this view execution (optional)
     */
    ForceAuditLog?: boolean;
    /**
     * Description for the audit log entry if ForceAuditLog is true (optional)
     */
    AuditLogDescription?: string;
    /**
     * Type of result format: "simple", "entity_object", etc. (optional)
     */
    ResultType?: string;
    /**
     * Starting row number for pagination (optional, 0-based)
     */
    StartRow?: number;
}


/**
 * Result row type for view execution results - represents a single data row
 */
export interface RunViewSystemUserResultRow {
    /**
     * Primary key fields and values for the record
     */
    PrimaryKey: KeyValuePair[];
    /**
     * ID of the entity type this record belongs to
     */
    EntityID: string;
    /**
     * JSON string containing the actual record data
     */
    Data: string;
}

/**
 * Result type for RunViewsSystemUser method calls - contains execution results and metadata
 */
export interface RunViewSystemUserResult {
    /**
     * Array of result rows containing the actual data
     */
    Results: RunViewSystemUserResultRow[];
    /**
     * Unique identifier for this view execution run (optional)
     */
    UserViewRunID?: string;
    /**
     * Number of rows returned in this result set (optional)
     */
    RowCount?: number;
    /**
     * Total number of rows available (before pagination) (optional)
     */
    TotalRowCount?: number;
    /**
     * Time taken to execute the view in milliseconds (optional)
     */
    ExecutionTime?: number;
    /**
     * Error message if the execution failed (optional)
     */
    ErrorMessage?: string;
    /**
     * Whether the view execution was successful
     */
    Success: boolean;
}

/**
 * Result type for query execution methods - contains query results and execution metadata
 */
export interface RunQuerySystemUserResult {
    /**
     * Unique identifier of the executed query
     */
    QueryID: string;
    /**
     * Display name of the executed query
     */
    QueryName: string;
    /**
     * Whether the query execution was successful
     */
    Success: boolean;
    /**
     * Query results data (parsed from JSON)
     */
    Results: any;
    /**
     * Number of rows returned by the query
     */
    RowCount: number;
    /**
     * Total number of rows available (before pagination)
     */
    TotalRowCount: number;
    /**
     * Time taken to execute the query in milliseconds
     */
    ExecutionTime: number;
    /**
     * Error message if the query execution failed
     */
    ErrorMessage: string;
    /**
     * JSON string containing the applied parameters (optional)
     */
    AppliedParameters?: string;
}

/**
 * Input type for GetQueryDataSystemUser method calls - executes a stored query by ID
 */
export interface GetQueryDataSystemUserInput {
    /**
     * The ID of the query to execute
     */
    QueryID: string;
    /**
     * Optional category ID filter
     */
    CategoryID?: string;
    /**
     * Optional category path filter (hierarchical path like "/MJ/AI/Agents/" or simple name)
     */
    CategoryPath?: string;
    /**
     * Optional parameters for templated queries
     */
    Parameters?: Record<string, any>;
    /**
     * Optional maximum number of rows to return
     */
    MaxRows?: number;
    /**
     * Optional starting row number for pagination
     */
    StartRow?: number;
}

/**
 * Input type for GetQueryDataByNameSystemUser method calls - executes a stored query by name
 */
export interface GetQueryDataByNameSystemUserInput {
    /**
     * The name of the query to execute
     */
    QueryName: string;
    /**
     * Optional category ID filter
     */
    CategoryID?: string;
    /**
     * Optional category path filter (hierarchical path like "/MJ/AI/Agents/" or simple name)
     */
    CategoryPath?: string;
    /**
     * Optional parameters for templated queries
     */
    Parameters?: Record<string, any>;
    /**
     * Optional maximum number of rows to return
     */
    MaxRows?: number;
    /**
     * Optional starting row number for pagination
     */
    StartRow?: number;
}

/**
 * Input type for query permissions to be created with a new query
 */
export interface QueryPermissionInput {
    /**
     * Role ID to grant access to
     */
    RoleID: string;
}

/**
 * Input type for CreateQuery mutation calls - creates a new query with optional hierarchical category path
 */
export interface CreateQueryInput {
    /**
     * Required name for the query (must be unique within category)
     */
    Name: string;
    /**
     * Optional existing category ID to assign the query to
     */
    CategoryID?: string;
    /**
     * Optional category path for automatic hierarchy creation (e.g., "Reports/Sales/Monthly") - takes precedence over CategoryID
     */
    CategoryPath?: string;
    /**
     * Optional natural language question this query answers
     */
    UserQuestion?: string;
    /**
     * Optional general description of what the query does
     */
    Description?: string;
    /**
     * Optional SQL query text to execute (can contain Nunjucks template syntax)
     */
    SQL?: string;
    /**
     * Optional technical documentation for developers
     */
    TechnicalDescription?: string;
    /**
     * Optional original SQL before optimization or modification
     */
    OriginalSQL?: string;
    /**
     * Optional user feedback about the query
     */
    Feedback?: string;
    /**
     * Optional query approval status (defaults to 'Pending')
     */
    Status?: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
    /**
     * Optional quality indicator (higher = better quality, defaults to 0)
     */
    QualityRank?: number;
    /**
     * Optional execution cost indicator (higher = more expensive to run)
     */
    ExecutionCostRank?: number;
    /**
     * Optional flag indicating if the query uses Nunjucks template syntax (auto-detected if not specified)
     */
    UsesTemplate?: boolean;
    /**
     * Optional array of permissions to create for the query
     */
    Permissions?: QueryPermissionInput[];
}

/**
 * Type for query field information
 */
export interface QueryField {
    ID: string;
    QueryID: string;
    Name: string;
    Description?: string;
    Sequence: number;
    SQLBaseType?: string;
    SQLFullType?: string;
    SourceEntityID?: string;
    SourceEntity?: string;
    SourceFieldName?: string;
    IsComputed: boolean;
    ComputationDescription?: string;
    IsSummary?: boolean;
    SummaryDescription?: string;
}

/**
 * Type for query parameter information
 */
export interface QueryParameter {
    ID: string;
    QueryID: string;
    Name: string;
    Description?: string;
    Type: string;
    IsRequired: boolean;
    DefaultValue?: string;
    SampleValue?: string;
    ValidationFilters?: string;
}

/**
 * Type for query entity information
 */
export interface MJQueryEntity {
    ID: string;
    QueryID: string;
    EntityID: string;
    Entity?: string;
}

/**
 * Type for query permission information
 */
export interface QueryPermission {
    ID: string;
    QueryID: string;
    RoleID: string;
    Role?: string;
}

/**
 * Result type for CreateQuery mutation calls - contains creation success status and query data
 */
export interface CreateQueryResult {
    /**
     * Whether the query creation was successful
     */
    Success: boolean;
    /**
     * Error message if the creation failed (optional)
     */
    ErrorMessage?: string;
    /**
     * Unique identifier of the created query (optional)
     */
    ID?: string;
    /**
     * Display name of the created query (optional)
     */
    Name?: string;
    /**
     * Description of the created query (optional)
     */
    Description?: string;
    /**
     * Category ID the query belongs to (optional)
     */
    CategoryID?: string;
    /**
     * Category name the query belongs to (optional)
     */
    Category?: string;
    /**
     * SQL query text (optional)
     */
    SQL?: string;
    /**
     * Query status: Pending, Approved, Rejected, or Expired (optional)
     */
    Status?: string;
    /**
     * Quality rank indicator (optional)
     */
    QualityRank?: number;
    /**
     * Embedding vector for semantic search (optional)
     */
    EmbeddingVector?: string;
    /**
     * ID of the embedding model used (optional)
     */
    EmbeddingModelID?: string;
    /**
     * Name of the embedding model used (optional)
     */
    EmbeddingModelName?: string;
    /**
     * Array of fields discovered in the query (optional)
     */
    Fields?: QueryField[];
    /**
     * Array of parameters found in the query template (optional)
     */
    Parameters?: QueryParameter[];
    /**
     * Array of entities referenced by the query (optional)
     */
    Entities?: MJQueryEntity[];
    /**
     * Array of permissions created for the query (optional)
     */
    Permissions?: QueryPermission[];
}

/**
 * Input type for UpdateQuery mutation calls - updates an existing query
 */
export interface UpdateQueryInput {
    /**
     * Required ID of the query to update
     */
    ID: string;
    /**
     * Optional name for the query (must be unique within category)
     */
    Name?: string;
    /**
     * Optional category ID to move the query to
     */
    CategoryID?: string;
    /**
     * Optional category path for automatic hierarchy creation (e.g., "Reports/Sales/Monthly") - takes precedence over CategoryID
     */
    CategoryPath?: string;
    /**
     * Optional natural language question this query answers
     */
    UserQuestion?: string;
    /**
     * Optional general description of what the query does
     */
    Description?: string;
    /**
     * Optional SQL query text to execute (can contain Nunjucks template syntax)
     */
    SQL?: string;
    /**
     * Optional technical documentation for developers
     */
    TechnicalDescription?: string;
    /**
     * Optional original SQL before optimization or modification
     */
    OriginalSQL?: string;
    /**
     * Optional user feedback about the query
     */
    Feedback?: string;
    /**
     * Optional query approval status
     */
    Status?: 'Pending' | 'Approved' | 'Rejected' | 'Expired';
    /**
     * Optional quality indicator (higher = better quality)
     */
    QualityRank?: number;
    /**
     * Optional execution cost indicator (higher = more expensive to run)
     */
    ExecutionCostRank?: number;
    /**
     * Optional flag indicating if the query uses Nunjucks template syntax
     */
    UsesTemplate?: boolean;
    /**
     * Optional array of permissions to update for the query (replaces existing permissions)
     */
    Permissions?: QueryPermissionInput[];
}

/**
 * Result type for UpdateQuery mutation calls - contains update success status and query data
 */
export interface UpdateQueryResult {
    /**
     * Whether the query update was successful
     */
    Success: boolean;
    /**
     * Error message if the update failed (optional)
     */
    ErrorMessage?: string;
    /**
     * Unique identifier of the updated query (optional)
     */
    ID?: string;
    /**
     * Display name of the updated query (optional)
     */
    Name?: string;
    /**
     * Description of the updated query (optional)
     */
    Description?: string;
    /**
     * Category ID the query belongs to (optional)
     */
    CategoryID?: string;
    /**
     * Category name the query belongs to (optional)
     */
    Category?: string;
    /**
     * SQL query text (optional)
     */
    SQL?: string;
    /**
     * Query status: Pending, Approved, Rejected, or Expired (optional)
     */
    Status?: string;
    /**
     * Quality rank indicator (optional)
     */
    QualityRank?: number;
    /**
     * Embedding vector for semantic search (optional)
     */
    EmbeddingVector?: string;
    /**
     * ID of the embedding model used (optional)
     */
    EmbeddingModelID?: string;
    /**
     * Name of the embedding model used (optional)
     */
    EmbeddingModelName?: string;
    /**
     * Array of fields discovered in the query (optional)
     */
    Fields?: QueryField[];
    /**
     * Array of parameters found in the query template (optional)
     */
    Parameters?: QueryParameter[];
    /**
     * Array of entities referenced by the query (optional)
     */
    Entities?: MJQueryEntity[];
    /**
     * Array of permissions for the query (optional)
     */
    Permissions?: QueryPermission[];
}

/**
 * Delete options input type for controlling delete behavior
 */
export interface DeleteQueryOptionsInput {
    /**
     * Whether to skip AI actions during deletion
     */
    SkipEntityAIActions: boolean;
    /**
     * Whether to skip regular entity actions during deletion
     */
    SkipEntityActions: boolean;
}

/**
 * Result type for DeleteQuery mutation calls - contains deletion success status and deleted query data
 */
export interface DeleteQueryResult {
    /**
     * Whether the query deletion was successful
     */
    Success: boolean;
    /**
     * Error message if the deletion failed (optional)
     */
    ErrorMessage?: string;
    /**
     * Unique identifier of the deleted query (optional)
     */
    ID?: string;
    /**
     * Display name of the deleted query (optional)
     */
    Name?: string;
}

 