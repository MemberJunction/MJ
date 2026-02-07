import { AfterViewInit, Component, ElementRef, Input, ViewChild, ChangeDetectorRef } from "@angular/core";
import { BaseRecordComponent } from "./base-record-component";
import { BaseEntity, CompositeKey, EntityFieldInfo, EntityInfo, Metadata, RunView } from "@memberjunction/core";
import { debounceTime, fromEvent } from 'rxjs';
import { SharedService, NavigationService } from "@memberjunction/ng-shared";

/**
 * This component is used to automatically generate a UI for any field in a given BaseEntity object. The CodeGen tool will generate forms and form sections that
 * use this component. This component automatically determines the type of the field and generates the appropriate UI element for it. It is possible to use other
 * elements to render a field as desired in a custom form, think of this component as a nice "base" component you can use for many cases, and you can create custom
 * components for field rendering/editing when needed.
 */
@Component({
  standalone: false,
    selector: 'mj-link-field',
    styleUrl: './link-field.component.css',
    templateUrl: './link-field.component.html'
})
export class MJLinkField extends BaseRecordComponent implements AfterViewInit {
    constructor(private cdr: ChangeDetectorRef, private navigationService: NavigationService) {
        super();
    }
    /**
     * The record object that contains the field to be rendered. This object should be an instance of BaseEntity or a derived class.
     */
    @Input() record!: BaseEntity;

    /**
     * The name of the field in the entity to be rendered.
     */
    @Input() FieldName: string = '';

    /**
     * For users of this component, if you already know the name of the record we are linking to, provide it here to reduce DB overhead
     */
    @Input() RecordName?: string = '';

    /**
     * The type of component to show, search is a user input field that searches for records, dropdown is a dropdown list of records. The default is 'search'. If the related entity has
     * a small list of possible records, it is often desirable to show a dropdown list instead of a search box.
     */
    @Input() LinkComponentType?: 'Search' | 'Dropdown' = 'Search';

    public RelatedEntityInfo: EntityInfo | undefined = undefined;

    private _SelectedRecord: BaseEntity | undefined = undefined;
    public get SelectedRecord(): BaseEntity | undefined {
        return this._SelectedRecord;
    }
    public set SelectedRecord(val: BaseEntity | undefined) {
        this._SelectedRecord = val;
        if (val) {
            this.Value = val.FirstPrimaryKey.Value;
        }
        else
            this.Value = null;
    }
    public RecordLinked: boolean = false;
    public RelatedEntityRecords: BaseEntity[] = [];
    public showMatchingRecords: boolean = false;
    public dropDownColumns: EntityFieldInfo[] = [];

    @ViewChild('inputBox', { static: false }) inputBox!: ElementRef;

    private async initComponent() {
        if (!this.record)
            throw new Error('record property is required');
        if (!this.FieldName)
            throw new Error('FieldName property is required');

        const relatedEntityID = this.EntityField?.RelatedEntityID
        const md = new Metadata();
        if (relatedEntityID) {
            this.RelatedEntityInfo = md.EntityByID(relatedEntityID); 
            this.cdr.detectChanges();
        }

        if (this.LinkComponentType === 'Search') {
            await this.AttemptToLinkValue();

            if (this.inputBox) {
                fromEvent(this.inputBox.nativeElement, 'input')
                    .pipe(debounceTime(300))
                    .subscribe(() => {
                        if (!this.RecordLinked) {
                            this.showMatchingRecords = true;
                            this.fetchMatchingRecords(this.inputBox.nativeElement.value);
                        }
                    });
        
                fromEvent<KeyboardEvent>(this.inputBox.nativeElement, 'keydown').subscribe((event: KeyboardEvent) => {
                    if (this.RecordLinked && !['Backspace', 'Delete'].includes(event.key)) {
                        event.preventDefault();
                    } else if (['Backspace', 'Delete'].includes(event.key)) {
                        this.RecordName = '';
                        this.Value = null;
                        this.RecordLinked = false;
                    }
                });    
            }
        }
        else {
            await this.populateDropdownList()
        }
    }

