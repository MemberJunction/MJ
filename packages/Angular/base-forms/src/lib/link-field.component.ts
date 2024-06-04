import { AfterViewInit, Component, ElementRef, Input, ViewChild } from "@angular/core";
import { BaseRecordComponent } from "./base-record-component";
import { BaseEntity, CompositeKey, EntityFieldInfo, EntityInfo, Metadata, RunView } from "@memberjunction/core";
import { debounceTime, fromEvent } from 'rxjs';

/**
 * This component is used to automatically generate a UI for any field in a given BaseEntity object. The CodeGen tool will generate forms and form sections that
 * use this component. This component automatically determines the type of the field and generates the appropriate UI element for it. It is possible to use other
 * elements to render a field as desired in a custom form, think of this component as a nice "base" component you can use for many cases, and you can create custom
 * components for field rendering/editing when needed.
 */
@Component({
    selector: 'mj-link-field',
    styleUrl: './link-field.component.css',
    templateUrl: './link-field.component.html'
})
export class MJLinkField extends BaseRecordComponent implements AfterViewInit {
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

    public RelatedEntityInfo: EntityInfo | undefined = undefined;
    public RecordLinked: boolean = false;
    public matchingRecords: BaseEntity[] = [];
    public showMatchingRecords: boolean = false;

    @ViewChild('inputBox', { static: true }) inputBox!: ElementRef;


    async ngAfterViewInit() {
        if (!this.record)
            throw new Error('record property is required');
        if (!this.FieldName)
            throw new Error('FieldName property is required');

        await this.AttemptToLinkValue();

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
        this.AttemptToLinkValue();
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
        this.showMatchingRecords = false;
    }

    public RelatedEntityNameField: string = '';
    protected async fetchMatchingRecords(query: string) {
        const relatedEntityID = this.EntityField?.RelatedEntityID
        const md = new Metadata();
        this.RecordLinked = false;
        this.matchingRecords = [];
        if (relatedEntityID) {
            this.RelatedEntityInfo = md.EntityByID(relatedEntityID); 
            // do a lookup using runView for records that have the Name field that start with the query
            this.RelatedEntityNameField = this.RelatedEntityInfo.NameField ? this.RelatedEntityInfo.NameField.Name : '';
            if (this.RelatedEntityNameField) {
                const filter = `[${this.RelatedEntityNameField}] LIKE '${query}%'`;
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: this.RelatedEntityInfo.Name,
                    ExtraFilter: filter,
                    OrderBy: this.RelatedEntityNameField,
                    ResultType: 'entity_object',
                    MaxRows: 5
                })
                if (result && result.Results?.length > 0) {
                    this.matchingRecords = result.Results.filter(record => record[this.RelatedEntityNameField].toLowerCase().includes(query.toLowerCase()));    
                }
            }
        }
    }

    public onRecordSelected(linkedRecord: BaseEntity) {
        this.RecordName = linkedRecord.Get(this.RelatedEntityNameField);
        this.RecordLinked = true;
        this.showMatchingRecords = false;
        this.record.Set(this.FieldName, linkedRecord.FirstPrimaryKey.Value);
    }
}