import { Metadata, CompositeKey, UserInfo } from '@memberjunction/core';
import { Arg, Ctx, Field, InputType, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';
import { CompositeKeyInputType, CompositeKeyOutputType } from '../generic/KeyInputOutputTypes';
import { CommunicationEngine } from '@memberjunction/communication-core';
import { DocumentationEngine } from '@memberjunction/doc-utils';

@InputType()
export class EntityRecordNameInput {
  @Field(() => String)
  EntityName: string;

  @Field(() => CompositeKeyInputType)
  CompositeKey: CompositeKey;
}

@ObjectType()
export class EntityRecordNameResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => CompositeKeyOutputType)
  CompositeKey: CompositeKey;

  @Field(() => String)
  EntityName: string;

  @Field(() => String, { nullable: true })
  RecordName?: string;
}

@Resolver(EntityRecordNameResult)
export class EntityRecordNameResolver {
  @Query(() => EntityRecordNameResult)
  async GetEntityRecordName(
    @Arg('EntityName', () => String) EntityName: string,
    @Arg('CompositeKey', () => CompositeKeyInputType) primaryKey: CompositeKey,
    @Ctx() {userPayload}: AppContext
  ): Promise<EntityRecordNameResult> {
    //TEMPORARY: test harness for communication framework - dumb place but quick test grounds, will delete
    //this.TestCommunicationFramework(userPayload.userRecord, EntityName, primaryKey);
    //this.TestDocLibraries(userPayload.userRecord);


    const md = new Metadata();
    return await this.InnerGetEntityRecordName(md, EntityName, primaryKey);
  }

  @Query(() => [EntityRecordNameResult])
  async GetEntityRecordNames(
    @Arg('info', () => [EntityRecordNameInput]) info: EntityRecordNameInput[],
    @Ctx() {}: AppContext
  ): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    const md = new Metadata();
    for (const i of info) {
      result.push(await this.InnerGetEntityRecordName(md, i.EntityName, i.CompositeKey));
    }
    return result;
  }

  async InnerGetEntityRecordName(md: Metadata, EntityName: string, primaryKey: CompositeKeyInputType): Promise<EntityRecordNameResult> {
    const pk = new CompositeKey(primaryKey.KeyValuePairs);
    const e = md.Entities.find((e) => e.Name === EntityName);
    if (e) {
      const recordName = await md.GetEntityRecordName(e.Name, pk);
      if (recordName) 
        return { Success: true, Status: 'OK', CompositeKey: pk, RecordName: recordName, EntityName };
      else
        return {
          Success: false,
          Status: `Name for record, or record ${pk.ToString()} itself not found, could be an access issue if user doesn't have Row Level Access (RLS) if RLS is enabled for this entity`,
          CompositeKey: pk,
          EntityName
        };
    } 
    else 
      return { Success: false, Status: `Entity ${EntityName} not found`, CompositeKey: pk, EntityName };
  }

  private async TestCommunicationFramework(user: UserInfo, EntityName: string, primaryKey: CompositeKeyInputType) {
    const engine = CommunicationEngine.Instance;
    await engine.Config(false, user);
    await engine.SendSingleMessage('SendGrid', 'Email', {
      To: 'user@domain.com',
      Subject: `MJServer Notification: GetEntityRecordName Called For: ${EntityName}`,
      Body: `Entity: ${EntityName}, Key: ${JSON.stringify(primaryKey)}`,
      MessageType: null
    });
  }

  private async TestDocLibraries(user: UserInfo) {
    const engine = DocumentationEngine.Instance;
    await engine.Config(false, user)
    console.log(JSON.stringify(engine.Libraries));
  }
}

export default EntityRecordNameResolver;
