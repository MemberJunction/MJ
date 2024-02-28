import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { RunViewParams } from "@memberjunction/core";
import { GridRowClickedEvent, GridRowEditedEvent, UserViewGridComponent } from "./ng-user-view-grid.component";
import { SharedService } from "@memberjunction/ng-shared";

@Component({
    selector: 'mj-user-view-grid-with-analysis',
    template: `
<kendo-tabstrip [keepTabContent]="true" [animate] = "false" mjFillContainer [bottomMargin]="BottomMargin" (tabSelect)="selectTabHandler() ">        
    <kendo-tabstrip-tab [selected]="true">
        <ng-template kendoTabTitle>Data</ng-template>
        <ng-template kendoTabContent>
            <mj-user-view-grid [Params]="Params" [InEditMode]="InEditMode" [EditMode]="EditMode" [AutoNavigate]="AutoNavigate" 
                                (rowClicked)="this.rowClicked.emit($event)" (rowEdited)="this.rowEdited.emit($event)" ></mj-user-view-grid>
        </ng-template>            
    </kendo-tabstrip-tab>
    <kendo-tabstrip-tab>
        <ng-template kendoTabTitle>Analysis</ng-template>
        <ng-template kendoTabContent>
            <mj-skip-chat mjFillContainer [AllowNewConversations]="false" [ShowConversationList]="false" [UpdateAppRoute]="false" 
                                            [LinkedEntity]="'User Views'" [LinkedEntityRecordID]="ViewID">
            </mj-skip-chat>
        </ng-template>
    </kendo-tabstrip-tab>
</kendo-tabstrip>
    `,
    styleUrls: ['./ng-user-view-grid.component.css']
  })
  export class UserViewGridWithAnalysisComponent implements AfterViewInit {
    @Input() Params: RunViewParams | undefined;
    @Input() InEditMode: boolean = false;
    @Input() EditMode: "None" | "Save" | "Queue" = "None"
    @Input() AutoNavigate: boolean = true;
  
    @Input() BottomMargin: number = 0;

    @Output() rowClicked = new EventEmitter<GridRowClickedEvent>();
    @Output() rowEdited = new EventEmitter<GridRowEditedEvent>();

    @ViewChild(UserViewGridComponent, {static: false}) viewGrid!: UserViewGridComponent;
  
    public get ViewID(): number {
        if (this.Params && this.Params.ViewID)
          return this.Params.ViewID;
        else
            return 0;
    }    
    public selectTabHandler() {
        SharedService.Instance.InvokeManualResize(100); // resize when the tab is clicked
    }    

    ngAfterViewInit(): void {
        if (this._pendingRefresh && this.Params) {
            this._pendingRefresh = false;
            this.Refresh(this.Params);
        }   
    }

    public _pendingRefresh = false;
    async Refresh(params: RunViewParams) {
        this.Params = params;
        if (this.viewGrid) 
            this.viewGrid.Refresh(params);
        else
            this._pendingRefresh = true;
    }    
  }