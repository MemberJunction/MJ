import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from "@angular/core";
import { KeyValuePair, RunViewParams } from "@memberjunction/core";
import { GridRowClickedEvent, GridRowEditedEvent, UserViewGridComponent } from "@memberjunction/ng-user-view-grid";
import { SharedService } from "@memberjunction/ng-shared";
import { MJTabStripComponent } from "@memberjunction/ng-tabstrip";

@Component({
    selector: 'mj-user-view-grid-with-analysis',
    template: `
    <mj-tabstrip mjFillContainer [bottomMargin]="BottomMargin" (TabSelectedabSelect)="selectTabHandler() ">
        <mj-tab [TabSelected]="true"> Data </mj-tab>
        <mj-tab-body>
            <mj-user-view-grid [Params]="Params" [InEditMode]="InEditMode" [EditMode]="EditMode" [AutoNavigate]="AutoNavigate" 
                                    (rowClicked)="this.rowClicked.emit($event)" (rowEdited)="this.rowEdited.emit($event)" >
            </mj-user-view-grid>
        </mj-tab-body>

        <mj-tab> Analysis </mj-tab>
        <mj-tab-body>
            <mj-skip-chat mjFillContainer [AllowNewConversations]="false" [ShowConversationList]="false" [UpdateAppRoute]="false" 
                                          [LinkedEntity]="'User Views'" [LinkedEntityPrimaryKeys]="ViewIDAsPrimaryKeyArray">
            </mj-skip-chat>
        </mj-tab-body>
    </mj-tabstrip>
    `,
    styles: []
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
    @ViewChild(MJTabStripComponent, {static: false}) tabStrip!: MJTabStripComponent;
    public get ViewID(): number {
        if (this.Params && this.Params.ViewID)
          return this.Params.ViewID;
        else
            return 0;
    }    
    /**
     * Returns the ViewID as an array of KeyValuePair
     */
    public get ViewIDAsPrimaryKeyArray(): KeyValuePair[] {
        return [{FieldName: "ID", Value: this.ViewID}];
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
        if (this.viewGrid) {
            this.tabStrip.SelectedTabIndex = 0; // go back to the first tab on refresh
            await this.viewGrid.Refresh(params);
        }
        else
            this._pendingRefresh = true;
    }    
  }