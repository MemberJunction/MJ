import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { FileEntity, FileStorageProviderEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';

import { kendoSVGIcon } from '@memberjunction/ng-shared';
import { FileInfo, SelectEvent } from '@progress/kendo-angular-upload';
import { z } from 'zod';

export type FileUploadEvent = 
  | { success: true, file: FileEntity }
  | { success: false, file: FileInfo }

const FileFieldsFragment = gql`
  fragment FileFields on File_ {
    Category
    CategoryID
    ContentType
    CreatedAt
    Description
    ID
    Name
    Provider
    ProviderID
    ProviderKey
    Status
    UpdatedAt
  }
`;

const FileUploadMutation = gql`
  ${FileFieldsFragment}
  mutation CreateFile($input: CreateFileInput!) {
    CreateFile(input: $input) {
      UploadUrl
      File {
        ...FileFields
      }
    }
  }
`;

const FileUploadMutationSchema = z.object({
  CreateFile: z.object({
    UploadUrl: z.string(),
    File: z.object({
      Category: z.string().nullish(),
      CategoryID: z.number().nullish(),
      ContentType: z.string().nullish(),
      CreatedAt: z.number(),
      Description: z.string().nullish(),
      ID: z.number(),
      Name: z.string(),
      Provider: z.string(),
      ProviderID: z.number(),
      ProviderKey: z.string().nullish(),
      Status: z.string(),
      UpdatedAt: z.number(),
    }),
  }),
});

@Component({
  selector: 'mj-files-file-upload',
  templateUrl: './file-upload.html',
  styleUrls: ['./file-upload.css'],
})
export class FileUploadComponent implements OnInit {
  public kendoSVGIcon = kendoSVGIcon;
  public isUploading = false;
  private defaultProviderID = -1;
  private md = new Metadata();

  constructor() {}

  @Input() disabled = false;
  @Output() uploadStarted = new EventEmitter<void>();
  @Output() fileUpload = new EventEmitter<FileUploadEvent>();

  ngOnInit(): void {
    this.Refresh();
  }

  async Refresh() {
    const rv = new RunView();
    const viewResults = await rv.RunView({ EntityName: 'File Storage Providers' });
    const provider: FileStorageProviderEntity | undefined = viewResults.Results[0];
    if (typeof provider?.ID === 'number') {
      this.defaultProviderID = provider.ID;
    }
  }

  async selectEventHandler(e: SelectEvent) {
    e.preventDefault();
    console.log('Files were selected', e);

    this.isUploading = true;

    // for each selected file to upload
    for (const file of e.files) {
      // call the gql
      const result = await GraphQLDataProvider.ExecuteGQL(FileUploadMutation, {
        input: {
          Name: file.name,
          ProviderID: this.defaultProviderID,
          Status: 'Pending',
          // TODO: Get this from outside this component
          // CategoryID
        },
      });

      // make sure the response is correct
      const parsedResult = FileUploadMutationSchema.safeParse(result);
      if (parsedResult.success) {
        const { File, UploadUrl } = parsedResult.data.CreateFile;
        try {
          console.log('type of ', typeof file);

          // now upload to the url
          await window.fetch(UploadUrl, {
            method: 'PUT',
            headers: { 'x-ms-blob-type': 'BlockBlob' },
            body: file.rawFile,
          });

          console.log('File uploaded', file);

          // now update that file to set status
          const fileEntity: FileEntity = await this.md.GetEntityObject('Files');
          await fileEntity.LoadFromData(File);
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
      } else {
        console.error('The API returned an unexpected result', parsedResult.error);
        this.fileUpload.emit({ success: false, file });
      }
    }
    this.isUploading = false;
  }
}