    async ngAfterViewInit() {
        await this.initComponent();
    }

    private _cache_userCanCreateNewLinkedRecord: boolean | null = null;
    public get UserCanCreateNewLinkedRecord(): boolean {
        if (this._cache_userCanCreateNewLinkedRecord === null) {
            const md = new Metadata();
            if (this.RelatedEntityInfo) {
                const perms = this.RelatedEntityInfo.GetUserPermisions(md.CurrentUser);
                this._cache_userCanCreateNewLinkedRecord = perms.CanCreate;
            }
            else {
                // we can't do anything yet as we don't have the related entity info, so just return false
                // do not cache this as we want to check again when we have the related entity info
                return false;
            }
        }
        return this._cache_userCanCreateNewLinkedRecord;
    }

    public onNewClicked() {
        // user wants to create a new record, double check to make sure we can create a record
        if (this.UserCanCreateNewLinkedRecord && this.RelatedEntityInfo) {
            // Use NavigationService to open a new record form
            this.navigationService.OpenNewEntityRecord(this.RelatedEntityInfo.Name);
        }
        else {
            // user can't create a new record, so let's tell them
            // they shouldn't actually ever get here as we don't show the New button if they can't create a new record but
            // this is an extra safeguard.
            SharedService.Instance.CreateSimpleNotification(`You do not have permission to create a new ${this.RelatedEntityInfo?.Name} record`, 'info', 2500);
        }
    }

    protected async AttemptToLinkValue() {
        const relatedEntityID = this.EntityField?.RelatedEntityID
        const md = new Metadata();
        this.RecordLinked = false;
        if (relatedEntityID) {
            this.RelatedEntityInfo = md.EntityByID(relatedEntityID); 
            if (!this.RecordName) {
                if (this.Value) {
                    // at present only support single valued FOREIGN KEYs, will need to upgrade this soon
                    const pk = new CompositeKey([{FieldName: this.RelatedEntityInfo.FirstPrimaryKey.Name, Value: this.Value}])
                    this.RecordName = await md.GetEntityRecordName(this.RelatedEntityInfo.Name, pk);
                    if (!this.RecordName) 
                        this.RecordName = this.Value;

                    this.RecordLinked = true;
                }
            }
        }
    }

    public get Value(): any {
        return this.record.Get(this.FieldName);
    }

    public set Value(val: any) {
        this.record.Set(this.FieldName, val);
        if (this.LinkComponentType === 'Search') {
            this.AttemptToLinkValue();
        }
        else {
            this.SetDropdownValue();
        }
    }

    public get EntityField(): EntityFieldInfo | undefined {
        return this.record.Fields.find(f => f.Name === this.FieldName)?.EntityFieldInfo;
    }
    public get DisplayName(): string {
        const ef = this.EntityField;
        if (ef)
            return ef.DisplayNameOrName;
        else
            return this.FieldName;
    }


    public onClearClicked() {
        this.RecordName = '';
        this.RecordLinked = false;
        this.Value = null;
        this.showMatchingRecords = false;
    }

