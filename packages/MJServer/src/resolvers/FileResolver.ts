import { EntityPermissionType, FieldValueCollection, EntitySaveOptions, LogError, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { MJFileEntity, MJFileStorageProviderEntity, MJFileStorageAccountEntity } from '@memberjunction/core-entities';
import { readRealtimeRecordingFile } from '@memberjunction/ai-agents';
import {
  AppContext,
  Arg,
  Ctx,
  DeleteOptionsInput,
  Field,
  FieldResolver,
  Float,
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
  FileStorageEngine,
} from '@memberjunction/storage';
import { CreateMJFileInput, MJFileResolver as FileResolverBase, MJFile_, UpdateMJFileInput } from '../generated/generated.js';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';
import { GetReadOnlyProvider } from '../util.js';
import { configInfo } from '../config.js';
import { MediaAccessKeyManager } from '../rest/MediaAccessKeys.js';
import { deriveSidecarPath, parsePeaksSidecar } from './peaksSidecar.js';

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

/**
 * Result of {@link FileResolver.GetFileContents} — the bytes of an `MJ: Files` record returned as
 * base64, read server-side through authenticated MJStorage (never a public pre-signed link).
 */
@ObjectType()
export class FileContentsResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  Base64?: string;

  @Field(() => String, { nullable: true })
  MimeType?: string;

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;
}

/**
 * Result of {@link FileResolver.CreateMediaAccessToken} — a short-lived signed token plus the
 * authenticated streaming URL the browser hands to a `<audio>`/`<video>` element. The token is
 * minted only after a per-user permission check on the `MJ: Files` row; the `/media/:fileId`
 * route re-verifies it (signature + expiry + file match) on each Range request.
 */
@ObjectType()
export class MediaAccessTokenResult {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String, { nullable: true })
  Token?: string;

  @Field(() => String, { nullable: true })
  Url?: string;

  @Field(() => Date, { nullable: true })
  ExpiresAt?: Date;

  /**
   * The file's MIME type (from the already-loaded `MJ: Files` row). Lets the wrapper choose
   * `<audio>` vs `<video>` WITHOUT re-downloading any bytes; the stream itself sets Content-Type.
   */
  @Field(() => String, { nullable: true })
  MimeType?: string;

  /**
   * Optional precomputed waveform peaks (normalized `0..1`, one per rendered bar) read from a
   * `peaks.json` sidecar that sits beside the file in storage. When present, the player renders the
   * real waveform instantly with NO client-side fetch/decode of the audio. Best-effort: a missing or
   * malformed sidecar simply omits this field — it never blocks token minting or fails the mutation.
   */
  @Field(() => [Float], { nullable: true })
  Peaks?: number[];

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;
}

@Resolver(MJFile_)
export class FileResolver extends FileResolverBase {
  /**
   * Resolves the server's public base URL the same way callbacks/magic-link do:
   * `publicUrl` if configured (e.g. an ngrok URL), else `baseUrl:graphqlPort`. Trailing
   * slash stripped so callers can append `/media/...`.
   */
  private resolvePublicBaseUrl(): string {
    const base = configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
    return base.replace(/\/+$/, '');
  }

