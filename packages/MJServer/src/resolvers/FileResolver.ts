import { EntityPermissionType, Metadata } from '@memberjunction/core';
import { FileEntity, FileStorageProviderEntity } from '@memberjunction/core-entities';
import {
  AppContext,
  Arg,
  Ctx,
  DeleteOptionsInput,
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
import { createDownloadUrl, createUploadUrl, deleteObject, moveObject } from '@memberjunction/storage';
import { CreateFileInput, FileResolver as FileResolverBase, File_, UpdateFileInput } from '../generated/generated.js';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';

@InputType()
export class CreateUploadURLInput {
  @Field(() => String)
  FileID: string;
}

@ObjectType()
export class CreateFilePayload {
  @Field(() => File_)
  File: File_;
  @Field(() => String)
  UploadUrl: string;
  @Field(() => Boolean)
  NameExists: boolean;
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

    // Check to see if there's already an object with that name
    const [sameName] = await this.findBy(dataSource, 'Files', { Name: input.Name, ProviderID: input.ProviderID });
    const NameExists = Boolean(sameName);

    const fileRecord = (await super.CreateFile({ ...input, Status: 'Pending' }, { dataSource, userPayload }, pubSub)) as File_;

    // If there's a problem creating the file record, the base resolver will return null
    if (!fileRecord) {
      return null;
    }

    // Create the upload URL and get the record updates (provider key, content type, etc)
    const { updatedInput, UploadUrl } = await createUploadUrl(providerEntity, fileRecord);

    // Save the file record with the updated input
    const mapper = new FieldMapper();
    fileEntity.LoadFromData(mapper.ReverseMapFields({ ...input }));
    fileEntity.SetMany(mapper.ReverseMapFields({ ...updatedInput }));
    await fileEntity.Save();
    const File = mapper.MapFields({ ...fileEntity.GetAll() });

    return { File, UploadUrl, NameExists };
  }

  @FieldResolver(() => String)
  async DownloadUrl(@Root() file: File_, @Ctx() { userPayload }: AppContext) {
    const md = new Metadata();
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(file.ProviderID);

    const url = await createDownloadUrl(providerEntity, file.ProviderKey ?? file.Name);

    return url;
  }

  @Mutation(() => File_)
  async UpdateFile(
    @Arg('input', () => UpdateFileInput) input: UpdateFileInput,
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    // if the name is changing, rename the target object as well
    const md = new Metadata();
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Update, true);

    await fileEntity.Load(input.ID);

    if (fileEntity.Name !== input.Name) {
      const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
      await providerEntity.Load(fileEntity.ProviderID);

      const success = await moveObject(providerEntity, fileEntity.Name, input.Name);
      if (!success) {
        throw new Error('Error updating object name');
      }
    }

    const updatedFile = await super.UpdateFile(input, { dataSource, userPayload }, pubSub);
    return updatedFile;
  }

  @Mutation(() => File_)
  async DeleteFile(
    @Arg('ID', () => String) ID: string,
    @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput,
    @Ctx() context: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    const md = new Metadata();
    const userInfo = this.GetUserFromPayload(context.userPayload);

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
      await deleteObject(providerEntity, fileEntity.ProviderKey ?? fileEntity.Name);
    }

    return super.DeleteFile(ID, options, context, pubSub);
  }
}
