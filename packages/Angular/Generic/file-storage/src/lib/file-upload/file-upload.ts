import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MJFileEntity, MJFileSchema, MJFileStorageProviderEntity, FileStorageEngineBase } from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { z } from 'zod';

/**
 * Minimal file info interface replacing Kendo's FileInfo.
 */
export interface FileSelectInfo {
  name: string;
  size: number;
  rawFile: File;
}

export type FileUploadEvent = { success: true; file: MJFileEntity } | { success: false; file: FileSelectInfo };

const FileFieldsFragment = gql`
  fragment FileFields on MJFile_ {
    Category
    CategoryID
    ContentType
    _mj__CreatedAt
    Description
    ID
    Name
    Provider
    ProviderID
    ProviderKey
    Status
    _mj__UpdatedAt
  }
`;

const FileUploadMutation = gql`
  ${FileFieldsFragment}
  mutation CreateFile($input: CreateMJFileInput!) {
    CreateFile(input: $input) {
      NameExists
      UploadUrl
      File {
        ...FileFields
      }
    }
  }
`;

const FileUploadMutationSchema = z.object({
  CreateFile: z.object({
    NameExists: z.boolean(),
    UploadUrl: z.string(),
    File: MJFileSchema.omit({ __mj_CreatedAt: true, __mj_UpdatedAt: true }).passthrough(),
  }),
});

type ApiFile = z.infer<typeof FileUploadMutationSchema>['CreateFile']['File'];
type UploadTuple = [FileSelectInfo, ApiFile, string];

@Component({
  standalone: false,
  selector: 'mj-files-file-upload',
  templateUrl: './file-upload.html',
  styleUrls: ['./file-upload.css'],
})
export class FileUploadComponent extends BaseAngularComponent implements OnInit {
  public ConfirmQueue: Array<UploadTuple> = [];
  public UploadQueue: Array<FileSelectInfo> = [];
  private defaultProviderID = '';
  private get md() { return this.ProviderToUse; }

  get IsUploading(): boolean {
    return this.UploadQueue.length + this.ConfirmQueue.length > 0;
  }

  constructor() { super(); }

  @Input() disabled = false;
  @Input() CategoryID: string | undefined = undefined;
  @Output() uploadStarted = new EventEmitter<void>();
  @Output() fileUpload = new EventEmitter<FileUploadEvent>();

  ngOnInit(): void {
    this.Refresh();
  }

  async Refresh() {
    await FileStorageEngineBase.Instance.Config(false);
    const activeProviders = FileStorageEngineBase.Instance.Providers
      .filter(p => p.IsActive)
      .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
    const provider: MJFileStorageProviderEntity | undefined = activeProviders[0];
    if (typeof provider?.ID === 'string') {
      this.defaultProviderID = provider.ID;
    }
  }

  Confirm() {
    const confirmed = this.ConfirmQueue.shift();
    if (confirmed) {
      this._uploadFile(...confirmed);
    }
  }

  async CancelConfirm() {
    const cancelled = this.ConfirmQueue.shift();
    if (cancelled) {
      const [file, fileRecord] = cancelled;

      const fileEntity: MJFileEntity = await this.md.GetEntityObject('MJ: Files');
      await fileEntity.LoadFromData(fileRecord);
      await fileEntity.Delete();

      this.fileUpload.emit({ success: false, file });
    }
  }

  /**
   * Handles the native file input change event.
   */
  OnFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    this.uploadStarted.emit();

    // Convert native File objects to our FileSelectInfo format
    for (let i = 0; i < input.files.length; i++) {
      const nativeFile = input.files[i];
      const fileInfo: FileSelectInfo = {
        name: nativeFile.name,
        size: nativeFile.size,
        rawFile: nativeFile,
      };
      this.UploadQueue.push(fileInfo);
    }

    // Reset input so the same file can be selected again
    input.value = '';

    this._processUploadQueue();
  }

  private async _processUploadQueue() {
    // for each selected file to upload
    let file = this.UploadQueue.shift();
    while (file) {
      const input = {
        Name: file.name,
        ProviderID: this.defaultProviderID,
        Status: 'Pending',
        CategoryID: this.CategoryID,
      };

      // call the gql
      const result = await GraphQLDataProvider.ExecuteGQL(FileUploadMutation, { input });

      // make sure the response is correct
      const parsedResult = FileUploadMutationSchema.safeParse(result);
      if (parsedResult.success) {
        const { File, UploadUrl, NameExists } = parsedResult.data.CreateFile;
        const uploadTuple: UploadTuple = [file, File, UploadUrl];

        // Confirm we want to overwrite
        if (NameExists) {
          this.ConfirmQueue.push(uploadTuple);
        } else {
          await this._uploadFile(...uploadTuple);
        }
      } else {
        console.error('The API returned an unexpected result', parsedResult.error.issues);
        this.fileUpload.emit({ success: false, file });
      }
      file = this.UploadQueue.shift();
    }
  }

  private async _uploadFile(file: FileSelectInfo, fileRecord: ApiFile, uploadUrl: string) {
    try {
      // now upload to the url
      await window.fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob' },
        body: file.rawFile,
      });

      // now update that file to set status
      const fileEntity: MJFileEntity = await this.md.GetEntityObject('MJ: Files');
      await fileEntity.LoadFromData(fileRecord);
      fileEntity.Status = 'Uploaded';
      await fileEntity.Save();

      // emit an event about a new file uploaded, include the file data
      this.fileUpload.emit({ success: true, file: fileEntity });
      // Could also emit a progress event with each iteration
    } catch (e) {
      console.error(e);
      // something failed when actually uploading or when updating the API, what do to about pending file?
      this.fileUpload.emit({ success: false, file });
    }
  }
}
