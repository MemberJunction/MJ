import { Arg, Ctx, Field, InputType, ObjectType, Query } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, Metadata } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
 
@InputType() 
export class GetDataInputType {
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
     */
    @RequireSystemUser()
    @Query(() => GetDataOutputType)
    async GetData(
    @Arg('input', () => GetDataInputType) input: GetDataInputType,
    @Ctx() context: AppContext
    ) {
        try { 
            // iterate through the items 
            let success: boolean = true;
            const promises = input.Queries.map((q) => {
                return context.dataSource.query(q);
            });
            const results = await Promise.all(promises); // run all the queries in parallel

            return { Success: success, Results: results };
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
 