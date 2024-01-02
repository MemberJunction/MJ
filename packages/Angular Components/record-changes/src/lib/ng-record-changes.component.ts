import { Component, EventEmitter, Input, OnInit, Output, Renderer2, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { SortDescriptor } from '@progress/kendo-data-query';
import { LogError, RunView } from '@memberjunction/core';

@Component({
  selector: 'mj-record-changes',
  templateUrl: './ng-record-changes.component.html',
  styleUrls: ['./ng-record-changes.component.css']
})
export class RecordChangesComponent implements OnInit, AfterViewInit, OnDestroy {
  public showloader: boolean = false;
  @Output() dialogClosed = new EventEmitter();
  @Input() record: any = {};

  @ViewChild('recordChangesWrapper', { static: true }) wrapper!: ElementRef;


  viewData: any = [];
  visibleColumns: any = [];
  sortSettings: SortDescriptor[] = [
    {
      field: "ChangedAt",
      dir: "desc",
    },
  ];


  constructor(private sanitizer: DomSanitizer, private renderer: Renderer2) { }

  ngOnInit(): void {
    if(this.record){
      this.showloader = true;
      this.LoadRecordChanges(this.record.ID, '', this.record.EntityInfo.Name);
      this.prepareColumns();
    }
  }

  ngAfterViewInit(): void {
    // Move the wrapper to the body when the component is initialized
    if (this.renderer && this.wrapper && this.wrapper.nativeElement)
      this.renderer.appendChild(document.body, this.wrapper.nativeElement);
  }

  ngOnDestroy(): void {
    // Remove the wrapper from the body when the component is destroyed
    if (this.renderer && this.wrapper && this.wrapper.nativeElement)
      this.renderer.removeChild(document.body, this.wrapper.nativeElement);
  }

  async LoadRecordChanges(recordId: number, appName: string, entityName: string) {
    // Perform any necessary actions with the ViewID, such as fetching data
    if (recordId && entityName) {
      const rv = new RunView();
      const response = await rv.RunView({ EntityName: "Record Changes", ExtraFilter: `Entity='${entityName}' AND RecordID=${recordId}`});
      if(response.Success){
        this.viewData = response.Results;
        this.showloader = false;
      } else {
        LogError(response.ErrorMessage);
        this.showloader = false;
      }
    }
  }

  prepareColumns(){
    this.visibleColumns = [{
      field: 'ChangedAt',
      title: 'Changed At (UTC)',
      type: 'datetime',
      width: 110,
    },
    {
      field: 'ChangesDescription',
      title: 'Changes',
      type: 'description',
    }];
  }

  closePropertiesDialog(){
    this.dialogClosed.emit();
  }

  FormatColumnValue(col: any, value: any, maxLength: number = 0, trailingChars: string = "...") {
    if (value === null)
      return null;

    try {
      switch (col.type.toLowerCase()) {
        case 'datetime':
          let date = new Date(value);
          return new Intl.DateTimeFormat('en-US',  {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true,
          }).format(date);
        case 'int':
          return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
        
        case 'description':
          const regex = /([^ ]+) changed from ([^]+?) to ([^]+?)(?=\n|$)/g;
          let formattedDescription = '<ul>';
                
          let match;
          while ((match = regex.exec(value)) !== null) {
            const fieldName = match[1];
            const oldValue = match[2];
            const newValue = match[3];
            const formattedFieldChange = `<li>${fieldName} changed from <span style="color: darkgray;">${oldValue}</span> to <span style="color: blue;">${newValue}</span></li>`;
            formattedDescription += formattedFieldChange;
          }
        
          formattedDescription += '</ul>';
          return this.sanitizer.bypassSecurityTrustHtml(formattedDescription);
        default:
          return value;
        }
    }
    catch (e) {
      LogError(e);
      return value;
    }
  }
}
