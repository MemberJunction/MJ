import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, Renderer2, ChangeDetectorRef } from '@angular/core';
import { BaseEntity, EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';
import { BaseRecordComponent } from './base-record-component';
import { MarkdownComponent } from 'ngx-markdown';


/**
 * This component is used to automatically generate a UI for any field in a given BaseEntity object. The CodeGen tool will generate forms and form sections that
 * use this component. This component automatically determines the type of the field and generates the appropriate UI element for it. It is possible to use other
 * elements to render a field as desired in a custom form, think of this component as a nice "base" component you can use for many cases, and you can create custom
 * components for field rendering/editing when needed.
 */
@Component({
    selector: 'mj-form-field',
    styleUrl: './base-field-component.css',
    templateUrl: './base-field-component.html'
})
export class MJFormField extends BaseRecordComponent implements AfterViewInit {
    /**
     * The record object that contains the field to be rendered. This object should be an instance of BaseEntity or a derived class.
     */
    @Input() record!: BaseEntity;
    /**
     * EditMode must be bound to the containing form's edit mode/state. When the form is in edit mode, the field will be rendered as an editable control (if not a read only field), otherwise the field will be rendered read-only.
     */
    @Input() EditMode: boolean = false;
    /**
     * The name of the field in the entity to be rendered.
     */
    @Input() FieldName: string = '';
    /**
     * The type of control to be rendered for the field. The default is 'textbox'. Other possible values are 'textarea', 'numerictextbox', 'datepicker', 'checkbox', 'dropdownlist', 'combobox'.
     */
    @Input() Type: 'textbox' | 'textarea' | 'numerictextbox' | 'datepicker' | 'checkbox' | 'dropdownlist' | 'combobox' = 'textbox';
    /**
     * Optional, the type of link field that should be shown. Email and URL fields will be rendered as hyperlinks, Record fields will be rendered as links to the record. The default is 'None'. Record Fields are only
     * valid when the FieldName field is a foreign key field to another entity.
     */
    @Input() LinkType: 'Email' | 'URL' | 'Record' | 'None' = 'None';

    /**
     * If set to false, the label for the field will not be shown. The default is true.
     */
    @Input() ShowLabel: boolean = true;
    
    private _displayName: string | null = null;
    /**
     * Display Name to show on the the control. By default, this is derived from the DisplayName in the entity field metadata, and can be overridden if desired by setting this property manually. Leave it empty to use the default.
     */
    @Input() 
    public get DisplayName(): string {
        if (!this._displayName) {
            const ef = this.record.Fields.find(f => f.Name == this.FieldName)?.EntityFieldInfo;
            if (ef)
                this._displayName = ef.DisplayNameOrName;
            else
                this._displayName = this.FieldName;
        }
        return this._displayName;
    }
    // use the custom value
    public set DisplayName(newValue: string) {
        this._displayName = newValue;
    }

    public get ExtendedType(): string {
        return this.record.GetFieldByName(this.FieldName)?.EntityFieldInfo.ExtendedType
    }

    private _possibleValues: string[] | null = null;
    /**
     * The possible values for the field. This is only used when the field is a dropdownlist or combobox. The possible values are derived from the EntityFieldValues in the entity field metadata. 
     * If the field is not a dropdownlist or combobox, this property is ignored. If you would like to specify a custom list of values, you can set this property manually.
     */
    @Input() get PossibleValues(): string[] {
        if (!this._possibleValues) {
            const ef = this.record.Fields.find(f => f.Name == this.FieldName)?.EntityFieldInfo;
            if (ef && ef.ValueListType !== 'None')
                this._possibleValues = ef.EntityFieldValues.map(v => v.Value);
            else
                this._possibleValues = [];
        }
        return this._possibleValues;
    }
    // use the custom value if provided
    set PossibleValues(newValue: string[]) {
        this._possibleValues = newValue;
    }

    @Input()
    public get Value(): any {
        const v = this.record.Get(this.FieldName);
        const f = this.record.Fields.find(f => f.Name == this.FieldName);
        if (v === null || v === undefined) {
            // check to see if this is a text type of field
            if (f?.EntityFieldInfo.TSType === EntityFieldTSType.String)
                return '';
        }

        // get here, return the value as it is
        return v;
    }
    public set Value(newValue: any) {
        if (!this.IsFieldReadOnly) {
            this.record.Set(this.FieldName, newValue);
            this.ValueChange.emit(newValue);    
        }
        // ignore this if it is read only
    }
    @Output() ValueChange = new EventEmitter<any>();

    /**
     * Returns true if the field is read only. This is determined by the ReadOnly property in the entity field metadata.
     */
    public get IsFieldReadOnly(): boolean {
        const f = this.record.Fields.find(f => f.Name == this.FieldName);
        if (f)
            return f.ReadOnly;
        else
            throw new Error(`Field ${this.FieldName} not found in record ${this.record.EntityInfo.Name}`);
    }

    public get FieldInfo(): EntityFieldInfo {
        const f = this.record.Fields.find(f => f.Name == this.FieldName);
        if (f)
            return f.EntityFieldInfo;
        else
            throw new Error(`Field ${this.FieldName} not found in record ${this.record.EntityInfo.Name}`);
    }


    @ViewChild('markdown', { static: false }) markdown: MarkdownComponent | undefined;
    private observer: MutationObserver | undefined;

    constructor(private renderer: Renderer2, private cdr: ChangeDetectorRef) {
        super();
    }

    ngAfterViewInit(): void {
      if (this.markdown) {
        // Create a MutationObserver to watch for changes in the markdown component
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              // Get the first child element inside the markdown component
              const el = this.markdown?.element.nativeElement.firstChild as HTMLElement;
              if (el) {
                // Apply styles using Renderer2
                this.renderer.setStyle(el, 'margin-top', '0');
                this.renderer.setStyle(el, 'margin-bottom', '0');
                // only apply font size if the element is a paragraph
                if (el.tagName === 'P')
                    this.renderer.setStyle(el, 'font-size', '14px');
              }
            }
          });
        });
  
        // Start observing the markdown component for child node additions
        observer.observe(this.markdown.element.nativeElement, { childList: true });
      }
    }

    // private tryApplyObserver(): void {
    //     if (this.FieldInfo.Length === -1) {
    //         // only do this for markdown fields (large fields)
    //         if (this.markdown && !this.observer) {
    //             this.applyObserver();
    //         } 
    //         else if (!this.markdown) {
    //             setTimeout(() => {
    //                 this.cdr.detectChanges();
    //                 this.tryApplyObserver();
    //             }, 2000); // Retry after 50ms
    //         }      
    //     }
    //   }
    
    //   private applyObserver(): void {
    //     if (this.markdown) {
    //       // Create a MutationObserver to watch for changes in the markdown component
    //       this.observer = new MutationObserver((mutations) => {
    //         mutations.forEach((mutation) => {
    //           if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
    //             // Get the first child element inside the markdown component
    //             const el = this.markdown?.element.nativeElement.firstChild as HTMLElement;
    //             if (el) {
    //               // Apply styles using Renderer2
    //               this.renderer.setStyle(el, 'margin-top', '0');
    //               this.renderer.setStyle(el, 'margin-bottom', '0');
    //                 if (el.tagName === 'P')
    //                     this.renderer.setStyle(el, 'font-size', '14px');

    //             }
    //           }
    //         });
    //       });
    
    //       // Start observing the markdown component for child node additions
    //       this.observer.observe(this.markdown.element.nativeElement, { childList: true });
    //     }
    //   }

    // ngAfterViewInit(): void {
    //     this.tryApplyObserver();
    // }

    // ngAfterViewChecked(): void {
    //     this.tryApplyObserver();
    // }
}
