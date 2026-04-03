import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';

import { RunView } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { SharedService } from '@memberjunction/ng-shared';
import {
  ColDef,
  GridReadyEvent,
  GridApi,
  ModuleRegistry,
  AllCommunityModule,
  themeAlpine,
  colorSchemeVariable,
  type Theme,
  ICellRendererParams
} from 'ag-grid-community';
import { z } from 'zod';
import { FileUploadEvent } from '../file-upload/file-upload';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

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
  query FileDownloadUrl($FileID: String!) {
    MJFile(ID: $FileID) {
      ContentType
      DownloadUrl
    }
  }
`;

const FileDownloadQuerySchema = z.object({
  MJFile: z.object({
    ContentType: z.string().optional(),
    DownloadUrl: z.string(),
  }),
});

@Component({
  standalone: false,
  selector: 'mj-files-grid',
  templateUrl: './files-grid.html',
  styleUrls: ['./files-grid.css'],
})
export class FilesGridComponent implements OnInit, OnChanges {
  public files: MJFileEntity[] = [];
  public isLoading: boolean = false;
  public editFile: MJFileEntity | undefined;

  // AG Grid configuration
  public GridTheme: Theme = themeAlpine.withPart(colorSchemeVariable);
  public ColumnDefs: ColDef[] = [];
  public DefaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: false,
  };
  private gridApi: GridApi | null = null;

  constructor(private sharedService: SharedService) {
    this.ColumnDefs = this.buildColumnDefs();
  }

  @Input() CategoryID: string | undefined = undefined;

  ngOnInit(): void {
    this.Refresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['CategoryID']) {
      this.Refresh();
    }
  }

  public OnGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }

  /**
   * Resets the edited file.
   *
   * This method reverts any changes made to the edited file by calling the Revert method of the MJFileEntity class. It then sets the editFile property to undefined, indicating that there is no longer an edited file.
   *
   * @returns void
   */
  public resetEditFile() {
    this.editFile?.Revert();
    this.editFile = undefined;
  }

  /**
   * Saves the edited file.
   *
   * This method saves the changes made to the edited file. It first checks if there is an edited file available. If so, it sets the isLoading property to true to indicate that the save operation is in progress. Then, it calls the Save method of the edited file to save the changes. If the save operation is successful, it creates a success notification using the sharedService.CreateSimpleNotification method. The notification message includes the ID and name of the saved file. Finally, it sets the edited file to undefined and sets the isLoading property to false to indicate that the save operation is complete.
   *
   * @returns Promise<void> - A promise that resolves when the save operation is complete.
   * @throws Error - If there is an error during the save operation.
   */
  public async saveEditFile() {
    if (this.editFile) {
      this.isLoading = true;
      //
      const success = await this.editFile.Save();
      if (success) {
        this.sharedService.CreateSimpleNotification(`Successfully saved file ${this.editFile.ID} ${this.editFile.Name}`, 'success');
        this.editFile = undefined;
        // Refresh the grid to show the updated data
        if (this.gridApi) {
          this.gridApi.setGridOption('rowData', this.files);
        }
      } else {
        this.sharedService.CreateSimpleNotification(`Unable to save file ${this.editFile.ID} ${this.editFile.Name}`, 'error');
      }
      this.isLoading = false;
    }
  }

  /**
   * Downloads a file using the provided MJFileEntity.
   *
   * @param file - The MJFileEntity representing the file to be downloaded.
   * @returns Promise<void> - A promise that resolves when the file download is complete.
   * @throws Error - If there is an error during the file download process.
   */
  public downloadFile = async (file: MJFileEntity) => {
    this.isLoading = true;
    const result = await GraphQLDataProvider.ExecuteGQL(FileDownloadQuery, {
      FileID: file.ID,
    });
    const parsedResult = FileDownloadQuerySchema.safeParse(result);

    if (parsedResult.success) {
      const downloadUrl = parsedResult.data.MJFile.DownloadUrl;
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

  /**
   * Determines whether a file can be deleted based on its status and creation time.
   *
   * @param file - The MJFileEntity representing the file to be checked.
   * @returns boolean - True if the file can be deleted, false otherwise.
   */
  public canBeDeleted(file: MJFileEntity): boolean {
    const status = file.Status;
    const deletable = status === 'Uploaded' || Date.now() - +file.__mj_CreatedAt > 10 * 60 * 60;
    return deletable;
  }

  /**
   * Deletes a file using the provided MJFileEntity.
   *
   * @param file - The MJFileEntity representing the file to be deleted.
   * @returns Promise<void> - A promise that resolves when the file deletion is complete.
   * @throws Error - If there is an error during the file deletion process.
   */
  public deleteFile = async (file: MJFileEntity) => {
    this.isLoading = true;
    const ID = file.ID;
    const Name = file.Name;
    const deleteResult = await file.Delete();
    if (deleteResult) {
      this.sharedService.CreateSimpleNotification(`Successfully deleted file ${ID} ${Name}`, 'info');
      this.files = this.files.filter((f) => typeof f.ID === 'string' && f.ID !== ID);
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
    this.files = [...this.files]; // trigger AG Grid row data change
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
      EntityName: 'MJ: Files',
      ResultType: 'entity_object',
      ...(this.CategoryID !== undefined && { ExtraFilter: `CategoryID='${this.CategoryID}'` }),
    });
    if (result.Success) {
      this.files = <MJFileEntity[]>result.Results ?? [];
    } else {
      throw new Error('Error loading files: ' + result.ErrorMessage);
    }
    this.isLoading = false;
  }

  /**
   * Builds AG Grid column definitions from the entity fields.
   */
  private buildColumnDefs(): ColDef[] {
    return [
      { field: 'ID', headerName: 'ID' },
      { field: 'Category', headerName: 'Category' },
      { field: 'Name', headerName: 'Name' },
      { field: 'Description', headerName: 'Description' },
      { field: 'Status', headerName: 'Status' },
      {
        headerName: 'Actions',
        sortable: false,
        resizable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams) => {
          const container = document.createElement('div');
          container.className = 'action-buttons';

          const downloadBtn = this.createActionButton('fa-download', params.data?.Status !== 'Uploaded');
          downloadBtn.addEventListener('click', () => this.downloadFile(params.data));

          const deleteBtn = this.createActionButton('fa-trash-can', !this.canBeDeleted(params.data));
          deleteBtn.addEventListener('click', () => this.deleteFile(params.data));

          const editBtn = this.createActionButton('fa-pen-to-square', params.data?.Status !== 'Uploaded');
          editBtn.addEventListener('click', () => { this.editFile = params.data; });

          container.appendChild(downloadBtn);
          container.appendChild(deleteBtn);
          container.appendChild(editBtn);

          return container;
        }
      }
    ];
  }

  /**
   * Creates a small action button element for the AG Grid cell renderer.
   */
  private createActionButton(iconClass: string, disabled: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'mj-btn mj-btn-flat mj-btn-sm grid-action-btn';
    btn.disabled = disabled;
    const icon = document.createElement('span');
    icon.className = `fa-solid ${iconClass}`;
    btn.appendChild(icon);
    return btn;
  }
}
