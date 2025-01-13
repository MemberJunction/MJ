import { Component, OnInit, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import { AuthService } from '@auth0/auth0-angular';
import { SharedService } from '../services/shared-service';
import { BaseEntity, IRunViewProvider, RunView } from '@memberjunction/core';
import { ReportCategoryEntity, ReportEntity } from '@memberjunction/core-entities';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Observable } from "rxjs";
@Component({
  selector: 'app-report-list',
  templateUrl: './report-list.component.html',
  styleUrl: './report-list.component.css'
})
export class ReportListComponent implements OnInit   {
  constructor(public auth: AuthService, private router: Router, private sharedService: SharedService, private route: ActivatedRoute, private location: Location) {}

  public loaded: boolean = false;

  private allFolders: ReportCategoryEntity[] = [];
  private allReports: ReportEntity[] = [];

  public reports: ReportEntity[] = [];
  public folders: ReportCategoryEntity[] = [];
  public currentFolder: ReportCategoryEntity;
  public breadcrumb: ReportCategoryEntity[] = []; // Breadcrumb navigation


  // Dialog-related properties
  public isCreateFolderDialogOpen = false;
  public newFolderName = '';

  public async ngOnInit() {
    this.sharedService.appInitialized$.subscribe(async (loaded: boolean) => {
      if (loaded) { 
        this.route.params.subscribe(async params => {
          const folderId = params['folderId'];
          await this.Refresh(true, folderId);      
        });
      }
    });
  }

  public async Refresh(refreshFromDatabase: boolean = true, folderId: string = null) {
    if (refreshFromDatabase) {
      const p = this.sharedService.InstanceProvider;
      const rv = new RunView(<IRunViewProvider><any>p);
      const result = await rv.RunView<ReportEntity>({
        EntityName: "Reports",
        ExtraFilter: "UserID='" + p.CurrentUser.ID + "'",
        OrderBy: "Name",
        ResultType: "entity_object"
      }, p.CurrentUser);
      this.allReports = result.Results;  

      const folderResult = await rv.RunView<ReportCategoryEntity>({
        EntityName: "Report Categories",
        ExtraFilter: `UserID='${p.CurrentUser.ID}'`,
        OrderBy: "Name",
        ResultType: "entity_object"
      }, p.CurrentUser);
      this.allFolders = folderResult.Results;
    }

    if (folderId) {
      // generally this only comes the first time someone calls this to set the initial folder BEFORE the data is loaded.
      this.currentFolder = this.allFolders.find(f => f.ID === folderId) || null;
    }

    this.reports = this.allReports.filter(report => report.CategoryID === (this.currentFolder ? this.currentFolder.ID : null));
    this.folders = this.allFolders.filter(folder => folder.ParentID === (this.currentFolder ? this.currentFolder.ID : null));

    this.UpdateFolderURL(this.currentFolder);

    this.UpdateBreadcrumb();
    this.loaded = true;
  }

  private UpdateBreadcrumb() {
    this.breadcrumb = [];
    let folder = this.currentFolder;
    while (folder) {
      this.breadcrumb.unshift(folder);
      folder = this.allFolders.find(f => f.ID === folder.ParentID) || null;
    }
    this.breadcrumb.unshift(null);
  }

  public NavigateToBreadcrumb(folder: ReportCategoryEntity) {
    this.currentFolder = folder;
    this.Refresh(false);
  }  

  public NavigateToFolder(folder: ReportCategoryEntity, updateUrl: boolean = true) {
    this.currentFolder = folder;
    this.Refresh(false);
  }

  public UpdateFolderURL(folder: ReportCategoryEntity) {
    if (folder)
      this.location.go(`/report-list/${folder ? folder.ID : ''}`);  
    else
      this.location.go(`/report-list`);
  }

  public NavigateUp() {
    if (this.currentFolder) {
      const parentId = this.currentFolder.ParentID;
      this.currentFolder = this.allFolders.find(folder => folder.ID === parentId) || null;
      this.Refresh(false);
    }
  }

  // Dialog functions
  public OpenCreateFolderDialog() {
    this.isCreateFolderDialogOpen = true;
  }

  public CloseCreateFolderDialog() {
    this.isCreateFolderDialogOpen = false;
    this.newFolderName = '';
  }

