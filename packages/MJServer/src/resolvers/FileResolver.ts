import { EntityPermissionType, Metadata, FieldValueCollection, EntitySaveOptions, RunView } from '@memberjunction/core';
import { MJFileEntity, MJFileStorageProviderEntity, MJFileStorageAccountEntity } from '@memberjunction/core-entities';
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
  Query,
  Resolver,
  Root,
} from '@memberjunction/server';
import {
  createDownloadUrl,
  createUploadUrl,
  deleteObject,
  moveObject,
  copyObject,
  listObjects,
  copyObjectBetweenProviders,
  searchAcrossAccounts,
  AccountSearchResult,
  AccountSearchInput,
  FileSearchResult,
  UserContextOptions,
  ExtendedUserContextOptions,
  initializeDriverWithAccountCredentials,
} from '@memberjunction/storage';
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
  AccountID: string;

  @Field(() => String)
  Prefix: string;

  @Field(() => String, { nullable: true })
  Delimiter?: string;
}

@InputType()
export class CreatePreAuthDownloadUrlInput {
  @Field(() => String)
  AccountID: string;

  @Field(() => String)
  ObjectName: string;
}

@InputType()
export class CreatePreAuthUploadUrlInput {
  @Field(() => String)
  AccountID: string;

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
  AccountID: string;

  @Field(() => String)
  ObjectName: string;
}

@InputType()
export class MoveStorageObjectInput {
  @Field(() => String)
  AccountID: string;

  @Field(() => String)
  OldName: string;

  @Field(() => String)
  NewName: string;
}

@InputType()
export class CopyStorageObjectInput {
  @Field(() => String)
  AccountID: string;

  @Field(() => String)
  SourceName: string;

  @Field(() => String)
  DestinationName: string;
}

@InputType()
export class CreateDirectoryInput {
  @Field(() => String)
  AccountID: string;

  @Field(() => String)
  Path: string;
}

@InputType()
export class CopyObjectBetweenAccountsInput {
  @Field(() => String)
  SourceAccountID: string;

  @Field(() => String)
  DestinationAccountID: string;

  @Field(() => String)
  SourcePath: string;

  @Field(() => String)
  DestinationPath: string;
}

@ObjectType()
export class CopyObjectBetweenAccountsPayload {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  message: string;

  @Field(() => Int, { nullable: true })
  bytesTransferred?: number;

  @Field(() => String)
  sourceAccount: string;

  @Field(() => String)
  destinationAccount: string;

  @Field(() => String)
  sourcePath: string;

  @Field(() => String)
  destinationPath: string;
}

@InputType()
export class SearchAcrossAccountsInput {
  @Field(() => [String])
  AccountIDs: string[];

  @Field(() => String)
  Query: string;

  @Field(() => Int, { nullable: true })
  MaxResultsPerAccount?: number;

  @Field(() => [String], { nullable: true })
  FileTypes?: string[];

  @Field(() => Boolean, { nullable: true })
  SearchContent?: boolean;
}

@ObjectType()
export class FileSearchResultPayload {
  @Field(() => String)
  path: string;

  @Field(() => String)
  name: string;

  @Field(() => Int)
  size: number;

  @Field(() => String)
  contentType: string;

  @Field(() => String)
  lastModified: string;

  @Field(() => Number, { nullable: true })
  relevance?: number;

  @Field(() => String, { nullable: true })
  excerpt?: string;

  @Field(() => Boolean, { nullable: true })
  matchInFilename?: boolean;

  @Field(() => String, { nullable: true })
  objectId?: string;
}

@ObjectType()
export class AccountSearchResultPayload {
  @Field(() => String)
  accountID: string;

  @Field(() => String)
  accountName: string;

  @Field(() => Boolean)
  success: boolean;

  @Field(() => String, { nullable: true })
  errorMessage?: string;

  @Field(() => [FileSearchResultPayload])
  results: FileSearchResultPayload[];

  @Field(() => Int, { nullable: true })
  totalMatches?: number;

  @Field(() => Boolean)
  hasMore: boolean;

  @Field(() => String, { nullable: true })
  nextPageToken?: string;
}

