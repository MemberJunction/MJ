import { Component, OnInit } from '@angular/core';

import { RunView } from '@memberjunction/core';
import { FileEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { SharedService, kendoSVGIcon } from '@memberjunction/ng-shared';
import { z } from 'zod';
import { FileUploadEvent } from '../file-upload/file-upload';

/**
 * Downloads a file from the provided URL.
 *
 * @param url - The URL of the file to be downloaded.
 * @param fileName - The name to be given to the downloaded file.
 * @param contentType - The content type of the file. Defaults to 'application/octet-stream'.
 * @returns Promise<void> - A promise that resolves when the file download is complete.
 */
const downloadFromUrl = async (url: string, fileName: string, contentType?: string | null) => {

  // First, fetch the data and create a blob with the correct content type
  const response = await fetch(url);
  if (!response.ok) {
    return false;
  }
  const rawBlob = await response.blob();
  const blob = new Blob([rawBlob], { type: contentType || 'application/octet-stream' });

  // Then add a temporary link to the document and click it
  const link = document.createElement('a');
  const blobUrl = window.URL.createObjectURL(blob);
  link.href = blobUrl;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);

  return true;
};

const FileDownloadQuery = gql`
  query FileDownloadUrl($FileID: Int!) {
    File(ID: $FileID) {
      ContentType
      DownloadUrl
    }
  }
`;

const FileDownloadQuerySchema = z.object({
  File: z.object({
    ContentType: z.string().optional(),
    DownloadUrl: z.string(),
  }),
});

@Component({
  selector: 'mj-files-grid',
  templateUrl: './files-grid.html',
  styleUrls: ['./files-grid.css'],
})
export class FilesGridComponent implements OnInit {
  public files: FileEntity[] = [];
  public isLoading: boolean = false;
  public editFile: FileEntity | undefined;
  public kendoSVGIcon = kendoSVGIcon;

  constructor(private sharedService: SharedService) {}

  ngOnInit(): void {
    this.Refresh();
  }

  public resetEditFile() {
    this.editFile?.Revert();
    this.editFile = undefined;
  }

  public async saveEditFile() {
    if (this.editFile) {
      this.isLoading = true;
      //
      const success = await this.editFile.Save();
      if (success) {
        this.sharedService.CreateSimpleNotification(`Successfully saved file ${this.editFile.ID} ${this.editFile.Name}`, 'success');
        this.editFile = undefined;
      } else {
        this.sharedService.CreateSimpleNotification(`Unable to save file ${this.editFile.ID} ${this.editFile.Name}`, 'error');
      }
      this.isLoading = false;
    }
  }

  /**
   * Downloads a file using the provided FileEntity.
   *
   * @param file - The FileEntity representing the file to be downloaded.
   * @returns Promise<void> - A promise that resolves when the file download is complete.
   * @throws Error - If there is an error during the file download process.
   */
  public downloadFile = async (file: FileEntity) => {
    this.isLoading = true;
    const result = await GraphQLDataProvider.ExecuteGQL(FileDownloadQuery, {
      FileID: file.ID,
    });
    const parsedResult = FileDownloadQuerySchema.safeParse(result);

    if (parsedResult.success) {
      const downloadUrl = parsedResult.data.File.DownloadUrl;
      const success = downloadFromUrl(downloadUrl, file.Name, file.ContentType);
      if (!success) {
        this.sharedService.CreateSimpleNotification(`Unable to download file ${file.ID} ${file.Name}`, 'error');
      }
    } else {
      console.error(parsedResult.error);
      this.sharedService.CreateSimpleNotification(`Unable to download file ${file.ID} ${file.Name}`, 'error');
    }
    this.isLoading = false;
  };

  public canBeDeleted(file: FileEntity): boolean {
    const status = file.Status;
    const deletable = status === 'Uploaded' || Date.now() - +file.CreatedAt > 10 * 60 * 60;
    // console.log({ status, deletable, ID: file.ID, CreatedAt: file.CreatedAt });
    return deletable;
  }

  /**
   * Deletes a file using the provided FileEntity.
   *
   * @param file - The FileEntity representing the file to be deleted.
   * @returns Promise<void> - A promise that resolves when the file deletion is complete.
   * @throws Error - If there is an error during the file deletion process.
   */
  public deleteFile = async (file: FileEntity) => {
    this.isLoading = true;
    const ID = file.ID;
    const Name = file.Name;
    let deleteResult = await file.Delete();
    if (deleteResult) {
      this.sharedService.CreateSimpleNotification(`Successfully deleted file ${ID} ${Name}`, 'info');
      this.files = this.files.filter((f) => f.ID != ID);
    } else {
      this.sharedService.CreateSimpleNotification(`Unable to delete file ${ID} ${Name}`, 'error');
    }
    this.isLoading = false;
  };

  /**
   * Handles the file upload event, sending a notification in case of failure and otherwise adding
   * the newly uploaded files to the files currently displayed.
   *
   * @param e - The file upload event.
   */
  public handleFileUpload(e: FileUploadEvent) {
    if (!e.success) {
      this.sharedService.CreateSimpleNotification(`Unable to upload file '${e.file.name}'`, 'error');
      return;
    }

    this.files.push(e.file);
    this.isLoading = false;
  }

  /**
   * Refreshes the data by running a view and loading the files.
   * @returns {Promise<void>} - A promise that resolves when the data is refreshed.
   */
  async Refresh() {
    this.isLoading = true;

    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Files',
      // TODO: Apply the category filter here
      // ExtraFilter: `LEFT(Status, 1)<>'D'`, //'CategoryID=' + e.ID,
      ResultType: 'entity_object',
    });
    if (result.Success) {
      this.files = <FileEntity[]>result.Results;
    } else {
      throw new Error('Error loading files: ' + result.ErrorMessage);
    }
    this.isLoading = false;
  }
}
