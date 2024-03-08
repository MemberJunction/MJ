import { Arg, Field, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { PotentialDuplicate, Metadata, PrimaryKeyValue } from '@memberjunction/core';
import {PrimaryKeyValueInputType, PrimaryKeyValueOutputType} from './MergeRecordsResolver'

@InputType()
export class DuplicateSearchType {
  @Field(() => Int)
  EntityDocumentID: number;

  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValueInputType[];

  @Field(() => Int, { nullable: true })
  EntitiyID: number;

  @Field(() => String, { nullable: true })
  EntityName: string;

  @Field(() => Int, { nullable: true })
  ProbabilityScore: number;

  //this is a copy of MJCore's PrimaryKeyValueBase CompositeKey property
  //changes here should be applied there as well
  @Field(() => String)
  public get CompositeKey(): string {
        
    if(!this.PrimaryKeyValues){
        return "";
    }

    if(this.PrimaryKeyValues.length === 1){
        return this.PrimaryKeyValues[0].Value.toString();
    }

    return this.PrimaryKeyValues.map((keyValue, index) => {
        return keyValue.Value.toString();
    }).join(", ");
  }
}

@ObjectType()
export class PotentialDuplicateType {
  @Field(() => Int)
  ProbabilityScore: number;

  @Field(() => [PrimaryKeyValueOutputType])
  PrimaryKeyValues: PrimaryKeyValueOutputType[];
}

@ObjectType()
export class DuplicateResultType {

  @Field(() => Int)
  EntityID: number;

  @Field(type => [PotentialDuplicateType])
  Duplicates: PotentialDuplicateType[];
}

@Resolver(_of => DuplicateResultType)
export class DuplicateRecordResolver {

  @Query(_returns => DuplicateResultType, {description: "Returns a list of possible deuplicate records."})
  async GetDuplicateRecords(@Arg("params")params: DuplicateSearchType): Promise<DuplicateResultType> {
      const md = new Metadata();
      const result = await md.GetRecordDuplicates(params);
      return result;
    }
}