  public OpenReport(report: ReportEntity) {
    // use the router to navigate to the report
    this.router.navigate(['/report', report.ID]); 
  }

  public async CreateFolder() {
    if (this.newFolderName.trim()) {
      const p = this.sharedService.InstanceProvider;
      const newFolder = await p.GetEntityObject<ReportCategoryEntity>("Report Categories", p.CurrentUser);
      newFolder.Name = this.newFolderName;
      newFolder.ParentID = this.currentFolder ? this.currentFolder.ID : null;
      newFolder.UserID = p.CurrentUser.ID;
      if (await newFolder.Save()) {
        this.sharedService.DisplayNotification("Folder created successfully", "success");         
        this.allFolders.push(newFolder);
        this.currentFolder = newFolder;
        this.Refresh(false);
      }
      else {
        this.sharedService.DisplayNotification("Failed to create folder", "error");
      }
    }
    this.CloseCreateFolderDialog();
  }  




  public currentAnchor: HTMLElement | null = null;
  public selectedReport: ReportEntity | null = null;
  public selectedFolder: ReportCategoryEntity | null = null;
  public renameName: string = '';

  public isDeleteConfirmOpen = false;
  public isRenameDialogOpen = false;

  public isPopupOpen = false; // Popup state


  // used to position the context menu
  public contextMenuStyle: any = {};
  public OpenPopupMenu(item: BaseEntity, event: MouseEvent) {
    event.stopPropagation();

    const mouseX = event.clientX;
    const mouseY = event.clientY;
    this.contextMenuStyle = {
      top: mouseY + 'px',
      left: mouseX + 'px'
    };

    if (item instanceof ReportEntity) {
      this.selectedReport = item;
      this.selectedFolder = null;
    }
    else if (item instanceof ReportCategoryEntity) {
      this.selectedFolder = item;
      this.selectedReport = null;
    }
    //this.currentAnchor = event.target as HTMLElement;
    this.isPopupOpen = true;
  }

  public ClosePopup() {
    this.isPopupOpen = false;
  }

  // Rename Report
  public RenameItem() {
    if (this.selectedFolder)
      this.renameName = this.selectedFolder.Name;
    else
      this.renameName = this.selectedReport.Name;

    this.ClosePopup();
    this.isRenameDialogOpen = true;
  }

  public CloseRenameDialog() {
    this.isRenameDialogOpen = false;
    this.renameName = '';
  }

  public async RenameConfirm() {
    if (!this.renameName.trim())
      return; // can't rename to empty name

    const item: BaseEntity | null = this.selectedFolder || this.selectedReport;
    if (item) {
      // Logic to rename the report
      item.Set("Name", this.renameName);
      if (await item.Save()) {
        this.sharedService.DisplayNotification("Item renamed successfully", "success");
      }
      else {
        this.sharedService.DisplayNotification("Failed to rename item", "error");
      }
      this.CloseRenameDialog();
    }
  }

  // Delete Report
  public ConfirmDelete() {
    this.ClosePopup();
    this.isDeleteConfirmOpen = true;
  }

  public CloseDeleteConfirm() {
    this.isDeleteConfirmOpen = false;
  }

  public async DeleteItem() {
    const item = this.selectedFolder || this.selectedReport;

    if (item) {
      // Logic to delete the report
      if (await item.Delete()) {
        this.sharedService.DisplayNotification("Item deleted successfully", "success");

        if (this.selectedFolder) {
          this.folders = this.folders.filter(f => f.ID !== this.selectedFolder?.ID);
          this.allFolders = this.allFolders.filter(f => f.ID !== this.selectedFolder?.ID);
        }
        else {
          this.reports = this.reports.filter(r => r.ID !== this.selectedReport?.ID);
          this.allReports = this.allReports.filter(r => r.ID !== this.selectedReport?.ID);  
        }
  
        this.selectedFolder = null;
        this.selectedReport = null;  
      }
      else {
        if (this.selectedFolder)
          this.sharedService.DisplayNotification("Failed to delete folder, this can occur if there are reports or sub-folders within the folder in question. Delete those items first to delete the folder.", "error", 2500);
        else
          this.sharedService.DisplayNotification("Failed to delete item", "error", 2500);
      }
      this.CloseDeleteConfirm();
    }
  }

  public isMoveDialogOpen = false;
  public selectedMoveFolder: any | null = null;
  public folderTreeData: any[] = []; // Transformed data for TreeView
  
