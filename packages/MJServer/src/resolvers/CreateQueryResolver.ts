import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { QueryEntity, QueryCategoryEntity } from '@memberjunction/core-entities';

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
export class CreateQueryInputType {
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

export class CreateQueryResolver {
    /**
     * Creates a new query with the provided attributes. This mutation is restricted to system users only.
     * @param input - CreateQueryInputType containing all the query attributes
     * @param context - Application context containing user information
     * @returns CreateQueryResultType with success status and query data
     */
    @RequireSystemUser()
    @Mutation(() => CreateQueryResultType)
    async CreateQuery(
        @Arg('input', () => CreateQueryInputType) input: CreateQueryInputType,
        @Ctx() context: AppContext
    ): Promise<CreateQueryResultType> {
        try {
            const md = new Metadata();
            const newQuery = await md.GetEntityObject<QueryEntity>("Queries", context.userPayload.userRecord);

            // Handle CategoryPath if provided
            let finalCategoryID = input.CategoryID;
            if (input.CategoryPath) {
                finalCategoryID = await this.findOrCreateCategoryPath(input.CategoryPath, md, context.userPayload.userRecord);
            }

            // Populate the query fields from input
            newQuery.Name = input.Name;
            
            if (finalCategoryID != null) {
                newQuery.CategoryID = finalCategoryID;
            }
            
            if (input.UserQuestion != null) {
                newQuery.UserQuestion = input.UserQuestion;
            }
            
            if (input.Description != null) {
                newQuery.Description = input.Description;
            }
            
            if (input.SQL != null) {
                newQuery.SQL = input.SQL;
            }
            
            if (input.TechnicalDescription != null) {
                newQuery.TechnicalDescription = input.TechnicalDescription;
            }
            
            if (input.OriginalSQL != null) {
                newQuery.OriginalSQL = input.OriginalSQL;
            }
            
            if (input.Feedback != null) {
                newQuery.Feedback = input.Feedback;
            }
            
            if (input.Status != null) {
                newQuery.Status = input.Status;
            }
            
            if (input.QualityRank != null) {
                newQuery.QualityRank = input.QualityRank;
            }
            
            if (input.ExecutionCostRank != null) {
                newQuery.ExecutionCostRank = input.ExecutionCostRank;
            }
            
            if (input.UsesTemplate != null) {
                newQuery.UsesTemplate = input.UsesTemplate;
            }

            // Save the query
            const saveResult = await newQuery.Save();
            
            if (saveResult) {
                return {
                    Success: true,
                    QueryData: JSON.stringify(newQuery.GetAll())
                };
            } else {
                return {
                    Success: false,
                    ErrorMessage: `Failed to save query: ${newQuery.LatestResult?.Message || 'Unknown error'}`
                };
            }

        } catch (err) {
            LogError(err);
            return {
                Success: false,
                ErrorMessage: `CreateQueryResolver::CreateQuery --- Error creating query: ${err instanceof Error ? err.message : String(err)}`
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
    private async findOrCreateCategoryPath(categoryPath: string, md: Metadata, contextUser: UserInfo): Promise<string> {
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

                const saveResult = await newCategory.Save();
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