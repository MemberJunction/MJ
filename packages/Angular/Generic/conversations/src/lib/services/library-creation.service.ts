import { Injectable, inject } from '@angular/core';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  MJArtifactEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJCollectionEntity,
  MJEnvironmentEntityExtended,
  SlideDeckEngine,
  SpreadsheetEngine,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { DocumentImportExportService, SlideDeckExportService } from '@memberjunction/ng-artifacts';
import { CollectionPermissionService } from './collection-permission.service';
import { GraphQLAttachmentBlobStore } from './graphql-attachment-blob-store';

/**
 * First-class blank artifact starter templates surfaced in the Library Hub & Create dialog.
 */
export type LibraryStarterKind = 'document' | 'spreadsheet' | 'presentation' | 'query';

/**
 * Export formats supported when publishing a native Library artifact version directly to an external Connected Drive.
 */
export type LibraryDriveExportFormat = 'docx' | 'md' | 'xlsx' | 'csv' | 'pptx' | 'json' | 'sql' | 'txt';

export interface CreateBlankArtifactOptions {
  Kind: LibraryStarterKind;
  Title: string;
  Description?: string;
  CollectionID?: string | null;
  EnvironmentID?: string;
  CurrentUser: UserInfo;
  Provider?: IMetadataProvider;
}

export interface CreateCustomTextArtifactOptions {
  Title: string;
  Description?: string;
  Content: string;
  ArtifactTypeID: string;
  CollectionID?: string | null;
  EnvironmentID?: string;
  CurrentUser: UserInfo;
  Provider?: IMetadataProvider;
}

export interface ImportLocalFileOptions {
  File: File;
  /**
   * When `true` and the file extension is convertible (`.docx`, `.md`, `.txt`, `.xlsx`, `.csv`, `.sql`, `.json`),
   * imports the content into a collaborative `ContentMode = 'Text'` native MJ Artifact with zero `MJ: Files` row.
   * When `false` (or for binary files like `.pdf`, `.png`, `.mp4`), uploads the file into MJ Storage and creates
   * a `ContentMode = 'File'` native Library artifact.
   */
  ConvertToEditable: boolean;
  Title?: string;
  Description?: string;
  CollectionID?: string | null;
  EnvironmentID?: string;
  CurrentUser: UserInfo;
  Provider?: IMetadataProvider;
}

export interface ConvertRemoteDriveObjectOptions {
  AccountID: string;
  ObjectPath: string;
  FileName: string;
  Title?: string;
  CollectionID?: string | null;
  EnvironmentID?: string;
  CurrentUser: UserInfo;
  Provider?: IMetadataProvider;
  StorageClientOverride?: Pick<GraphQLFileStorageClient, 'CreatePreAuthDownloadUrl'>;
  FetchBytesOverride?: (url: string) => Promise<ArrayBuffer>;
}

export interface PublishToConnectedDriveOptions {
  ArtifactName: string;
  VersionContent: string;
  VersionConfiguration?: string | null;
  Format: LibraryDriveExportFormat;
  AccountID: string;
  TargetFolderPrefix?: string;
  TargetFileName?: string;
  CurrentUser: UserInfo;
  StorageClientOverride?: Pick<GraphQLFileStorageClient, 'CreatePreAuthUploadUrl'>;
  UploadBytesOverride?: (uploadUrl: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
}

export interface CreatedLibraryArtifactResult {
  Artifact: MJArtifactEntity;
  Version: MJArtifactVersionEntity;
  ArtifactType: MJArtifactTypeEntity;
  CollectionLink: MJCollectionArtifactEntity | null;
}

const CONVERTIBLE_EXTENSIONS = new Set(['docx', 'md', 'markdown', 'txt', 'xlsx', 'csv', 'sql', 'json']);

/**
 * Service encapsulating native Library artifact creation, local file upload/conversion,
 * and stateless conversions/exports between Native Library and external Connected Drives.
 *
 * Architectural invariant:
 * - External Connected Drive operations (`ConvertRemoteDriveObjectToNativeArtifact` and
 *   `PublishArtifactVersionToConnectedDrive`) NEVER create `MJ: Files` database records.
 * - `MJ: Files` is created ONLY when a user uploads a binary file directly into Native Library
 *   (`ImportLocalFileToLibrary` with `ConvertToEditable = false` or non-convertible binary).
 */
@Injectable({
  providedIn: 'root',
})
export class LibraryCreationService {
  private readonly docImportExport = inject(DocumentImportExportService);
  private readonly slideExport = inject(SlideDeckExportService);
  private readonly collectionPermissions = inject(CollectionPermissionService);

