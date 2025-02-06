import { Arg, Ctx, Field, InputType, ObjectType, Query } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { v4 as uuidv4 } from 'uuid';
 
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

    @Field(() => String)
    ErrorMessage: string;

    @Field(() => String)
    SQL: string;

    /**
     * Each query's results will be converted to JSON and returned as a string
     */
    @Field(() => [String])
    Results: string[];
}
 
@ObjectType()
export class SimpleEntityResultType {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String)
    ErrorMessage: string;

    @Field(() => [SimpleEntityOutputType])
    Results: SimpleEntityOutputType[];
}

@ObjectType()
export class SimpleEntityOutputType {
    @Field(() => String)
    ID: string;

    @Field(() => String)
    Name: string;

    @Field(() => String)
    Description: string;

    @Field(() => String)
    SchemaName: string;

    @Field(() => String)
    BaseView: string;

    @Field(() => String)
    BaseTable: string;

    @Field(() => String)
    CodeName: string;

    @Field(() => String)
    ClassName: string;

    @Field(() => [SimpleEntityFieldOutputType])
    Fields: SimpleEntityFieldOutputType[];
}

@ObjectType()
export class SimpleEntityFieldOutputType {
    @Field(() => String)
    ID: string;

    @Field(() => String)
    Name: string;

    @Field(() => String)
    Description: string;

    @Field(() => String)
    Type: string;

    @Field(() => Boolean)
    AllowsNull: boolean;

    @Field(() => Number)
    MaxLength: number;
}


export class GetDataResolver {
    /**
     * This mutation will sync the specified items with the existing system. Items will be processed in order and the results of each operation will be returned in the Results array within the return value.
     * @param items - an array of ActionItemInputType objects that specify the action to be taken on the specified entity with the specified primary key and the JSON representation of the field values. 
     * @param token - the short-lived access token that is required to perform this operation.
     */
    @RequireSystemUser()
    @Query(() => GetDataOutputType)
    async GetData(
    @Arg('input', () => GetDataInputType) input: GetDataInputType,
    @Ctx() context: AppContext
    ) {
        try { 
            LogStatus(`GetDataResolver.GetData() ---- IMPORTANT - temporarily using the same connection as rest of the server, we need to separately create a READ ONLY CONNECTION and pass that in 
                       the AppContext so we can use that special connection here to ensure we are using a lower privileged connection for this operation to prevent mutation from being possible.`);
            LogStatus(`${JSON.stringify(input)}`);

            // validate the token
            if (!isTokenValid(input.Token)) {
                throw new Error(`Token ${input.Token} is not valid or has expired`);
            }

            // iterate through the items 
            let success: boolean = true;
            const promises = input.Queries.map((q) => {
                return context.dataSource.query(q);
            });
            const results = await Promise.all(promises); // run all the queries in parallel

            // record the use of the token
            recordTokenUse(input.Token, {request: input, results: results});

            return { Success: success, Results: results.map((r) => JSON.stringify(r)) };
        } 
        catch (err) {
            LogError(err);
            return { Success: false, ErrorMessage: typeof err === 'string' ? err : (err as any).message, Results: [] };
        }
    }

    @RequireSystemUser()
    @Query(() => SimpleEntityResultType)
    async GetAllEntities(
    @Ctx() context: AppContext
    ) {
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