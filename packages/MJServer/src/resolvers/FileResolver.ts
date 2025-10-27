import { EntityPermissionType, Metadata, FieldValueCollection, EntitySaveOptions } from '@memberjunction/global';
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
import { CreateMJFileInput, MJFileResolver as FileResolverBase, MJFile_, UpdateMJFileInput } from '../generated/generated.js';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';
import { GetReadOnlyProvider } from '../util.js';

@InputType()
export class CreateUploadURLInput {
  @Field(() => String)
  FileID: string;
}

@ObjectType()
export class CreateFilePayload {
  @Field(() => MJFile_)
  File: MJFile_;
  @Field(() => String)
  UploadUrl: string;
  @Field(() => Boolean)
  NameExists: boolean;
}

@ObjectType()
export class FileExt extends MJFile_ {
  @Field(() => String)
  DownloadUrl: string;
}

@Resolver(MJFile_)
export class FileResolver extends FileResolverBase {
  @Mutation(() => CreateFilePayload)
  async CreateFile(
    @Arg('input', () => CreateMJFileInput) input: CreateMJFileInput,
    @Ctx() context: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    // Check to see if there's already an object with that name
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);
    const fileEntity = await provider.GetEntityObject<FileEntity>('Files', user);
    const providerEntity = await provider.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    const [sameName] = await this.findBy(
      provider,
      'Files',
      { Name: input.Name, ProviderID: input.ProviderID },
      context.userPayload.userRecord
    );
    const NameExists = Boolean(sameName);

    const success = fileEntity.NewRecord(FieldValueCollection.FromObject({ ...input, Status: 'Pending' }));

    // If there's a problem creating the file record, the base resolver will return null
    if (!success) {
      return null;
    }

    // Create the upload URL and get the record updates (provider key, content type, etc)
    const { updatedInput, UploadUrl } = await createUploadUrl(providerEntity, fileEntity);

    // Save the file record with the updated input
    const mapper = new FieldMapper();
    fileEntity.SetMany(mapper.ReverseMapFields({ ...updatedInput }), true, true);
    await fileEntity.Save();
    const File = mapper.MapFields({ ...fileEntity.GetAll() });

    return { File, UploadUrl, NameExists };
  }

  @FieldResolver(() => String)
  async DownloadUrl(@Root() file: MJFile_, @Ctx() { userPayload }: AppContext) {
    const md = new Metadata();
    const user = this.GetUserFromPayload(userPayload);
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(file.ProviderID);

    const url = await createDownloadUrl(providerEntity, file.ProviderKey ?? file.Name);

    return url;
  }

  @Mutation(() => MJFile_)
  async UpdateFile(
    @Arg('input', () => UpdateMJFileInput) input: UpdateMJFileInput,
    @Ctx() context: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    // if the name is changing, rename the target object as well
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);
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

    const updatedFile = await super.UpdateMJFile(input, context, pubSub);
    return updatedFile;
  }

  @Mutation(() => MJFile_)
  async DeleteFile(
    @Arg('ID', () => String) ID: string,
    @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput,
    @Ctx() context: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
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

    return super.DeleteMJFile(ID, options, context, pubSub);
  }
}
