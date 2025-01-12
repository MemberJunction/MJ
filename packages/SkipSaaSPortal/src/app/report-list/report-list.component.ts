import { Component, OnInit  } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { SharedService } from '../services/shared-service';
import { IRunViewProvider, RunView } from '@memberjunction/core';
import { ReportCategoryEntity, ReportEntity } from '@memberjunction/core-entities';
import { Router } from '@angular/router';

import { ActionSheetItem, ActionSheetItemClickEvent } from "@progress/kendo-angular-navigation";
@Component({
  selector: 'app-report-list',
  templateUrl: './report-list.component.html',
  styleUrl: './report-list.component.css'
})
export class ReportListComponent implements OnInit   {
  constructor(public auth: AuthService, private router: Router, private sharedService: SharedService) {}

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
    await this.Refresh();
  }

  public async Refresh() {
    const p = this.sharedService.InstanceProvider;
    const rv = new RunView(<IRunViewProvider><any>p);
    const result = await rv.RunView<ReportEntity>({
      EntityName: "Reports",
      ExtraFilter: "UserID='" + p.CurrentUser.ID + "'",
      OrderBy: "Name",
    }, p.CurrentUser);
    this.allReports = result.Results;
    this.reports = this.allReports.filter(report => report.CategoryID === (this.currentFolder ? this.currentFolder.ID : null));

    const folderResult = await rv.RunView<ReportCategoryEntity>({
      EntityName: "Report Categories",
      ExtraFilter: `UserID='${p.CurrentUser.ID}'`,
      OrderBy: "Name",
    }, p.CurrentUser);
    this.allFolders = folderResult.Results;
    this.folders = this.allFolders.filter(folder => folder.ParentID === (this.currentFolder ? this.currentFolder.ID : null));

    this.UpdateBreadcrumb();
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
    this.Refresh();
  }  

  public NavigateToFolder(folder: ReportCategoryEntity) {
    this.currentFolder = folder;
    this.Refresh();
  }

  public NavigateUp() {
    if (this.currentFolder) {
      const parentId = this.currentFolder.ParentID;
      this.currentFolder = this.allFolders.find(folder => folder.ID === parentId) || null;
      this.Refresh();
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
        this.currentFolder = newFolder;
        this.Refresh();
      }
      else {
        this.sharedService.DisplayNotification("Failed to create folder", "error");
      }
    }
    this.CloseCreateFolderDialog();
  }  




  public currentReportAnchor: HTMLElement | null = null;
  public selectedReport: ReportEntity | null = null;
  public renameReportName: string = '';

  public isDeleteConfirmOpen = false;
  public isRenameDialogOpen = false;

  public isActionSheetOpen = false;
  public actionSheetTitle = "Options";
  public actionSheetItems: ActionSheetItem[] = [
    { title: "Rename" },
    { title: "Delete" },
    { title: "Move" },
  ];  

  // Open action sheet
  public OpenReportActions(report: ReportEntity, event: MouseEvent) {
    this.selectedReport = report;
    this.currentReportAnchor = event.target as HTMLElement;
    this.isActionSheetOpen = true;
  }

  public CloseActionSheet() {
    this.isActionSheetOpen = false;
  }

  public ActionSheetOverlayClick() {
    this.isActionSheetOpen = false;
  }
  public ActionSheetItemClick(e: ActionSheetItemClickEvent) {
    switch (e.item.title.toLowerCase()) {
      case "rename":
        this.RenameReport(this.selectedReport);
        break;
      case "delete":
        this.ConfirmDeleteReport(this.selectedReport);
        break;
      case "move":
        this.MoveReport(this.selectedReport);
        break;
    }
    this.isActionSheetOpen = false;
  }
  

  // Rename Report
  public RenameReport(report: ReportEntity) {
    this.selectedReport = report;
    this.renameReportName = report.Name;
    this.CloseActionSheet();
    this.isRenameDialogOpen = true;
  }

  public CloseRenameDialog() {
    this.isRenameDialogOpen = false;
    this.renameReportName = '';
  }

  public RenameReportConfirm() {
    if (this.selectedReport && this.renameReportName.trim()) {
      // Logic to rename the report
      this.selectedReport.Name = this.renameReportName;
      this.CloseRenameDialog();
      this.Refresh();
    }
  }

  // Delete Report
  public ConfirmDeleteReport(report: ReportEntity) {
    this.selectedReport = report;
    this.CloseActionSheet();
    this.isDeleteConfirmOpen = true;
  }

  public CloseDeleteConfirm() {
    this.isDeleteConfirmOpen = false;
  }

  public DeleteReport() {
    if (this.selectedReport) {
      // Logic to delete the report
      this.reports = this.reports.filter(r => r.ID !== this.selectedReport?.ID);
      this.CloseDeleteConfirm();
      this.Refresh();
    }
  }

  // Move Report
  public MoveReport(report: ReportEntity) {
    this.selectedReport = report;
    // Logic to move the report
    this.CloseActionSheet();
    console.log('Move report:', report);
  }  
}