@ObjectType()
export class SearchAcrossAccountsPayload {
  @Field(() => [AccountSearchResultPayload])
  accountResults: AccountSearchResultPayload[];

  @Field(() => Int)
  totalResultsReturned: number;

  @Field(() => Int)
  successfulAccounts: number;

  @Field(() => Int)
  failedAccounts: number;
}

@Resolver(MJFile_)
export class FileResolver extends FileResolverBase {
  /**
   * Builds UserContextOptions for storage operations that may require OAuth authentication.
   * This passes the current user's ID and context to allow the storage utilities to
   * load user-specific OAuth tokens for providers like Google Drive.
   */
  private buildUserContext(context: AppContext): UserContextOptions {
    const user = this.GetUserFromPayload(context.userPayload);
    return {
      userID: user.ID,
      contextUser: user,
    };
  }

  /**
   * Builds ExtendedUserContextOptions that includes the account entity for enterprise model.
   * This is required for OAuth providers using the Credential Engine to decrypt credentials.
   */
  private buildExtendedUserContext(context: AppContext, accountEntity: MJFileStorageAccountEntity): ExtendedUserContextOptions {
    const user = this.GetUserFromPayload(context.userPayload);
    return {
      userID: user.ID,
      contextUser: user,
      accountEntity,
    };
  }

  /**
   * Loads a FileStorageAccount and its associated FileStorageProvider.
   * This is the standard way to get provider information in the enterprise model.
   * @param accountId The ID of the FileStorageAccount
   * @param context The AppContext containing provider info
   * @returns Object containing both the account and provider entities
   */
  private async loadAccountAndProvider(
    accountId: string,
    context: AppContext,
  ): Promise<{ account: MJFileStorageAccountEntity; provider: MJFileStorageProviderEntity }> {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account entity
    const account = await md.GetEntityObject<MJFileStorageAccountEntity>('MJ: File Storage Accounts', user);
    const loaded = await account.Load(accountId);
    if (!loaded) {
      throw new Error(`Storage account with ID ${accountId} not found`);
    }

    // Load the provider entity from the account's ProviderID
    const provider = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
    await provider.Load(account.ProviderID);

    return { account, provider };
  }

  @Mutation(() => CreateFilePayload)
  async CreateFile(@Arg('input', () => CreateMJFileInput) input: CreateMJFileInput, @Ctx() context: AppContext, @PubSub() pubSub: PubSubEngine) {
    // Check to see if there's already an object with that name
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);
    const fileEntity = await provider.GetEntityObject<MJFileEntity>('MJ: Files', user);
    const providerEntity = await provider.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    const [sameName] = await this.findBy(provider, 'MJ: Files', { Name: input.Name, ProviderID: input.ProviderID }, context.userPayload.userRecord);
    const NameExists = Boolean(sameName);

    const success = fileEntity.NewRecord(FieldValueCollection.FromObject({ ...input, Status: 'Pending' }));

    // If there's a problem creating the file record, the base resolver will return null
    if (!success) {
      return null;
    }

    // Create the upload URL and get the record updates (provider key, content type, etc)
    const userContext = this.buildUserContext(context);
    const { updatedInput, UploadUrl } = await createUploadUrl(providerEntity, fileEntity, userContext);

    // Save the file record with the updated input
    const mapper = new FieldMapper();
    fileEntity.SetMany(mapper.ReverseMapFields({ ...updatedInput }), true, true);
    await fileEntity.Save();
    const File = mapper.MapFields({ ...fileEntity.GetAll() });

