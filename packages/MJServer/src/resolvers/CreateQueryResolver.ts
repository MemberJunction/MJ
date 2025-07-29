import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType, Resolver, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { LogError, Metadata, RunView, UserInfo, CompositeKey, EntitySaveOptions } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { QueryCategoryEntity } from '@memberjunction/core-entities';
import { QueryResolver } from '../generated/generated.js';
import { GetReadWriteDataSource } from '../util.js';
import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';

/**
 * Query status enumeration for GraphQL
 */
export enum QueryStatus {
    Pending = "Pending",
    Approved = "Approved", 
    Rejected = "Rejected",
    Expired = "Expired"
}

registerEnumType(QueryStatus, {
    name: "QueryStatus",
    description: "Status of a query: Pending, Approved, Rejected, or Expired"
});

@InputType()
export class CreateQuerySystemUserInput {
    @Field(() => String)
    Name!: string;

    @Field(() => String, { nullable: true })
    CategoryID?: string;

    @Field(() => String, { nullable: true })
    CategoryPath?: string;

    @Field(() => String, { nullable: true })
    UserQuestion?: string;

    @Field(() => String, { nullable: true })
    Description?: string;

    @Field(() => String, { nullable: true })
    SQL?: string;

    @Field(() => String, { nullable: true })
    TechnicalDescription?: string;

    @Field(() => String, { nullable: true })
    OriginalSQL?: string;

    @Field(() => String, { nullable: true })
    Feedback?: string;

    @Field(() => QueryStatus, { nullable: true, defaultValue: QueryStatus.Pending })
    Status?: QueryStatus;

    @Field(() => Number, { nullable: true })
    QualityRank?: number;

    @Field(() => Number, { nullable: true })
    ExecutionCostRank?: number;

    @Field(() => Boolean, { nullable: true })
    UsesTemplate?: boolean;
}

@ObjectType()
export class CreateQueryResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    QueryData?: string;
}

@ObjectType()
export class DeleteQueryResultType {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    QueryData?: string;
}

@Resolver()
export class QueryResolverExtended extends QueryResolver {
    /**
     * Creates a new query with the provided attributes. This mutation is restricted to system users only.
     * @param input - CreateQuerySystemUserInput containing all the query attributes
     * @param context - Application context containing user information
     * @returns CreateQueryResultType with success status and query data
     */
    @RequireSystemUser()
    @Mutation(() => CreateQueryResultType)
    async CreateQuerySystemUser(
        @Arg('input', () => CreateQuerySystemUserInput) input: CreateQuerySystemUserInput,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<CreateQueryResultType> {
        try {
            // Handle CategoryPath if provided
            let finalCategoryID = input.CategoryID;
            if (input.CategoryPath) {
                const md = new Metadata();
                finalCategoryID = await this.findOrCreateCategoryPath(input.CategoryPath, md, context.userPayload.userRecord, context.userPayload);
            }

            // Create input for the inherited CreateRecord method
            const createInput = {
                Name: input.Name,
                CategoryID: finalCategoryID,
                UserQuestion: input.UserQuestion,
                Description: input.Description,
                SQL: input.SQL,
                TechnicalDescription: input.TechnicalDescription,
                OriginalSQL: input.OriginalSQL,
                Feedback: input.Feedback,
                Status: input.Status || 'Approved',
                QualityRank: input.QualityRank || 0,
                ExecutionCostRank: input.ExecutionCostRank,
                UsesTemplate: input.UsesTemplate || false
            };
            
            // Use inherited CreateRecord method which bypasses AI processing
            const connPool = GetReadWriteDataSource(context.dataSources);
            const createdQuery = await this.CreateRecord('Queries', createInput, connPool, context.userPayload, pubSub);
            
            if (createdQuery) {
                return {
                    Success: true,
                    QueryData: JSON.stringify(createdQuery)
                };
            } else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to create query using CreateRecord method'
                };
            }

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `QueryResolverExtended::CreateQuerySystemUser --- Error creating query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Deletes a query by ID. This mutation is restricted to system users only.
     * @param ID - The ID of the query to delete
     * @param options - Delete options controlling action execution
     * @param context - Application context containing user information
     * @returns DeleteQueryResultType with success status and deleted query data
     */
    @RequireSystemUser()
    @Mutation(() => DeleteQueryResultType)
    async DeleteQuerySystemResolver(
        @Arg('ID', () => String) queryID: string,
        @Arg('options', () => DeleteOptionsInput, { nullable: true }) options: DeleteOptionsInput | null,
        @Ctx() context: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<DeleteQueryResultType> {
        try {
            const connPool = GetReadWriteDataSource(context.dataSources);
            const key = new CompositeKey([{FieldName: 'ID', Value: queryID}]);
            
            // Provide default options if none provided
            const deleteOptions = options || {
                SkipEntityAIActions: false,
                SkipEntityActions: false
            };
            
            // Use inherited DeleteRecord method from ResolverBase
            const deletedQuery = await this.DeleteRecord('Queries', key, deleteOptions, connPool, context.userPayload, pubSub);
            
            if (deletedQuery) {
                return {
                    Success: true,
                    QueryData: JSON.stringify(deletedQuery)
                };
            } else {
                return {
                    Success: false,
                    ErrorMessage: 'Failed to delete query using DeleteRecord method'
                };
            }

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `QueryResolverExtended::DeleteQuerySystemResolver --- Error deleting query: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }

    /**
     * Finds or creates a category hierarchy based on the provided path.
     * Path format: "Parent/Child/Grandchild" - case insensitive lookup and creation.
     * @param categoryPath - Slash-separated category path
     * @param md - Metadata instance
     * @param contextUser - User context for operations
     * @returns The ID of the final category in the path
     */
    private async findOrCreateCategoryPath(categoryPath: string, md: Metadata, contextUser: UserInfo, userPayload: UserPayload): Promise<string> {
        if (!categoryPath || categoryPath.trim() === '') {
            throw new Error('CategoryPath cannot be empty');
        }

        const pathParts = categoryPath.split('/').map(part => part.trim()).filter(part => part.length > 0);
        if (pathParts.length === 0) {
            throw new Error('CategoryPath must contain at least one valid category name');
        }

        let currentParentID: string | null = null;
        let currentCategoryID: string | null = null;

        for (let i = 0; i < pathParts.length; i++) {
            const categoryName = pathParts[i];
            
            // Look for existing category at this level
            const existingCategory = await this.findCategoryByNameAndParent(categoryName, currentParentID, contextUser);
            
            if (existingCategory) {
                currentCategoryID = existingCategory.ID;
                currentParentID = existingCategory.ID;
            } else {
                // Create new category
                const newCategory = await md.GetEntityObject<QueryCategoryEntity>("Query Categories", contextUser);
                newCategory.Name = categoryName;
                newCategory.ParentID = currentParentID;
                newCategory.UserID = contextUser.ID;
                newCategory.Description = `Auto-created category from path: ${categoryPath}`;

                const saveOptions = new EntitySaveOptions();
                saveOptions.TransactionScopeId = userPayload.transactionScopeId; // Pass the transaction scope

                const saveResult = await newCategory.Save(saveOptions);
                if (!saveResult) {
                    throw new Error(`Failed to create category '${categoryName}': ${newCategory.LatestResult?.Message || 'Unknown error'}`);
                }

                currentCategoryID = newCategory.ID;
                currentParentID = newCategory.ID;

                // Refresh metadata after each category creation to ensure it's available for subsequent lookups
                await md.Refresh();
            }
        }

        if (!currentCategoryID) {
            throw new Error('Failed to determine final category ID');
        }

        return currentCategoryID;
    }

    /**
     * Finds a category by name and parent ID using case-insensitive comparison via RunView.
     * @param categoryName - Name of the category to find
     * @param parentID - Parent category ID (null for root level)
     * @param contextUser - User context for database operations
     * @returns The matching category entity or null if not found
     */
    private async findCategoryByNameAndParent(categoryName: string, parentID: string | null, contextUser: UserInfo): Promise<QueryCategoryEntity | null> {
        try {
            const rv = new RunView();
            const parentFilter = parentID ? `ParentID='${parentID}'` : 'ParentID IS NULL';
            const nameFilter = `LOWER(Name) = LOWER('${categoryName.replace(/'/g, "''")}')`; // Escape single quotes
            
            const result = await rv.RunView<QueryCategoryEntity>({
                EntityName: 'Query Categories',
                ExtraFilter: `${nameFilter} AND ${parentFilter}`,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0];
            }
            
            return null;
        } catch (error) {
            LogError(error);
            return null;
        }
    }
}