  private blobStoreOverride: GraphQLAttachmentBlobStore | null = null;

  /**
   * Optional test seam to override the attachment blob store used for binary `ContentMode = 'File'` uploads.
   */
  public SetBlobStoreOverride(store: GraphQLAttachmentBlobStore | null): void {
    this.blobStoreOverride = store;
  }

  /**
   * Returns `true` when a filename extension can be converted into an inline collaborative MJ artifact (`ContentMode = 'Text'`).
   */
  public IsConvertibleFileName(fileName: string): boolean {
    const ext = this.extractExtension(fileName);
    return CONVERTIBLE_EXTENSIONS.has(ext);
  }

  /**
   * Loads enabled `MJ: Artifact Types` via `ArtifactMetadataEngine` (falling back to `RunView` if cache is empty).
   */
  public async LoadEnabledArtifactTypes(
    user: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJArtifactTypeEntity[]> {
    const md = provider ?? Metadata.Provider;
    try {
      await ArtifactMetadataEngine.Instance.Config(false, user, md);
      const cached = ArtifactMetadataEngine.Instance.ArtifactTypes.filter((t) => t.IsEnabled !== false);
      if (cached.length > 0) {
        return cached;
      }
    } catch {
      // Fall back to direct RunView below
    }

    const rv = RunView.FromMetadataProvider(md);
    const result = await rv.RunView<MJArtifactTypeEntity>(
      {
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: 'IsEnabled=1',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      },
      user,
    );
    return result.Success && result.Results ? result.Results : [];
  }

  /**
   * Resolves the canonical `MJ: Artifact Types` record for one of the four Hub starter tiles.
   */
  public FindStarterArtifactType(
    kind: LibraryStarterKind,
    types: ReadonlyArray<MJArtifactTypeEntity>,
  ): MJArtifactTypeEntity | undefined {
    switch (kind) {
      case 'document':
        return (
          types.find((t) => t.DriverClass === 'MarkdownArtifactViewerPlugin') ??
          types.find((t) => t.Name.toLowerCase() === 'markdown document' || t.Name.toLowerCase() === 'markdown')
        );
      case 'spreadsheet':
        return (
          types.find((t) => t.DriverClass === 'SpreadsheetArtifactViewerPlugin') ??
          types.find((t) => t.Name.toLowerCase() === 'excel spreadsheet' || t.Name.toLowerCase() === 'spreadsheet')
        );
      case 'presentation':
        return (
          types.find((t) => t.DriverClass === 'SlideDeckArtifactViewerPlugin') ??
          types.find((t) => t.Name.toLowerCase() === 'presentation' || t.Name.toLowerCase() === 'slide deck')
        );
      case 'query':
        return (
          types.find((t) => t.Name.toLowerCase() === 'sql') ??
          types.find((t) => t.ContentType?.toLowerCase() === 'application/sql')
        );
      default: {
        const exhaustiveCheck: never = kind;
        return exhaustiveCheck;
      }
    }
  }

  /**
   * Generates starter `Content` for a newly created blank native artifact.
   */
  public BuildStarterContent(kind: LibraryStarterKind, title: string): string {
    const cleanTitle = title.trim() || this.defaultTitleForStarter(kind);
    switch (kind) {
      case 'document':
        return [
          `# ${cleanTitle}`,
          '',
          'Start writing here, switch to **Suggesting** mode for tracked word-level edits, or embed a live governed **MJ Entity View / Saved Query** block.',
          '',
          '## Key Notes',
          '',
          '- Collaborative real-time editing powered by Yjs CRDTs',
          '- Viewer-scoped Row-Level and Field-Level Security on live blocks',
        ].join('\n');

      case 'spreadsheet': {
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook(cleanTitle, ['Sheet 1']);
        return JSON.stringify(wb, null, 2);
      }

      case 'presentation': {
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck(
          cleanTitle,
          `deck-${Date.now().toString(36)}`,
        );
        return JSON.stringify(deck, null, 2);
      }

      case 'query':
        return [
          `-- ${cleanTitle}`,
          '-- Author your analytical SQL query below',
          'SELECT TOP 25',
          '    Name,',
          '    __mj_UpdatedAt',
          'FROM [__mj].[vwArtifacts]',
          'ORDER BY __mj_UpdatedAt DESC;',
        ].join('\n');

      default: {
        const exhaustiveCheck: never = kind;
        return exhaustiveCheck;
      }
    }
  }

  /**
   * Creates a new blank collaborative Document, Spreadsheet, Presentation, or SQL Query in Native Library.
   */
  public async CreateBlankArtifact(
    options: CreateBlankArtifactOptions,
  ): Promise<CreatedLibraryArtifactResult> {
    const md = options.Provider ?? Metadata.Provider;
    const types = await this.LoadEnabledArtifactTypes(options.CurrentUser, md);
    const matchedType = this.FindStarterArtifactType(options.Kind, types);
    if (!matchedType) {
      throw new Error(`No enabled MJ Artifact Type is registered for starter "${options.Kind}".`);
    }

    const cleanTitle = options.Title.trim() || this.defaultTitleForStarter(options.Kind);
    const content = this.BuildStarterContent(options.Kind, cleanTitle);

    return this.persistArtifactAndVersion({
      Title: cleanTitle,
      Description: options.Description?.trim() || null,
      ArtifactType: matchedType,
      ContentMode: 'Text',
      Content: content,
      FileID: null,
      MimeType: matchedType.ContentType || null,
      FileName: null,
      ContentSizeBytes: new TextEncoder().encode(content).byteLength,
      CollectionID: options.CollectionID ?? null,
      EnvironmentID: options.EnvironmentID || MJEnvironmentEntityExtended.DefaultEnvironmentID,
      CurrentUser: options.CurrentUser,
      Provider: md,
    });
  }

  /**
   * Creates a custom text artifact with an explicit `ArtifactTypeID` and raw `Content`.
   */
  public async CreateCustomTextArtifact(
    options: CreateCustomTextArtifactOptions,
  ): Promise<CreatedLibraryArtifactResult> {
    const md = options.Provider ?? Metadata.Provider;
    const types = await this.LoadEnabledArtifactTypes(options.CurrentUser, md);
    const matchedType = types.find((t) => UUIDsEqual(t.ID, options.ArtifactTypeID));
    if (!matchedType) {
      throw new Error('Selected Artifact Type was not found or is disabled.');
    }

    const cleanTitle = options.Title.trim() || 'Untitled Artifact';
    const content = options.Content;

    return this.persistArtifactAndVersion({
      Title: cleanTitle,
      Description: options.Description?.trim() || null,
      ArtifactType: matchedType,
      ContentMode: 'Text',
      Content: content,
      FileID: null,
      MimeType: matchedType.ContentType || null,
      FileName: null,
      ContentSizeBytes: new TextEncoder().encode(content).byteLength,
      CollectionID: options.CollectionID ?? null,
      EnvironmentID: options.EnvironmentID || MJEnvironmentEntityExtended.DefaultEnvironmentID,
      CurrentUser: options.CurrentUser,
      Provider: md,
    });
  }

  /**
   * Imports a local browser `File` into Native Library:
   * - When `ConvertToEditable` is `true` and the extension is convertible, converts `.docx`/`.md`/`.xlsx`/`.csv`/`.sql`/`.json`
   *   into an editable `ContentMode = 'Text'` artifact (zero `MJ: Files` row).
   * - Otherwise uploads the binary via `GraphQLAttachmentBlobStore` into MJ Storage and creates a `ContentMode = 'File'`
   *   artifact version referencing `FileID`.
   */
  public async ImportLocalFileToLibrary(
    options: ImportLocalFileOptions,
  ): Promise<CreatedLibraryArtifactResult> {
    const md = options.Provider ?? Metadata.Provider;
    const types = await this.LoadEnabledArtifactTypes(options.CurrentUser, md);
    const ext = this.extractExtension(options.File.name);
    const defaultTitle = options.Title?.trim() || this.stripExtension(options.File.name) || 'Uploaded File';

    if (options.ConvertToEditable && CONVERTIBLE_EXTENSIONS.has(ext)) {
      const buffer = await options.File.arrayBuffer();
      const converted = await this.convertBytesToNativeText(buffer, ext, defaultTitle, types);
      return this.persistArtifactAndVersion({
        Title: defaultTitle,
        Description: options.Description?.trim() || `Imported from ${options.File.name}`,
        ArtifactType: converted.ArtifactType,
        ContentMode: 'Text',
        Content: converted.Content,
        FileID: null,
        MimeType: converted.ArtifactType.ContentType || null,
        FileName: options.File.name,
        ContentSizeBytes: new TextEncoder().encode(converted.Content).byteLength,
        CollectionID: options.CollectionID ?? null,
        EnvironmentID: options.EnvironmentID || MJEnvironmentEntityExtended.DefaultEnvironmentID,
        CurrentUser: options.CurrentUser,
        Provider: md,
      });
    }

    // Binary file path: upload bytes to MJ Storage (creates governed MJ: Files record for Native Library)
    const buffer = await options.File.arrayBuffer();
    const base64Data = this.arrayBufferToBase64(buffer);
    const mimeType = options.File.type || this.inferMimeFromExtension(ext);
    const store = this.blobStoreOverride ?? new GraphQLAttachmentBlobStore();
    const uploadResult = await store.Upload(
      {
        FileName: options.File.name,
        Base64Data: base64Data,
        MimeType: mimeType,
      },
      options.CurrentUser,
      md,
    );

    if (!uploadResult.Success || !uploadResult.FileID) {
      throw new Error(uploadResult.Error || `Failed to upload "${options.File.name}" to MJ Storage.`);
    }

    const fileType = this.resolveBinaryArtifactType(mimeType, ext, types);
    if (!fileType) {
      throw new Error(`No Artifact Type is available for MIME type "${mimeType}".`);
    }

    return this.persistArtifactAndVersion({
      Title: defaultTitle,
      Description: options.Description?.trim() || null,
      ArtifactType: fileType,
      ContentMode: 'File',
      Content: null,
      FileID: uploadResult.FileID,
      MimeType: mimeType,
      FileName: options.File.name,
      ContentSizeBytes: options.File.size,
      CollectionID: options.CollectionID ?? null,
      EnvironmentID: options.EnvironmentID || MJEnvironmentEntityExtended.DefaultEnvironmentID,
      CurrentUser: options.CurrentUser,
      Provider: md,
    });
  }

  /**
   * Streams an external Connected Drive file via a short-lived pre-authenticated URL and converts it
   * in memory into a collaborative `ContentMode = 'Text'` native MJ Artifact.
   *
   * **Zero `MJ: Files` database records are created.**
   */
  public async ConvertRemoteDriveObjectToNativeArtifact(
    options: ConvertRemoteDriveObjectOptions,
  ): Promise<CreatedLibraryArtifactResult> {
    const md = options.Provider ?? Metadata.Provider;
    const ext = this.extractExtension(options.FileName);
    if (!CONVERTIBLE_EXTENSIONS.has(ext)) {
      throw new Error(
        `"${options.FileName}" cannot be converted to an editable native document or spreadsheet. Use Preview or Download instead.`,
      );
    }

    const storageClient =
      options.StorageClientOverride ?? new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
    const downloadUrl = await storageClient.CreatePreAuthDownloadUrl(options.AccountID, options.ObjectPath);

    const fetchBytes =
      options.FetchBytesOverride ??
      (async (url: string): Promise<ArrayBuffer> => {
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`Failed to read remote file (${resp.status} ${resp.statusText}).`);
        }
        return resp.arrayBuffer();
      });

