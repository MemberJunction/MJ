import { EntityPermissionType, Metadata, FieldValueCollection, EntitySaveOptions } from '@memberjunction/core';
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
import { createDownloadUrl, createUploadUrl, deleteObject, moveObject, copyObject, listObjects, FileStorageBase } from '@memberjunction/storage';
import { CreateMJFileInput, MJFileResolver as FileResolverBase, MJFile_, UpdateMJFileInput } from '../generated/generated.js';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';
import { GetReadOnlyProvider } from '../util.js';
import { MJGlobal } from '@memberjunction/global';

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

@ObjectType()
export class StorageObjectMetadata {
  @Field(() => String)
  name: string;

  @Field(() => String)
  path: string;

  @Field(() => String)
  fullPath: string;

  @Field(() => Int)
  size: number;

  @Field(() => String)
  contentType: string;

  @Field(() => String)
  lastModified: string;

  @Field(() => Boolean)
  isDirectory: boolean;

  @Field(() => String, { nullable: true })
  etag?: string;

  @Field(() => String, { nullable: true })
  cacheControl?: string;
}

@ObjectType()
export class StorageListResult {
  @Field(() => [StorageObjectMetadata])
  objects: StorageObjectMetadata[];

  @Field(() => [String])
  prefixes: string[];
}

@InputType()
export class ListStorageObjectsInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  Prefix: string;

  @Field(() => String, { nullable: true })
  Delimiter?: string;
}

@InputType()
export class CreatePreAuthDownloadUrlInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  ObjectName: string;
}

@InputType()
export class CreatePreAuthUploadUrlInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  ObjectName: string;

  @Field(() => String, { nullable: true })
  ContentType?: string;
}

@ObjectType()
export class CreatePreAuthUploadUrlPayload {
  @Field(() => String)
  UploadUrl: string;

  @Field(() => String, { nullable: true })
  ProviderKey?: string;
}

@InputType()
export class DeleteStorageObjectInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  ObjectName: string;
}

@InputType()
export class MoveStorageObjectInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  OldName: string;

  @Field(() => String)
  NewName: string;
}

@InputType()
export class CopyStorageObjectInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  SourceName: string;

  @Field(() => String)
  DestinationName: string;
}

@InputType()
export class CreateDirectoryInput {
  @Field(() => String)
  ProviderID: string;

  @Field(() => String)
  Path: string;
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
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true})    
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
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
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
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
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

  @Mutation(() => StorageListResult)
  async ListStorageObjects(
    @Arg('input', () => ListStorageObjectsInput) input: ListStorageObjectsInput,
    @Ctx() context: AppContext
  ) {
    console.log('[FileResolver] ListStorageObjects called with:', {
      ProviderID: input.ProviderID,
      Prefix: input.Prefix,
      Delimiter: input.Delimiter
    });

    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    console.log('[FileResolver] Provider loaded:', {
      Name: providerEntity.Name,
      ServerDriverKey: providerEntity.ServerDriverKey,
      HasConfiguration: !!providerEntity.Get('Configuration')
    });

    // Check permissions - user must have read access to Files entity
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    // Call the storage provider to list objects
    const result = await listObjects(providerEntity, input.Prefix, input.Delimiter || '/');

    console.log('[FileResolver] listObjects result:', {
      objectsCount: result.objects.length,
      prefixesCount: result.prefixes.length,
      objects: result.objects.map(o => ({ name: o.name, isDirectory: o.isDirectory })),
      prefixes: result.prefixes
    });

    // Convert Date objects to ISO strings for GraphQL
    const objects = result.objects.map(obj => ({
      ...obj,
      lastModified: obj.lastModified.toISOString()
    }));

    return {
      objects,
      prefixes: result.prefixes
    };
  }

  @Mutation(() => String)
  async CreatePreAuthDownloadUrl(
    @Arg('input', () => CreatePreAuthDownloadUrlInput) input: CreatePreAuthDownloadUrlInput,
    @Ctx() context: AppContext
  ) {
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    // Check permissions
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    // Create download URL
    const downloadUrl = await createDownloadUrl(providerEntity, input.ObjectName);
    return downloadUrl;
  }

  @Mutation(() => CreatePreAuthUploadUrlPayload)
  async CreatePreAuthUploadUrl(
    @Arg('input', () => CreatePreAuthUploadUrlInput) input: CreatePreAuthUploadUrlInput,
    @Ctx() context: AppContext
  ) {
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    // Check permissions
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Create upload URL - use the utility with a minimal input object
    const { UploadUrl, updatedInput } = await createUploadUrl(providerEntity, {
      ID: '', // Not needed for direct upload
      Name: input.ObjectName,
      ProviderID: input.ProviderID,
      ContentType: input.ContentType
    });

    // Extract ProviderKey if it exists (spread into updatedInput by createUploadUrl)
    const providerKey = (updatedInput as { ProviderKey?: string }).ProviderKey;

    return {
      UploadUrl,
      ProviderKey: providerKey
    };
  }

  @Mutation(() => Boolean)
  async DeleteStorageObject(
    @Arg('input', () => DeleteStorageObjectInput) input: DeleteStorageObjectInput,
    @Ctx() context: AppContext
  ) {
    console.log('[FileResolver] DeleteStorageObject called:', input);

    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    console.log('[FileResolver] Provider loaded:', {
      providerID: providerEntity.ID,
      providerName: providerEntity.Name,
      serverDriverKey: providerEntity.ServerDriverKey
    });

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    // Check permissions
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Delete, true);

    console.log('[FileResolver] Permissions checked, calling deleteObject...');

    // Delete the object
    const success = await deleteObject(providerEntity, input.ObjectName);

    console.log('[FileResolver] deleteObject returned:', success);

    return success;
  }

  @Mutation(() => Boolean)
  async MoveStorageObject(
    @Arg('input', () => MoveStorageObjectInput) input: MoveStorageObjectInput,
    @Ctx() context: AppContext
  ) {
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    // Check permissions
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Update, true);

    // Move the object
    const success = await moveObject(providerEntity, input.OldName, input.NewName);
    return success;
  }

  @Mutation(() => Boolean)
  async CopyStorageObject(
    @Arg('input', () => CopyStorageObjectInput) input: CopyStorageObjectInput,
    @Ctx() context: AppContext
  ) {
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    // Check permissions - copying requires both read (source) and create (destination)
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Copy the object
    const success = await copyObject(providerEntity, input.SourceName, input.DestinationName);
    return success;
  }

  @Mutation(() => Boolean)
  async CreateDirectory(
    @Arg('input', () => CreateDirectoryInput) input: CreateDirectoryInput,
    @Ctx() context: AppContext
  ) {
    const md = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the provider entity
    const providerEntity = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers', user);
    await providerEntity.Load(input.ProviderID);

    if (!providerEntity) {
      throw new Error(`Storage provider with ID ${input.ProviderID} not found`);
    }

    // Check permissions
    const fileEntity = await md.GetEntityObject<FileEntity>('Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Get the storage driver and create directory
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

    // Initialize driver with config if available
    const configJson = providerEntity.Get('Configuration') as string | null;
    if (configJson) {
      const config = JSON.parse(configJson);
      await driver.initialize(config);
    }

    const success = await driver.CreateDirectory(input.Path);
    return success;
  }
}
