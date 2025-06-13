import { Arg, Ctx, Field, InputType, ObjectType, Query } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { v4 as uuidv4 } from 'uuid';
import { GetReadOnlyDataSource } from '../util.js';
import sql from 'mssql';
 
@InputType() 
export class GetDataInputType {
    @Field(() => String)
    Token: string;

    @Field(() => [String])
    Queries: string[];
}
  
  
@ObjectType()
export class GetDataOutputType {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => [String])
    Queries: string[];

    @Field(() => [String], { nullable: 'itemsAndList' }) // Allow nulls inside array & entire field nullable
    ErrorMessages: (string | null)[];

    /**
     * Each query's results will be converted to JSON and returned as a string
     */
    @Field(() => [String], { nullable: 'itemsAndList' }) // Allow nulls inside array & entire field nullable
    Results: (string | null)[];
}
 
@ObjectType()
export class SimpleEntityResultType {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => [SimpleEntityOutputType])
    Results: SimpleEntityOutputType[];
}

@ObjectType()
export class SimpleEntityOutputType {
    @Field(() => String)
    ID: string;

    @Field(() => String)
    Name: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String)
    SchemaName: string;

    @Field(() => String)
    BaseView: string;

    @Field(() => String)
    BaseTable: string;

    @Field(() => String, { nullable: true })
    CodeName?: string;

    @Field(() => String, { nullable: true })
    ClassName?: string;

    @Field(() => [SimpleEntityFieldOutputType])
    Fields: SimpleEntityFieldOutputType[];
}

@ObjectType()
export class SimpleEntityFieldOutputType {
    @Field(() => String)
    ID: string;

    @Field(() => String)
    Name: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String)
    Type: string;

    @Field(() => Boolean)
    AllowsNull: boolean;

    @Field(() => Number)
    MaxLength: number;
}

/**
 * General purpose resolver for fetching different kinds of data payloads for SYSTEM users only.
 */
export class GetDataResolver {
    /**
     * This query will sync the specified items with the existing system. Items will be processed in order and the results of each operation will be returned in the Results array within the return value.
     * @param items - an array of ActionItemInputType objects that specify the action to be taken on the specified entity with the specified primary key and the JSON representation of the field values. 
     * @param token - the short-lived access token that is required to perform this operation.
     */
    @RequireSystemUser()
    @Query(() => GetDataOutputType)
    async GetData(
    @Arg('input', () => GetDataInputType) input: GetDataInputType,
    @Ctx() context: AppContext
    ): Promise<GetDataOutputType> {
        try { 
            LogStatus(`GetDataResolver.GetData() ---- IMPORTANT - temporarily using the same connection as rest of the server, we need to separately create a READ ONLY CONNECTION and pass that in 
                       the AppContext so we can use that special connection here to ensure we are using a lower privileged connection for this operation to prevent mutation from being possible.`);
            LogStatus(`${JSON.stringify(input)}`);

            // validate the token
            if (!isTokenValid(input.Token)) {
                throw new Error(`Token ${input.Token} is not valid or has expired`);
            }

            // Use the read-only connection for executing queries
            const readOnlyDataSource = GetReadOnlyDataSource(context.dataSources, {allowFallbackToReadWrite: false})
            if (!readOnlyDataSource) {
                throw new Error('Read-only data source not found');
            }

            // Execute all queries in parallel, but execute each individual query in its own try catch block so that if one fails, the others can still be processed
            // and also so that we can capture the error message for each query and return it
            const results = await Promise.allSettled(
                input.Queries.map(async (query) => {
                    try {
                        const request = new sql.Request(readOnlyDataSource);
                        const result = await request.query(query);
                        return { result: result.recordset, error: null };
                    } catch (err) {
                        return { result: null, error: err };
                    }
                })
            );
            
            // Extract results and errors from the promises
            const processedResults = results.map((res) => res.status === "fulfilled" ? res.value.result : null);
            const errorMessages = results.map((res) => res.status === "fulfilled" ? res.value.error : res.reason);

            // record the use of the token
            const returnVal = { Success: errorMessages.filter((e) => e !== null).length === 0, 
                                Results: processedResults.map((r) => JSON.stringify(r)), 
                                Queries: input.Queries, 
                                ErrorMessages: errorMessages }

            recordTokenUse(input.Token, {request: input, results: returnVal});

            // Success below is derived from having no errorMessages, check that array
            return returnVal;
        } 
        catch (err) {
            LogError(err);
            return { Success: false, ErrorMessages: [typeof err === 'string' ? err : (err as any).message], Results: [], Queries: input.Queries };
        }
    }