    const buffer = await fetchBytes(downloadUrl);
    const types = await this.LoadEnabledArtifactTypes(options.CurrentUser, md);
    const cleanTitle = options.Title?.trim() || this.stripExtension(options.FileName) || 'Imported Copy';
    const converted = await this.convertBytesToNativeText(buffer, ext, cleanTitle, types);

    return this.persistArtifactAndVersion({
      Title: cleanTitle,
      Description: `Editable copy imported from Connected Drive (${options.ObjectPath})`,
      ArtifactType: converted.ArtifactType,
      ContentMode: 'Text',
      Content: converted.Content,
      FileID: null,
      MimeType: converted.ArtifactType.ContentType || null,
      FileName: options.FileName,
      ContentSizeBytes: new TextEncoder().encode(converted.Content).byteLength,
      CollectionID: options.CollectionID ?? null,
      EnvironmentID: options.EnvironmentID || MJEnvironmentEntityExtended.DefaultEnvironmentID,
      CurrentUser: options.CurrentUser,
      Provider: md,
    });
  }

  /**
   * Exports a native MJ Artifact version into `.docx`, `.md`, `.xlsx`, `.csv`, `.pptx`, `.json`, `.sql`, or `.txt`
   * bytes in memory and uploads it directly to an external Connected Drive path via `CreatePreAuthUploadUrl`.
   *
   * **Zero `MJ: Files` database records are created.**
   */
  public async PublishArtifactVersionToConnectedDrive(
    options: PublishToConnectedDriveOptions,
  ): Promise<{ ObjectPath: string; ByteLength: number; MimeType: string }> {
    const { bytes, mimeType, extension } = await this.serializeExportPayload(
      options.ArtifactName,
      options.VersionContent,
      options.VersionConfiguration ?? null,
      options.Format,
      options.CurrentUser,
    );

    const baseFileName = (options.TargetFileName?.trim() || this.sanitizeFileName(options.ArtifactName)).replace(
      new RegExp(`\\.${extension}$`, 'i'),
      '',
    );
    const finalFileName = `${baseFileName}.${extension}`;
    const cleanPrefix = (options.TargetFolderPrefix ?? '').replace(/^\/+|\/+$/g, '');
    const objectPath = cleanPrefix ? `${cleanPrefix}/${finalFileName}` : finalFileName;

    const storageClient =
      options.StorageClientOverride ?? new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
    const uploadTarget = await storageClient.CreatePreAuthUploadUrl(options.AccountID, objectPath, mimeType);
    if (!uploadTarget.success || !uploadTarget.uploadUrl) {
      throw new Error('Storage provider did not return a pre-authenticated upload URL for this Connected Drive.');
    }

    const uploadFn =
      options.UploadBytesOverride ??
      (async (url: string, payload: Uint8Array, contentType: string): Promise<void> => {
        const bodyBuffer = payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength,
        ) as ArrayBuffer;
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: bodyBuffer,
        });
        if (!response.ok) {
          throw new Error(`Connected Drive upload failed (${response.status} ${response.statusText}).`);
        }
      });

    await uploadFn(uploadTarget.uploadUrl, bytes, mimeType);
    return {
      ObjectPath: objectPath,
      ByteLength: bytes.byteLength,
      MimeType: mimeType,
    };
  }

  /**
   * Returns recommended Connected Drive export formats for a given `DriverClass` or `ArtifactType` name.
   */
  public GetSupportedDriveExportFormats(
    driverClass?: string | null,
    typeName?: string | null,
  ): Array<{ Format: LibraryDriveExportFormat; Label: string }> {
    const dc = (driverClass ?? '').trim();
    const tn = (typeName ?? '').trim().toLowerCase();
    if (dc === 'MarkdownArtifactViewerPlugin' || tn.includes('markdown')) {
      return [
        { Format: 'docx', Label: 'Microsoft Word (.docx)' },
        { Format: 'md', Label: 'Markdown (.md)' },
      ];
    }
    if (dc === 'SpreadsheetArtifactViewerPlugin' || tn.includes('spreadsheet') || tn === 'csv') {
      return [
        { Format: 'xlsx', Label: 'Microsoft Excel (.xlsx)' },
        { Format: 'csv', Label: 'CSV (.csv)' },
      ];
    }
    if (dc === 'SlideDeckArtifactViewerPlugin' || tn.includes('presentation')) {
      return [
        { Format: 'pptx', Label: 'Microsoft PowerPoint (.pptx)' },
        { Format: 'json', Label: 'SlideDeck JSON (.json)' },
      ];
    }
    if (tn === 'sql') {
      return [{ Format: 'sql', Label: 'SQL Script (.sql)' }];
    }
    if (dc === 'JsonArtifactViewerPlugin' || dc === 'ComponentArtifactViewerPlugin' || tn.includes('json')) {
      return [{ Format: 'json', Label: 'JSON (.json)' }];
    }
    return [{ Format: 'txt', Label: 'Plain Text (.txt)' }];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async persistArtifactAndVersion(params: {
    Title: string;
    Description: string | null;
    ArtifactType: MJArtifactTypeEntity;
    ContentMode: MJArtifactVersionEntity['ContentMode'];
    Content: string | null;
    FileID: string | null;
    MimeType: string | null;
    FileName: string | null;
    ContentSizeBytes: number | null;
    CollectionID: string | null;
    EnvironmentID: string;
    CurrentUser: UserInfo;
    Provider: IMetadataProvider;
  }): Promise<CreatedLibraryArtifactResult> {
    const { Provider: md, CurrentUser: user } = params;

    if (params.CollectionID) {
      await this.assertCanWriteCollection(params.CollectionID, user, md);
    }

    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user);
    artifact.Name = params.Title;
    artifact.Description = params.Description;
    artifact.TypeID = params.ArtifactType.ID;
    artifact.EnvironmentID = params.EnvironmentID;
    artifact.UserID = user.ID;

    const artifactSaved = await artifact.Save();
    if (!artifactSaved) {
      throw new Error(artifact.LatestResult?.Message || 'Failed to save MJ: Artifacts record.');
    }

    const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', user);
    version.ArtifactID = artifact.ID;
    version.VersionNumber = 1;
    version.Name = params.Title;
    version.Description = params.Description;
    version.UserID = user.ID;
    version.ContentMode = params.ContentMode;
    version.Content = params.Content;
    version.FileID = params.FileID;
    version.MimeType = params.MimeType;
    version.FileName = params.FileName;
    version.ContentSizeBytes = params.ContentSizeBytes;

    const versionSaved = await version.Save();
    if (!versionSaved) {
      await artifact.Delete();
      throw new Error(version.LatestResult?.Message || 'Failed to save MJ: Artifact Versions record.');
    }

    let collectionLink: MJCollectionArtifactEntity | null = null;
    if (params.CollectionID) {
      const link = await md.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', user);
      link.CollectionID = params.CollectionID;
      link.ArtifactVersionID = version.ID;
      const linkSaved = await link.Save();
      if (!linkSaved) {
        await version.Delete();
        await artifact.Delete();
        throw new Error(link.LatestResult?.Message || 'Failed to link artifact into the target Collection.');
      }
      collectionLink = link;
    }

    return {
      Artifact: artifact,
      Version: version,
      ArtifactType: params.ArtifactType,
      CollectionLink: collectionLink,
    };
  }

  private async assertCanWriteCollection(
    collectionId: string,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<void> {
    const collection = await provider.GetEntityObject<MJCollectionEntity>('MJ: Collections', user);
    const loaded = await collection.Load(collectionId);
    if (!loaded) {
      throw new Error('Target collection was not found.');
    }
    if (collection.OwnerID && !UUIDsEqual(collection.OwnerID, user.ID)) {
      this.collectionPermissions.Provider = provider;
      const perm = await this.collectionPermissions.CheckPermission(collectionId, user.ID, user);
      if (!perm?.canEdit) {
        throw new Error('You do not have Edit permission to add items to this collection.');
      }
    }
  }

  private async convertBytesToNativeText(
    buffer: ArrayBuffer,
    extension: string,
    title: string,
    types: ReadonlyArray<MJArtifactTypeEntity>,
  ): Promise<{ Content: string; ArtifactType: MJArtifactTypeEntity }> {
    const decoder = new TextDecoder('utf-8');
    switch (extension) {
      case 'docx': {
        const mdContent = await this.docImportExport.ConvertDocxBytesToMarkdown(buffer);
        const docType = this.FindStarterArtifactType('document', types);
        if (!docType) {
          throw new Error('Markdown Document artifact type is not available.');
        }
        return { Content: mdContent || `# ${title}\n`, ArtifactType: docType };
      }
      case 'md':
      case 'markdown':
      case 'txt': {
        const text = await this.docImportExport.ImportMarkdown(decoder.decode(buffer));
        const docType =
          this.FindStarterArtifactType('document', types) ??
          types.find((t) => t.Name.toLowerCase().includes('text'));
        if (!docType) {
          throw new Error('Document artifact type is not available.');
        }
        return { Content: text, ArtifactType: docType };
      }
      case 'xlsx': {
        const wb = SpreadsheetEngine.Instance.ImportFromXlsxBytes(buffer);
        wb.Title = title;
        const sheetType = this.FindStarterArtifactType('spreadsheet', types);
        if (!sheetType) {
          throw new Error('Spreadsheet artifact type is not available.');
        }
        return { Content: JSON.stringify(wb, null, 2), ArtifactType: sheetType };
      }
      case 'csv': {
        const csvText = decoder.decode(buffer);
        const wb = SpreadsheetEngine.Instance.ImportFromCsv(csvText, 'Sheet 1', title);
        const sheetType = this.FindStarterArtifactType('spreadsheet', types);
        if (!sheetType) {
          throw new Error('Spreadsheet artifact type is not available.');
        }
        return { Content: JSON.stringify(wb, null, 2), ArtifactType: sheetType };
      }
      case 'sql': {
        const sqlType = this.FindStarterArtifactType('query', types);
        if (!sqlType) {
          throw new Error('SQL artifact type is not available.');
        }
        return { Content: decoder.decode(buffer), ArtifactType: sqlType };
      }
      case 'json': {
        const jsonType =
          types.find((t) => t.Name.toLowerCase() === 'json') ??
          this.FindStarterArtifactType('document', types);
        if (!jsonType) {
          throw new Error('JSON artifact type is not available.');
        }
        return { Content: decoder.decode(buffer), ArtifactType: jsonType };
      }
      default:
        throw new Error(`Unsupported conversion extension ".${extension}".`);
    }
  }

  private async serializeExportPayload(
    artifactName: string,
    content: string,
    configuration: string | null,
    format: LibraryDriveExportFormat,
    user: UserInfo,
  ): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }> {
    const encoder = new TextEncoder();
    switch (format) {
      case 'docx': {
        const bytes = await this.docImportExport.ConvertMarkdownToDocxBytes(content, artifactName);
        return {
          bytes,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          extension: 'docx',
        };
      }
      case 'md':
        return {
          bytes: encoder.encode(content),
          mimeType: 'text/markdown',
          extension: 'md',
        };
      case 'xlsx': {
        const wb = SpreadsheetEngine.Instance.ParseWorkbook(content, configuration);
        const bytes = SpreadsheetEngine.Instance.ExportToXlsxBytes(wb);
        return {
          bytes,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: 'xlsx',
        };
      }
      case 'csv': {
        const wb = SpreadsheetEngine.Instance.ParseWorkbook(content, configuration);
        const csvText = SpreadsheetEngine.Instance.ExportToCsv(wb);
        return {
          bytes: encoder.encode(csvText),
          mimeType: 'text/csv',
          extension: 'csv',
        };
      }
      case 'pptx': {
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(content, artifactName);
        const pkg = this.slideExport.ExportToPptxPackage(deck, new Map(), {
          ID: user.ID,
          Name: user.Name,
        });
        return {
          bytes: pkg.Bytes,
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          extension: 'pptx',
        };
      }
      case 'json':
        return {
          bytes: encoder.encode(content),
          mimeType: 'application/json',
          extension: 'json',
        };
      case 'sql':
        return {
          bytes: encoder.encode(content),
          mimeType: 'application/sql',
          extension: 'sql',
        };
      case 'txt':
        return {
          bytes: encoder.encode(content),
          mimeType: 'text/plain',
          extension: 'txt',
        };
      default: {
        const exhaustiveCheck: never = format;
        return exhaustiveCheck;
      }
    }
  }

  private resolveBinaryArtifactType(
    mimeType: string,
    extension: string,
    types: ReadonlyArray<MJArtifactTypeEntity>,
  ): MJArtifactTypeEntity | undefined {
    const fromEngine = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(mimeType, extension);
    if (fromEngine) {
      return fromEngine;
    }
    const lowerMime = mimeType.toLowerCase();
    return (
      types.find((t) => t.ContentType?.toLowerCase() === lowerMime) ??
      types.find((t) => {
        const ct = t.ContentType?.toLowerCase() ?? '';
        return ct.endsWith('/*') && lowerMime.startsWith(ct.slice(0, -1));
      }) ??
      types.find((t) => t.Name.toLowerCase().includes('binary') || t.ContentType === 'application/octet-stream') ??
      types[0]
    );
  }

  private defaultTitleForStarter(kind: LibraryStarterKind): string {
    switch (kind) {
      case 'document':
        return 'Untitled Document';
      case 'spreadsheet':
        return 'Untitled Spreadsheet';
      case 'presentation':
        return 'Untitled Presentation';
      case 'query':
        return 'Untitled Data Query';
      default: {
        const exhaustiveCheck: never = kind;
        return exhaustiveCheck;
      }
    }
  }

  private extractExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.slice(dot + 1).trim().toLowerCase() : '';
  }

  private stripExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
  }

  private sanitizeFileName(name: string): string {
    return (
      name
        .replace(/[/\\?%*:|"<>]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim() || 'Artifact'
    );
  }

  private inferMimeFromExtension(ext: string): string {
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      case 'mp4':
        return 'video/mp4';
      case 'mp3':
        return 'audio/mpeg';
      case 'csv':
        return 'text/csv';
      case 'md':
      case 'markdown':
        return 'text/markdown';
      case 'json':
        return 'application/json';
      case 'sql':
        return 'application/sql';
      case 'txt':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      chunks.push(String.fromCharCode(...slice));
    }
    return btoa(chunks.join(''));
  }
}