  // Build hierarchical data for the TreeView
  private buildTreeData(parentId: string | null = null): any[] {
    return this.allFolders
      .filter(folder => folder.ParentID === parentId)
      .map(folder => ({
        id: folder.ID,
        text: folder.Name,
        items: this.buildTreeData(folder.ID),
      }));
  }
  public children = (dataitem: any): Observable<any[]> => of(dataitem.items);
  public hasChildren = (dataitem: any): boolean => !!dataitem.items;

  public isExpanded = (dataItem: any, index: string) => {
    return true;//this.keys.indexOf(index) > -1;
  };
  public isDisabled = (dataItem: any): boolean => {
    if (this.selectedFolder) {
      if (!dataItem.id) {
        return false; // can always move to root
      }
      else if (dataItem.id === this.selectedFolder.ID) {
        return true; // can't move a folder to itself
      }
      else if (this.selectedFolder.ParentID === this.currentFolder?.ID) {
        return true; // can't move a folder to its CURRENT parent
      }
      else {
        return false;
      }
    }
    else {
      return false;
    }
  };

  protected IsDescendant(parentId: string, folderId: string): boolean {
    // check to see if the given folderId is somewhere below parentId in a hierachy. 
    // do this recursively
    const p = this.allFolders.find(f => f.ID === parentId);
    const f = this.allFolders.find(f => f.ID === folderId);
    if (!p || !f) {
      return false;
    }
    if (f.ParentID === p.ID) {
      // folder's direct parent is the current item
      return true;
    }
    else if (f.ParentID === null) {
      // folder doesn't have a parent so it's root level
      return false;
    }
    else {
      // NOT the current item and the target folder is not root level (e.g. parent of null)
      // so we have to check to see if the parent of the target folder is a descendant of the current item
      return this.IsDescendant(parentId, f.ParentID);
    }
  }
 
  public OpenMoveDialog() {
    this.ClosePopup();
    this.folderTreeData = [
      {
        text: "Home", 
        items: this.buildTreeData(), 
        id: null
      }
    ];

    this.isMoveDialogOpen = true;
  }

  // Handle folder selection in the TreeView
  public OnTreeNodeClick(event: any) {
    this.selectedMoveFolder = event.item.dataItem;
  }


  public CloseMoveDialog() {
    this.isMoveDialogOpen = false;
    this.selectedMoveFolder = null;
  }

  public SelectFolder(folder: any) {
    this.selectedMoveFolder = folder;
  }

  public async ConfirmMove() {
    if (!this.selectedMoveFolder) {
      return;
    }

    const item = this.selectedFolder || this.selectedReport;
    if (item) {
      // Logic to move the report goes here
      if (this.selectedFolder)
        this.selectedFolder.ParentID = this.selectedMoveFolder.id;
      else
        this.selectedReport.CategoryID = this.selectedMoveFolder.id;

      if (await item.Save()) {
        this.sharedService.DisplayNotification("Item moved successfully", "success");

        // set current folder to the new parent
        this.currentFolder = this.allFolders.find(f => f.ID === this.selectedMoveFolder?.id) || null;

        this.selectedFolder = null;
        this.selectedReport = null;

        this.Refresh(false);
      }
      else {
        this.sharedService.DisplayNotification("Failed to move item", "error");
      }
      this.CloseMoveDialog();
    }
  }

  public iconClass(item: any): any {
    if (item?.id) {
      // font aweseome folder icon class
      return 'fas fa-folder';
    }
    else {
      // return home folder font awesome icon class
      return 'fas fa-home';
    }
  }

  @ViewChild('popupMenu') popup: ElementRef | undefined;
  // Detect clicks outside the popup
  @HostListener('document:click', ['$event'])
  public OnDocumentClick(event: Event) {
    if (!this.popup) {
      return;
    }
    const clickedInside = this.popup.nativeElement.contains(event.target);
    if (!clickedInside && this.isPopupOpen) {
      this.ClosePopup();
    }
  }

  // Detect Escape key press
  @HostListener('document:keydown.escape', ['$event'])
  public OnEscapePress(event: KeyboardEvent) {
    if (!this.popup) {
      return;
    }
    if (this.isPopupOpen) {
      this.ClosePopup();
    }
  }
}
