import { Component, OnInit } from '@angular/core';

import { RunView } from '@memberjunction/core';
import { FileEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { SharedService } from '@memberjunction/ng-shared';
import { SVGIcon, downloadIcon, trashIcon } from '@progress/kendo-svg-icons';
import { z } from 'zod';

const downloadFromUrl = (url: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.id = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
};

const FileDownloadQuery = gql`
  query FileDownloadUrl($FileID: Int!) {
    File(ID: $FileID) {
      DownloadUrl
    }
  }
`;

const FileDownloadQuerySchema = z.object({
  File: z.object({
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
  public downloadIcon: SVGIcon = downloadIcon;
  public deleteIcon: SVGIcon = trashIcon;

  constructor(private sharedService: SharedService) {}

  ngOnInit(): void {
    this.Refresh();
  }

  /**
   * Downloads a file using the provided FileEntity.
   *
   * @param file - The FileEntity representing the file to be downloaded.
   * @returns Promise<void> - A promise that resolves when the file download is complete.
   * @throws Error - If there is an error during the file download process.
   */
  public downloadFile = async (file: FileEntity) => {
    const result = await GraphQLDataProvider.ExecuteGQL(FileDownloadQuery, {
      FileID: file.ID,
    });
    console.log({ result });
    const parsedResult = FileDownloadQuerySchema.safeParse(result);

    if (parsedResult.success) {
      const downloadUrl = parsedResult.data.File.DownloadUrl;
      downloadFromUrl(downloadUrl, file.Name);
    } else {
      console.error(parsedResult.error);
      this.sharedService.CreateSimpleNotification(`Unable to download file ${file.ID} ${file.Name}`, 'error');
    }
  };

  /**
   * Deletes a file using the provided FileEntity.
   *
   * @param file - The FileEntity representing the file to be deleted.
   * @returns Promise<void> - A promise that resolves when the file deletion is complete.
   * @throws Error - If there is an error during the file deletion process.
   */
  public deleteFile = async (file: FileEntity) => {
    let deleteResult = await file.Delete();
    if (deleteResult) {
      this.sharedService.CreateSimpleNotification(`Successfully deleted file ${file.ID} ${file.Name}`, 'info');
      this.files = this.files.filter((f) => f.ID != file.ID);
    } else {
      this.sharedService.CreateSimpleNotification(`Unable to delete file ${file.ID} ${file.Name}`, 'error');
    }
  };

  async Refresh() {
    this.isLoading = true;

    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Files',
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
