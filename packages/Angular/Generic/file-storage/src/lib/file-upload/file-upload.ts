import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { FileEntity, FileSchema, FileStorageProviderEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';

import { FileInfo, SelectEvent } from '@progress/kendo-angular-upload';
import { z } from 'zod';

export type FileUploadEvent = { success: true; file: FileEntity } | { success: false; file: FileInfo };

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
  mutation CreateMJFile($input: CreateMJFileInput!) {
    CreateMJFile(input: $input) {
      NameExists
      UploadUrl
      File {
        ...FileFields
      }
    }
  }
`;

const FileUploadMutationSchema = z.object({
  CreateMJFile: z.object({
    NameExists: z.boolean(),
    UploadUrl: z.string(),
    File: FileSchema.omit({ __mj_CreatedAt: true, __mj_UpdatedAt: true }).passthrough(),
  }),
});

type ApiFile = z.infer<typeof FileUploadMutationSchema>['CreateMJFile']['File'];
type UploadTuple = [FileInfo, ApiFile, string];

@Component({
  standalone: false,
  selector: 'mj-files-file-upload',
  templateUrl: './file-upload.html',
  styleUrls: ['./file-upload.css'],
})
export class FileUploadComponent implements OnInit {
  public ConfirmQueue: Array<UploadTuple> = [];
  public UploadQueue: Array<FileInfo> = [];
  private defaultProviderID = '';
  private md = new Metadata();

  get IsUploading(): boolean {
    return this.UploadQueue.length + this.ConfirmQueue.length > 0;
  }

  constructor() {}

  @Input() disabled = false;
  @Input() CategoryID: string | undefined = undefined;
  @Output() uploadStarted = new EventEmitter<void>();
  @Output() fileUpload = new EventEmitter<FileUploadEvent>();

  ngOnInit(): void {
    this.Refresh();
  }

  async Refresh() {
    const rv = new RunView();
    const viewResults = await rv.RunView({ EntityName: 'File Storage Providers', ExtraFilter: 'IsActive = 1', OrderBy: 'Priority DESC' });
    const provider: FileStorageProviderEntity | undefined = viewResults.Results[0];
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

      const fileEntity: FileEntity = await this.md.GetEntityObject('Files');
      await fileEntity.LoadFromData(fileRecord);
      await fileEntity.Delete();

      this.fileUpload.emit({ success: false, file });
    }
  }

  async SelectEventHandler(e: SelectEvent) {
    e.preventDefault();
    this.uploadStarted.emit();

    this.UploadQueue = e.files;
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
        const { File, UploadUrl, NameExists } = parsedResult.data.CreateMJFile;
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

  private async _uploadFile(file: FileInfo, fileRecord: ApiFile, uploadUrl: string) {
    try {
      // now upload to the url
      await window.fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob' },
        body: file.rawFile,
      });

      // now update that file to set status
      const fileEntity: FileEntity = await this.md.GetEntityObject('Files');
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
