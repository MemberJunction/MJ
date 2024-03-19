import { Metadata } from '@memberjunction/core';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { AppContext, Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, PubSub, PubSubEngine, Resolver } from '@memberjunction/server';
import { createUploadUrl } from '@memberjunction/storage';
import { CreateFileInput, FileResolver as FileResolverBase, File_ } from '../generated/generated';


@InputType()
export class CreateUploadURLInput {
  @Field(() => Int)
  FileID: number;
}

@ObjectType()
export class CreateFilePayload {
  @Field(() => File_)
  File: File_;
  @Field(() => String)
  UploadUrl: string;
}

@Resolver(File_)
export class FileResolver extends FileResolverBase {
  @Mutation(() => CreateFilePayload)
  async CreateFile(@Arg('input', () => CreateFileInput) input: CreateFileInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
    const md = new Metadata();
    const entity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', this.GetUserFromPayload(userPayload));
    
    const { updatedInput, UploadUrl } = await createUploadUrl(entity, input);

    const resolver = new FileResolverBase();
    const File = await resolver.CreateFile(updatedInput, { dataSource, userPayload}, pubSub);

    return { File, UploadUrl };
  }
}