    public RelatedEntityNameField: string = '';
    protected async fetchMatchingRecords(query: string) {
        this.RecordLinked = false;
        this.RelatedEntityRecords = [];
        if (this.RelatedEntityInfo) {
            this.RelatedEntityNameField = this.RelatedEntityInfo.NameField ? this.RelatedEntityInfo.NameField.Name : '';
            const escapedQuery = query.replace(/'/g, "''");
            let filter = '';

            if (!this.RelatedEntityInfo.FirstPrimaryKey.NeedsQuotes) {
                // the pkey is a number, so let's see if the query is a number
                if (isNaN(Number(query)) && this.RelatedEntityNameField === '') {
                    // if the query is not a number (for number pkeys) and we don't have a name field to search on, then we can't search
                    return;
                }
                else {
                    // if we get here it means we either have a RelatedEntityNameField to search on or the query is a number
                    if (!isNaN(Number(query))) {
                        // if the query is a number, then we can search on the pkey
                        filter = `[${this.RelatedEntityInfo.FirstPrimaryKey.Name}] = ${query}`;    
                    }
                }
            }
            else if (this.RelatedEntityInfo.FirstPrimaryKey.Type.trim().toLowerCase() !== 'uniqueidentifier') {
                // the pkey is a string that is NOT a unique identifier, so we can search on it no matter what the query is, a number, not a number, whatever
                filter = `[${this.RelatedEntityInfo.FirstPrimaryKey.Name}] = '${escapedQuery}'`;
            }
            else {
                // we can't search on the pkey unless the escapedQuery is a valid GUID, so check that and if so, search on the pkey
                if (escapedQuery.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
                    filter = `[${this.RelatedEntityInfo.FirstPrimaryKey.Name}] = '${escapedQuery}'`;
                }
            }
            
            if (this.RelatedEntityNameField) {
                filter = `[${this.RelatedEntityNameField}] LIKE '${escapedQuery}%'${filter.length > 0 ? ' OR ' + filter : ''}`;
            }
            if (filter && filter.length > 0) {
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: this.RelatedEntityInfo.Name,
                    ExtraFilter: filter,
                    OrderBy: this.RelatedEntityNameField,
                    ResultType: 'entity_object',
                    MaxRows: 5
                })
                if (result && result.Results?.length > 0) {
                    this.RelatedEntityRecords = result.Results;
                }    
            }
            else {
                this.RelatedEntityRecords = [<BaseEntity><any>{Name: "Can't search on " + this.RelatedEntityInfo.Name + ' records'}]; // this will have the effect of a single record in the list that says "Can't search on..."
            }
        }
    }

    public GetRecordDisplayString(record: any) {
        if (!record) 
            return '';
        if (record.Get !== undefined) {
            // we have a base entity
            return this.RelatedEntityNameField ? record.Get(this.RelatedEntityNameField) : (record.FirstPrimaryKey ? record.FirstPrimaryKey.Value?.toString() : 'Unable to retrieve Primary Key Value.');
        }
        else {
            // we have a plain object because we couldn't find any records
            return record.Name;
        }
    }

    protected async populateDropdownList() {
        if (this.RelatedEntityInfo) {
            this.dropDownColumns = this.RelatedEntityInfo.Fields.filter(f => f.DefaultInView || f.IsPrimaryKey || f.IsNameField);
            this.cdr.detectChanges();

            // run a view to get the records
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: this.RelatedEntityInfo.Name,
                ExtraFilter: '',
                OrderBy: this.RelatedEntityNameField,
                ResultType: 'entity_object',
            });
            if (result && result.Success) {
                this.RelatedEntityRecords = result.Results;

                // look for a match between the records we have, finding a match between our this.Value and the pkey of the record
                const match = this.RelatedEntityRecords.find(r => r.FirstPrimaryKey.Value === this.Value);
                if (match) {
                    this.SelectedRecord = match;
                    this.SetDropdownValue();
                }
                
                this.cdr.detectChanges();
            }
        }
    }

    protected async SetDropdownValue() {

    }

    public onRecordSelected(linkedRecord: BaseEntity) {
        if (linkedRecord.EntityInfo) {
            this.SelectedRecord = linkedRecord;

            this.RecordName = this.RelatedEntityNameField ? linkedRecord.Get(this.RelatedEntityNameField) : linkedRecord.PrimaryKey.ToString();
            this.RecordLinked = true;
            this.showMatchingRecords = false;
            this.record.Set(this.FieldName, linkedRecord.FirstPrimaryKey.Value);    
        }
        else {
            // this means that we really don't have a selected record and we were just showing the "Can't search on..." record
            this.showMatchingRecords = false;
            this.RecordLinked = false;
            this.RecordName = '';
        }
        this.cdr.detectChanges();
    }
}