import { CompositeKey, LogError } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { gql, GraphQLClient } from 'graphql-request'
import { ActionItemInput, RolesAndUsersInput, SyncDataResult, SyncRolesAndUsersResult } from './rolesAndUsersType';

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
            const result = await this.Client.request(query, {input: {Queries: queries, Token: 'nope'}}) as {GetData: GetDataOutput};
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
            const error = `GraphQLSystemUserClient::GetData - Error getting geta - ${e}`
            LogError(error);
            return {
                Success: false,
                Results: [],
                ErrorMessages: [error],
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

}

/**
 * Output type for GetData calls
 */
export class GetDataOutput {
    /**
     * Indicates if the operation was successful overall. If any individual query failed, this will be false. However, any successful queries will still be returned in the Results array.
     */
    Success: boolean;
    /**
     * The original input of Queries that were run
     */
    Queries: string[];
    /**
     * An ordered array of error messages for each query that was run. This array will always have the same # of entries as Queries. If a query was successful, the corresponding entry will be null.
     */
    ErrorMessages: (string | null)[];
    /**
     * An ordered array of results for each query that was run. This array will always have the same # of entries as Queries. If a query failed, the corresponding entry will be null.
     */
    Results: (string | null)[];
}

/**
 * Return type for calls to the GetAllRemoteEntities query
 */
export class SimpleRemoteEntityOutput {
    Success: boolean;
    ErrorMessage?: string;
    /**
     * An array of simple entity types that are returned from the remote server
     */
    Results: SimpleRemoteEntity[];
}

/**
 * Represents a simple entity type that is used for lightweight retrieval of partial remote entity metadata 
 */
export class SimpleRemoteEntity {
    /**
     * ID of the entity on the remote server
     */
    ID: string;
    Name: string;
    Description?: string;
    SchemaName: string;
    BaseView: string;
    BaseTable: string;
    CodeName?: string;
    ClassName?: string;
    Fields: SimpleRemoteEntityField[];
}

export class SimpleRemoteEntityField {
    /**
     * ID of the entity field on the remote server
     */
    ID: string;
    Name: string;
    Description?: string;
    Type: string;
    AllowsNull: boolean;
    MaxLength: number;
}

 