    return { File, UploadUrl, NameExists };
  }

  @FieldResolver(() => String)
  async DownloadUrl(@Root() file: MJFile_, @Ctx() context: AppContext) {
    const md = new Metadata();
    const user = this.GetUserFromPayload(context.userPayload);
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
    await providerEntity.Load(file.ProviderID);

    const userContext = this.buildUserContext(context);
    const url = await createDownloadUrl(providerEntity, file.ProviderKey ?? file.Name, userContext);

    return url;
  }

  @Mutation(() => MJFile_)
  async UpdateFile(@Arg('input', () => UpdateMJFileInput) input: UpdateMJFileInput, @Ctx() context: AppContext, @PubSub() pubSub: PubSubEngine) {
    // if the name is changing, rename the target object as well
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Update, true);

    await fileEntity.Load(input.ID);

    if (fileEntity.Name !== input.Name) {
      const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
      await providerEntity.Load(fileEntity.ProviderID);

      const userContext = this.buildUserContext(context);
      const success = await moveObject(providerEntity, fileEntity.Name, input.Name, userContext);
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
    @PubSub() pubSub: PubSubEngine,
  ) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const userInfo = this.GetUserFromPayload(context.userPayload);

    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', userInfo);
    await fileEntity.Load(ID);
    if (!fileEntity) {
      return null;
    }
    fileEntity.CheckPermissions(EntityPermissionType.Delete, true);

    // Only delete the object from the provider if it's actually been uploaded
    if (fileEntity.Status === 'Uploaded') {
      const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', userInfo);
      await providerEntity.Load(fileEntity.ProviderID);
      const userContext = this.buildUserContext(context);
      await deleteObject(providerEntity, fileEntity.ProviderKey ?? fileEntity.Name, userContext);
    }

    return super.DeleteMJFile(ID, options, context, pubSub);
  }

  @Query(() => StorageListResult)
  async ListStorageObjects(@Arg('input', () => ListStorageObjectsInput) input: ListStorageObjectsInput, @Ctx() context: AppContext) {
    console.log('[FileResolver] ListStorageObjects called with:', {
      AccountID: input.AccountID,
      Prefix: input.Prefix,
      Delimiter: input.Delimiter,
    });

    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    console.log('[FileResolver] Provider loaded:', {
      Name: providerEntity.Name,
      ServerDriverKey: providerEntity.ServerDriverKey,
      HasConfiguration: !!providerEntity.Get('Configuration'),
    });

    // Check permissions - user must have read access to Files entity
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    // Call the storage provider to list objects with extended user context (includes account for credential lookup)
    const userContext = this.buildExtendedUserContext(context, account);
    const result = await listObjects(providerEntity, input.Prefix, input.Delimiter || '/', userContext);

    console.log('[FileResolver] listObjects result:', {
      objectsCount: result.objects.length,
      prefixesCount: result.prefixes.length,
      objects: result.objects.map((o) => ({ name: o.name, isDirectory: o.isDirectory })),
      prefixes: result.prefixes,
    });

    // Convert Date objects to ISO strings for GraphQL
    const objects = result.objects.map((obj) => ({
      ...obj,
      lastModified: obj.lastModified.toISOString(),
    }));

    return {
      objects,
      prefixes: result.prefixes,
    };
  }

  @Query(() => String)
  async CreatePreAuthDownloadUrl(@Arg('input', () => CreatePreAuthDownloadUrlInput) input: CreatePreAuthDownloadUrlInput, @Ctx() context: AppContext) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    // Check permissions
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    // Create download URL with extended user context (includes account for credential lookup)
    const userContext = this.buildExtendedUserContext(context, account);
    const downloadUrl = await createDownloadUrl(providerEntity, input.ObjectName, userContext);
    return downloadUrl;
  }

  @Mutation(() => CreatePreAuthUploadUrlPayload)
  async CreatePreAuthUploadUrl(@Arg('input', () => CreatePreAuthUploadUrlInput) input: CreatePreAuthUploadUrlInput, @Ctx() context: AppContext) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    // Check permissions
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Create upload URL with extended user context (includes account for credential lookup)
    const userContext = this.buildExtendedUserContext(context, account);
    const { UploadUrl, updatedInput } = await createUploadUrl(
      providerEntity,
      {
        ID: '', // Not needed for direct upload
        Name: input.ObjectName,
        ProviderID: providerEntity.ID,
        ContentType: input.ContentType,
      },
      userContext,
    );

    // Extract ProviderKey if it exists (spread into updatedInput by createUploadUrl)
    const providerKey = (updatedInput as { ProviderKey?: string }).ProviderKey;

    return {
      UploadUrl,
      ProviderKey: providerKey,
    };
  }

  @Mutation(() => Boolean)
  async DeleteStorageObject(@Arg('input', () => DeleteStorageObjectInput) input: DeleteStorageObjectInput, @Ctx() context: AppContext) {
    console.log('[FileResolver] DeleteStorageObject called:', input);

    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    console.log('[FileResolver] Provider loaded:', {
      providerID: providerEntity.ID,
      providerName: providerEntity.Name,
      serverDriverKey: providerEntity.ServerDriverKey,
    });

    // Check permissions
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Delete, true);

    console.log('[FileResolver] Permissions checked, calling deleteObject...');

    // Delete the object with extended user context (includes account for credential lookup)
    const userContext = this.buildExtendedUserContext(context, account);
    const success = await deleteObject(providerEntity, input.ObjectName, userContext);

    console.log('[FileResolver] deleteObject returned:', success);

    return success;
  }

  @Mutation(() => Boolean)
  async MoveStorageObject(@Arg('input', () => MoveStorageObjectInput) input: MoveStorageObjectInput, @Ctx() context: AppContext) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    // Check permissions
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Update, true);

    // Move the object with extended user context (includes account for credential lookup)
    const userContext = this.buildExtendedUserContext(context, account);
    const success = await moveObject(providerEntity, input.OldName, input.NewName, userContext);
    return success;
  }

  @Mutation(() => Boolean)
  async CopyStorageObject(@Arg('input', () => CopyStorageObjectInput) input: CopyStorageObjectInput, @Ctx() context: AppContext) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    // Check permissions - copying requires both read (source) and create (destination)
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Copy the object with extended user context (includes account for credential lookup)
    const userContext = this.buildExtendedUserContext(context, account);
    const success = await copyObject(providerEntity, input.SourceName, input.DestinationName, userContext);
    return success;
  }

  @Mutation(() => Boolean)
  async CreateDirectory(@Arg('input', () => CreateDirectoryInput) input: CreateDirectoryInput, @Ctx() context: AppContext) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Load the account and its provider
    const { account: accountEntity, provider: providerEntity } = await this.loadAccountAndProvider(input.AccountID, context);

    // Check permissions
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Initialize driver with account-based credentials from Credential Engine
    const driver = await initializeDriverWithAccountCredentials({
      accountEntity,
      providerEntity,
      contextUser: user,
    });

    const success = await driver.CreateDirectory(input.Path);
    return success;
  }

  @Mutation(() => CopyObjectBetweenAccountsPayload)
  async CopyObjectBetweenAccounts(
    @Arg('input', () => CopyObjectBetweenAccountsInput) input: CopyObjectBetweenAccountsInput,
    @Ctx() context: AppContext,
  ): Promise<CopyObjectBetweenAccountsPayload> {
    console.log('[FileResolver] CopyObjectBetweenAccounts called:', {
      sourceAccountID: input.SourceAccountID,
      destinationAccountID: input.DestinationAccountID,
      sourcePath: input.SourcePath,
      destinationPath: input.DestinationPath,
    });

    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Check permissions - copying requires both read (source) and create (destination)
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);
    fileEntity.CheckPermissions(EntityPermissionType.Create, true);

    // Load the source account and its provider
    const { account: sourceAccount, provider: sourceProviderEntity } = await this.loadAccountAndProvider(input.SourceAccountID, context);

    // Load the destination account and its provider
    const { account: destAccount, provider: destProviderEntity } = await this.loadAccountAndProvider(input.DestinationAccountID, context);

    // Perform the cross-provider copy with extended user context (includes account for credential lookup)
    const sourceUserContext = this.buildExtendedUserContext(context, sourceAccount);
    const destUserContext = this.buildExtendedUserContext(context, destAccount);
    const result = await copyObjectBetweenProviders(sourceProviderEntity, destProviderEntity, input.SourcePath, input.DestinationPath, {
      sourceUserContext,
      destinationUserContext: destUserContext,
    });

    console.log('[FileResolver] CopyObjectBetweenAccounts result:', result);

    return {
      success: result.success,
      message: result.message,
      bytesTransferred: result.bytesTransferred,
      sourceAccount: sourceAccount.Name,
      destinationAccount: destAccount.Name,
      sourcePath: result.sourcePath,
      destinationPath: result.destinationPath,
    };
  }

  @Query(() => SearchAcrossAccountsPayload)
  async SearchAcrossAccounts(
    @Arg('input', () => SearchAcrossAccountsInput) input: SearchAcrossAccountsInput,
    @Ctx() context: AppContext,
  ): Promise<SearchAcrossAccountsPayload> {
    console.log('[FileResolver] SearchAcrossAccounts called:', {
      accountIDs: input.AccountIDs,
      query: input.Query,
      maxResultsPerAccount: input.MaxResultsPerAccount,
      fileTypes: input.FileTypes,
      searchContent: input.SearchContent,
    });

    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);

    // Check permissions - searching requires read access
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    // Load all requested account entities in a single query
    const rv = new RunView();
    const quotedIDs = input.AccountIDs.map((id) => `'${id}'`).join(', ');
    const accountResult = await rv.RunView<MJFileStorageAccountEntity>(
      {
        EntityName: 'MJ: File Storage Accounts',
        ExtraFilter: `ID IN (${quotedIDs})`,
        ResultType: 'entity_object',
      },
      user,
    );

    if (!accountResult.Success) {
      throw new Error(`Failed to load storage accounts: ${accountResult.ErrorMessage}`);
    }

    const accountEntities = accountResult.Results;
    if (accountEntities.length === 0) {
      throw new Error('No valid storage accounts found for the provided IDs');
    }

    // Log any accounts that weren't found
    if (accountEntities.length < input.AccountIDs.length) {
      const foundIDs = new Set(accountEntities.map((a) => a.ID));
      const missingIDs = input.AccountIDs.filter((id) => !foundIDs.has(id));
      console.warn(`[FileResolver] Accounts not found: ${missingIDs.join(', ')}`);
    }

    // Load providers for all accounts
    const providerIDs = [...new Set(accountEntities.map((a) => a.ProviderID))];
    const quotedProviderIDs = providerIDs.map((id) => `'${id}'`).join(', ');
    const providerResult = await rv.RunView<MJFileStorageProviderEntity>(
      {
        EntityName: 'MJ: File Storage Providers',
        ExtraFilter: `ID IN (${quotedProviderIDs})`,
        ResultType: 'entity_object',
      },
      user,
    );

    if (!providerResult.Success) {
      throw new Error(`Failed to load storage providers: ${providerResult.ErrorMessage}`);
    }

    const providerMap = new Map<string, MJFileStorageProviderEntity>();
    for (const provider of providerResult.Results) {
      providerMap.set(provider.ID, provider);
    }

    // Build account/provider pairs for the search
    const accountInputs: AccountSearchInput[] = [];
    for (const account of accountEntities) {
      const provider = providerMap.get(account.ProviderID);
      if (provider) {
        accountInputs.push({ accountEntity: account, providerEntity: provider });
      }
    }

    // Execute the search across all accounts with account-based credentials
    const result = await searchAcrossAccounts(accountInputs, input.Query, {
      maxResultsPerAccount: input.MaxResultsPerAccount,
      fileTypes: input.FileTypes,
      searchContent: input.SearchContent,
      contextUser: user,
    });

    console.log('[FileResolver] SearchAcrossAccounts result:', {
      totalResultsReturned: result.totalResultsReturned,
      successfulAccounts: result.successfulAccounts,
      failedAccounts: result.failedAccounts,
    });

    // Convert results to GraphQL payload format
    const accountResults: AccountSearchResultPayload[] = result.accountResults.map((ar: AccountSearchResult) => ({
      accountID: ar.accountID,
      accountName: ar.accountName,
      success: ar.success,
      errorMessage: ar.errorMessage,
      results: ar.results.map((r: FileSearchResult) => ({
        path: r.path,
        name: r.name,
        size: r.size,
        contentType: r.contentType,
        lastModified: r.lastModified.toISOString(),
        relevance: r.relevance,
        excerpt: r.excerpt,
        matchInFilename: r.matchInFilename,
        objectId: r.objectId,
      })),
      totalMatches: ar.totalMatches,
      hasMore: ar.hasMore,
      nextPageToken: ar.nextPageToken,
    }));

    return {
      accountResults,
      totalResultsReturned: result.totalResultsReturned,
      successfulAccounts: result.successfulAccounts,
      failedAccounts: result.failedAccounts,
    };
  }
}
