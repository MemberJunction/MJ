import { Metadata } from '@memberjunction/core';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import {
  AppContext,
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  PubSub,
  PubSubEngine,
  Resolver,
  Root,
} from '@memberjunction/server';
import { createDownloadUrl, createUploadUrl } from '@memberjunction/storage';
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

@ObjectType()
export class FileExt extends File_ {
  @Field(() => String)
  DownloadUrl: string;
}

@Resolver(File_)
export class FileResolver extends FileResolverBase {
  @Mutation(() => CreateFilePayload)
  async CreateFile(
    @Arg('input', () => CreateFileInput) input: CreateFileInput,
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    const md = new Metadata();
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>(
      'File Storage Providers',
      this.GetUserFromPayload(userPayload)
    );

    const { updatedInput, UploadUrl } = await createUploadUrl(providerEntity, input);

    const resolver = new FileResolverBase();
    const File = await resolver.CreateFile(updatedInput, { dataSource, userPayload }, pubSub);

    return { File, UploadUrl };
  }

  @FieldResolver(() => String)
  async DownloadUrl(@Root() file: File_, @Ctx() { userPayload }: AppContext) {
    const md = new Metadata();
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>(
      'File Storage Providers',
      this.GetUserFromPayload(userPayload)
    );

    const url = await createDownloadUrl(providerEntity, file.ProviderKey ?? file.Name);

    return url;
  }
}
