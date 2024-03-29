import { EntityPermissionType, Metadata } from '@memberjunction/core';
import { FileEntity, FileStorageProviderEntity } from '@memberjunction/core-entities';
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
import { createDownloadUrl, createUploadUrl, deleteObject } from '@memberjunction/storage';
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
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    const fileRecord = (await super.CreateFile({ ...input, Status: 'Pending' }, { dataSource, userPayload }, pubSub)) as File_;

    // If there's a problem creating the file record, the base resolver will return null
    if (!fileRecord) {
      return null;
    }

    // Create the upload URL and get the record updates (provider key, content type, etc)
    const { updatedInput, UploadUrl } = await createUploadUrl(providerEntity, fileRecord);

    // Save the file record with the updated input
    fileEntity.LoadFromData(input);
    fileEntity.SetMany(updatedInput);
    await fileEntity.Save();
    const File = fileEntity.GetAll();

    return { File, UploadUrl };
  }

  @FieldResolver(() => String)
  async DownloadUrl(@Root() file: File_, @Ctx() { userPayload }: AppContext) {
    const md = new Metadata();
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(file.ProviderID);

    const url = await createDownloadUrl(providerEntity, file.ProviderKey ?? file.ID);

    return url;
  }

  @Mutation(() => File_)
  async DeleteFile(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
    const md = new Metadata();
    const userInfo = this.GetUserFromPayload(userPayload);

    const fileEntity = await md.GetEntityObject<FileEntity>('Files', userInfo);
    await fileEntity.Load(ID);
    if (!fileEntity) {
      return null;
    }
    fileEntity.CheckPermissions(EntityPermissionType.Delete, true);

    // Only delete the object from the provider if it's actually been uploaded
    if (fileEntity.Status === 'Uploaded') {
      const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', userInfo);
      await providerEntity.Load(fileEntity.ProviderID);
      await deleteObject(providerEntity, fileEntity.ProviderKey ?? fileEntity.ID);
    }

    return super.DeleteFile(ID, { dataSource, userPayload }, pubSub);
  }
}