  /**
   * Mints a short-lived signed media-access token for an `MJ: Files` record and returns the
   * authenticated streaming URL (`<publicBase>/media/<fileId>?token=<token>`). Permission-gated
   * IDENTICALLY to {@link GetFileContents}: the file is loaded under the CALLING USER's context, so
   * MJ row-level security determines access. The returned token is the capability — the streaming
   * route re-verifies it without re-checking row-level access. Never throws to the client.
   *
   * @param fileId The `MJ: Files` id to grant streaming access to.
   * @returns `{ Success, Token?, Url?, ExpiresAt?, ErrorMessage? }`.
   */
  @Mutation(() => MediaAccessTokenResult)
  async CreateMediaAccessToken(@Arg('fileId', () => String) fileId: string, @Ctx() context: AppContext): Promise<MediaAccessTokenResult> {
    try {
      const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
      const contextUser = this.GetUserFromPayload(context.userPayload);

      // Permission gate: load the file under the USER's context. A failed load means the file
      // does not exist OR the user lacks read access under MJ row-level security.
      const fileEntity = await provider.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
      const loaded = await fileEntity.Load(fileId);
      if (!loaded) {
        return { Success: false, ErrorMessage: 'You do not have access to this file or it does not exist.' };
      }

      // Access authorized — mint the capability token.
      const { Token, ExpiresAt } = MediaAccessKeyManager.Instance.Sign(fileId, contextUser.ID);
      const url = `${this.resolvePublicBaseUrl()}/media/${encodeURIComponent(fileId)}?token=${encodeURIComponent(Token)}`;

      // Best-effort: surface precomputed waveform peaks from a peaks.json sidecar beside the file, so
      // the player renders the real waveform instantly without fetching/decoding the audio. Never
      // blocks token minting — any failure just omits Peaks.
      const peaks = await this.tryReadPeaksSidecar(fileEntity, contextUser);

      return { Success: true, Token, Url: url, ExpiresAt, MimeType: fileEntity.ContentType ?? undefined, Peaks: peaks };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`CreateMediaAccessToken failed (file ${fileId}): ${message}`);
      return { Success: false, ErrorMessage: message };
    }
  }

  /**
   * Best-effort read of a `peaks.json` waveform sidecar that sits in the SAME storage folder as the
   * given file (a JSON array of normalized `0..1` numbers, written at capture time). Derives the
   * folder from the file's `ProviderKey` (strips the final path segment), reads `<folder>/peaks.json`
   * via the file's own storage driver, parses + validates it, and returns sanitized peaks. Returns
   * `undefined` on ANY failure (no ProviderKey, no sidecar, parse error, garbage) — the caller treats
   * peaks as a pure optimization and must never let a sidecar problem affect token minting.
   *
   * @param file The already-loaded (under the user's context) `MJ: Files` row.
   * @param contextUser The calling user — used to resolve the storage driver.
   * @returns Sanitized `0..1` peaks (length-capped), or `undefined`.
   */
  private async tryReadPeaksSidecar(file: MJFileEntity, contextUser: UserInfo): Promise<number[] | undefined> {
    try {
      // The sidecar lives next to the recording: replace the final path segment with peaks.json.
      const sidecarPath = deriveSidecarPath(file.ProviderKey);
      if (!sidecarPath) {
        return undefined;
      }

      // Resolve the file's storage account → driver (mirror of readRealtimeRecordingFile's pattern).
      await FileStorageEngine.Instance.Config(false, contextUser);
      let accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
      if (accounts.length === 0) {
        await FileStorageEngine.Instance.Config(true, contextUser);
        accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
      }
      const account = accounts[0];
      if (!account) {
        return undefined;
      }
      const driver = await FileStorageEngine.Instance.GetDriver(account.ID, contextUser);
      const bytes = await driver.GetObject({ fullPath: sidecarPath });
      if (!bytes || bytes.length === 0) {
        return undefined;
      }
      return parsePeaksSidecar(bytes);
    } catch {
      // No sidecar / unreadable / parse failure — peaks are optional, never surface the error.
      return undefined;
    }
  }

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

  /**
   * Legacy file upload path — used by the `<mj-files-file-upload>` Angular component.
   * Creates a File entity record in the database AND generates a pre-authenticated upload URL.
   * The client then PUTs the file binary directly to that URL.
   *
   * Driver initialization: uses `buildUserContext()` (no storage account). The driver
   * initializes from environment variables (e.g. STORAGE_AZURE_ACCOUNT_NAME, STORAGE_DROPBOX_ACCESS_TOKEN).
   *
   * Input: `ProviderID` identifies which storage provider to use.
   * Returns: `{ File, UploadUrl, NameExists }` — the persisted File record, upload URL, and duplicate check.
   *
   * @see CreatePreAuthUploadUrl for the enterprise storage-account-based path (used by File Browser).
   */
  @Mutation(() => CreateFilePayload)
  async CreateFile(@Arg('input', () => CreateMJFileInput) input: CreateMJFileInput, @Ctx() context: AppContext, @PubSub() pubSub: PubSubEngine) {
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
    const { updatedInput, UploadUrl } = await createUploadUrl(providerEntity, fileEntity as unknown as { ID: string; Name: string; ProviderID: string; ContentType?: string; ProviderKey?: string }, userContext);

    // Save the file record with the updated input
    const mapper = new FieldMapper();
    fileEntity.SetMany(mapper.ReverseMapFields({ ...updatedInput }), true, false);
    const saved = await fileEntity.Save();
    if (!saved) {
      console.error('[CreateFile] File save failed:', fileEntity.LatestResult?.CompleteMessage);
    }
    const File = mapper.MapFields({ ...fileEntity.GetAll() });

    return { File, UploadUrl, NameExists };
  }

  @FieldResolver(() => String)
  async DownloadUrl(@Root() file: MJFile_, @Ctx() context: AppContext) {
    const md = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const user = this.GetUserFromPayload(context.userPayload);
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
    fileEntity.CheckPermissions(EntityPermissionType.Read, true);

    const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
    await providerEntity.Load(file.ProviderID);

    const userContext = this.buildUserContext(context);
    const url = await createDownloadUrl(providerEntity, file.ProviderKey ?? file.Name, userContext);

    return url;
  }

  /**
   * Returns an `MJ: Files` record's bytes as base64, read server-side through authenticated MJStorage
   * (`GetObject`) — NOT a public pre-signed link. Permission-gated: the file is first loaded under the
   * calling user's context, so MJ row-level security determines access. Never throws to the client.
   *
   * @param fileId The `MJ: Files` id whose bytes to return.
   * @returns `{ Success, Base64?, MimeType?, ErrorMessage? }`.
   */
  @Query(() => FileContentsResult)
  async GetFileContents(@Arg('fileId', () => String) fileId: string, @Ctx() context: AppContext): Promise<FileContentsResult> {
    try {
      const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
      const contextUser = this.GetUserFromPayload(context.userPayload);

      // Permission gate FIRST: load the file record under the USER's context. A failed load means the
      // file does not exist OR the user lacks read access under MJ row-level security.
      const fileEntity = await provider.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
      const loaded = await fileEntity.Load(fileId);
      if (!loaded) {
        return { Success: false, ErrorMessage: 'You do not have access to this file or it does not exist.' };
      }

      // Read the bytes via authenticated MJStorage (server-side GetObject on the file's own account).
      const result = await readRealtimeRecordingFile(fileId, contextUser, provider);
      if (!result) {
        return { Success: false, ErrorMessage: 'The file could not be read from storage.' };
      }

      return {
        Success: true,
        Base64: result.Bytes.toString('base64'),
        MimeType: result.MimeType ?? fileEntity.ContentType ?? undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`GetFileContents failed (file ${fileId}): ${message}`);
      return { Success: false, ErrorMessage: message };
    }
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

  /**
   * Enterprise file upload path — used by the File Browser UI.
   * Generates a pre-authenticated upload URL only (does NOT create a File entity record).
   * The client handles the upload directly to the storage provider via the returned URL.
   *
   * Driver initialization: uses `buildExtendedUserContext()` with a FileStorageAccount entity.
   * Credentials are loaded from the Credential Engine (encrypted in the database), with
   * automatic token refresh for OAuth providers like Dropbox and Box.com.
   *
   * Input: `AccountID` identifies which storage account (and its linked provider/credentials) to use.
   * Returns: `{ UploadUrl, ProviderKey }` — the pre-authenticated URL and optional provider key.
   *
   * @see CreateFile for the legacy path that also creates a File entity record.
   */
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

    // Initialize driver via FileStorageEngine (handles credential decryption + token refresh)
    await FileStorageEngine.Instance.Config(false, user);
    const driver = await FileStorageEngine.Instance.GetDriver(accountEntity.ID, user);

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

    // Use cached accounts from the engine — no RunView needed
    await FileStorageEngine.Instance.Config(false, user);
    const normalizedIDs = new Set(input.AccountIDs.map((id: string) => NormalizeUUID(id)));
    const accountEntities = FileStorageEngine.Instance.Accounts
      .filter(a => normalizedIDs.has(NormalizeUUID(a.ID)));

    if (accountEntities.length === 0) {
      throw new Error('No valid storage accounts found for the provided IDs');
    }

    // Log any accounts that weren't found
    if (accountEntities.length < input.AccountIDs.length) {
      const foundIDs = new Set(accountEntities.map((a) => NormalizeUUID(a.ID)));
      const missingIDs = input.AccountIDs.filter((id) => !foundIDs.has(NormalizeUUID(id)));
      console.warn(`[FileResolver] Accounts not found: ${missingIDs.join(', ')}`);
    }

    // Load providers from cached metadata
    const providerMap = new Map<string, MJFileStorageProviderEntity>();
    for (const provider of FileStorageEngine.Instance.Providers) {
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
