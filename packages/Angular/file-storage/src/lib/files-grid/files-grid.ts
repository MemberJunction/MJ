import { Component, OnInit } from '@angular/core';

import { RunView } from '@memberjunction/core';
import { FileEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { SVGIcon, downloadIcon, trashIcon } from '@progress/kendo-svg-icons';


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

  public downloadFile = (file: FileEntity) => {
    // get download url
    alert('download   ' + file.ID);
  };
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
