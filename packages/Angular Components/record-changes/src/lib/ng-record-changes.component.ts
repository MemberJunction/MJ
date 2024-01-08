import { Component, EventEmitter, Input, OnInit, Output, Renderer2, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { SortDescriptor } from '@progress/kendo-data-query';
import { BaseEntity, EntityFieldInfo, EntityFieldTSType, LogError, RunView } from '@memberjunction/core';

@Component({
  selector: 'mj-record-changes',
  templateUrl: './ng-record-changes.component.html',
  styleUrls: ['./ng-record-changes.component.css']
})
export class RecordChangesComponent implements OnInit, AfterViewInit, OnDestroy {
  public showloader: boolean = false;
  @Output() dialogClosed = new EventEmitter();
  @Input() record!: BaseEntity;

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
      title: 'Date',
      type: 'datetime',
      width: 175,
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

  FormatColumnValue(col: any, value: any, dataItem: any, maxLength: number = 0, trailingChars: string = "...") {
    if (value === null)
      return null;

    try {
      switch (col.type.toLowerCase()) {
        case 'datetime':
          let utcDate = new Date(value); // UTC date
          // Calculate the local timezone offset and adjust the date
          const localDate = new Date(utcDate.getTime() - utcDate.getTimezoneOffset() * 60000);

          return new Intl.DateTimeFormat('en-US',  {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
          }).format(localDate);
        case 'int':
          return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
        
        case 'description':
          // while the database stores a description, it is easier to use the ChangesJSON field to get the structured data and then generate our HTML
          const json = JSON.parse(dataItem.ChangesJSON);
          if(!json)
            return value;
          else {
            const fields = Object.keys(json); // each field that was changed is a key in the JSON object
            let formattedDescription = '<div>';
    
            for(let i = 0; i < fields.length; i++){
              const changeInfo: {field: string, oldValue: any, newValue: any} = json[fields[i]];
              const field = this.record.EntityInfo.Fields.find((f: any) => f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase());
              let innerDescription: string = "";
              if (field) {
                // we have field metadata, so we can use that 
                if (field.TSType === EntityFieldTSType.Boolean) {
                  // for boolean fields, it is cleaner to just show new value, no need to show old value as it is always the opposite
                  innerDescription = `${this.fieldMarkup(field.DisplayNameOrName)} set to ${this.valueMarkup(changeInfo,false)}`;                  
                }
                else {
                  innerDescription = `${this.fieldMarkup(field.DisplayNameOrName)} changed from ${this.valueMarkup(changeInfo,true)} to ${this.valueMarkup(changeInfo,false)}`;
                }
              }
              else {
                // we don't have field metadata - this could happen if a field was removed or renamed after a record change was recorded in the database, so just use what we have
                innerDescription = `${this.fieldMarkup(changeInfo.field)} changed from ${this.valueMarkup(changeInfo,true)}} to ${this.valueMarkup(changeInfo,false)}`;
              }

              formattedDescription += `<div>${innerDescription}</div>`;
            }
          
            formattedDescription += '</div>';
            return this.sanitizer.bypassSecurityTrustHtml(formattedDescription);
          }
        default:
          return value;
        }
    }
    catch (e) {
      LogError(e);
      return value;
    }
  }
  protected fieldMarkup(fieldName: string): string {
    return `<b>${fieldName}</b>`
  }
  protected valueMarkup(changeInfo: {field: string, oldValue: any, newValue: any}, isOldValue: boolean): string {
    return `<span style="color: ${isOldValue ? 'darkgray' : 'blue'};">${isOldValue ? changeInfo.oldValue : changeInfo.newValue}</span>`;
  }
}