    @RequireSystemUser()
    @Query(() => SimpleEntityResultType)
    async GetAllEntities(
    @Ctx() context: AppContext
    ): Promise<SimpleEntityResultType> {
        try { 
            const md = new Metadata();
            const result = md.Entities.map((e) => {
                return { 
                    ID: e.ID, 
                    Name: e.Name,
                    Description: e.Description, 
                    SchemaName: e.SchemaName,
                    BaseView: e.BaseView,
                    BaseTable: e.BaseTable,
                    CodeName: e.CodeName,
                    ClassName: e.ClassName,
                    Fields: e.Fields.map((f) => {
                        return { 
                            ID: f.ID, 
                            Name: f.Name, 
                            Description: f.Description, 
                            Type: f.Type,
                            AllowsNull: f.AllowsNull,
                            MaxLength: f.MaxLength,
                        };
                    })
                }
            });
            return { Success: true, Results: result };
        } 
        catch (err) {
            LogError(err);
            return { Success: false, ErrorMessage: typeof err === 'string' ? err : (err as any).message, Results: [] };
        }
    }


}
 

export class TokenUseLog {
    Token: string;
    UsedAt: Date;
    UsePayload: any;
}
/**
 * Used to track all active access tokens that are requested by anyone within the server to be able to send to external services that can
 * in turn call back to the GetDataResolver to get data from the server. This is an extra security layer to ensure that tokens are short 
 * lived compared to the system level API key which rotates but less frequently.
 */
export class GetDataAccessToken {
    Token: string;
    ExpiresAt: Date;
    RequstedAt: Date;
    /**
     * Can be used to store any payload to identify who requested the creation of the token, for example Skip might use this to put in a conversation ID to know which conversation a request is coming back for.
     */
    RequestorPayload: any;
    TokenUses: TokenUseLog[];
}
const __accessTokens: GetDataAccessToken[] = [];
const __defaultTokenLifeSpan = 1000 * 60 * 5; // 5 minutes  
export function registerAccessToken(token?: string, lifeSpan: number = __defaultTokenLifeSpan, requestorPayload?: any): GetDataAccessToken {
    const tokenToUse = token || uuidv4();

    if (tokenExists(tokenToUse)) {
        // should never happen if we used the uuidv4() function but could happen if someone tries to use a custom token
        throw new Error(`Token ${tokenToUse} already exists`);
    }

    const newToken = new GetDataAccessToken();
    newToken.Token = tokenToUse;
    newToken.ExpiresAt = new Date(new Date().getTime() + lifeSpan);
    newToken.RequstedAt = new Date();
    newToken.RequestorPayload = requestorPayload;
    __accessTokens.push(newToken);
    return newToken;
}
export function deleteAccessToken(token: string) {
    const index = __accessTokens.findIndex((t) => t.Token === token);
    if (index >= 0) {
        __accessTokens.splice(index, 1);
    }
    else {
        throw new Error(`Token ${token} does not exist`);
    }
}
export function tokenExists(token: string) {
    return __accessTokens.find((t) => t.Token === token) !== undefined;
}
export function isTokenValid(token: string) {
    const t = __accessTokens.find((t) => t.Token === token);
    if (t) {
        return t.ExpiresAt > new Date();
    }
    return false;
} 
export function recordTokenUse(token: string, usePayload: any) {
    const t = __accessTokens.find((t) => t.Token === token);
    if (t) {
        t.TokenUses.push({ Token: token, UsedAt: new Date(), UsePayload: usePayload });
    }
    else {
        throw new Error(`Token ${token} does not exist`);
    }
}
