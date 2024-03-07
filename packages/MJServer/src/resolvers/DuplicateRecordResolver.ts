import { Arg, Field, Int, ObjectType, Query, Resolver } from "type-graphql";
import {DuplicateRecord, DuplicateRecordSearchParams, DuplicateRecordSearchResult, LogError} from '@memberjunction/core';
import { UserCache, SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";
import { configInfo } from "../config";

@ObjectType()
export class DuplicateSearchType {
  @Field(() => Int)
  EntityDocumentID: number;

  @Field(() => Int)
  RecordID: number;

  @Field(() => Int, { nullable: true })
  EntitiyID: number;

  @Field(() => String, { nullable: true })
  EntityName: string;

  @Field(() => Int, { nullable: true })
  ScoreMinimum: number;
}

@ObjectType()
export class DuplicateResultType {

  @Field(() => Int)
  EntityID: number;

  @Field(type => [DuplicateRecord])
  Duplicates: DuplicateRecord[];
}

@Resolver(_of => DuplicateSearchType)
export class DuplicateRecordResolver {

  @Query(_returns => DuplicateResultType, {description: "Returns a list of possible deuplicate records."})
  async GetDuplicateRecords(@Arg("params") params: DuplicateSearchType): Promise<DuplicateResultType> {
    const contextUser = UserCache.Instance.Users.find(u => u.Email.trim().toLowerCase() === configInfo?.userHandling?.contextUserForNewUserCreation?.trim().toLowerCase())
        if(!contextUser) {
            LogError(`Failed to load context user ${configInfo?.userHandling?.contextUserForNewUserCreation}, if you've not specified this on your config.json you must do so. This is the user that is contextually used for creating a new user record dynamically.`);
            return undefined;
        }

        const provider = new SQLServerDataProvider();
        const result: DuplicateRecordSearchResult = await provider.GetRecordDuplicates(params);
        return result;
    }
}