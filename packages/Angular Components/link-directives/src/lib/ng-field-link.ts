import { Directive, ElementRef, Renderer2, Input, OnInit, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseEntity, EntityField, LogStatus, Metadata } from '@memberjunction/core';
import { BaseLink } from './ng-base-link';

@Directive({
  selector: '[mjFieldLink]'
})
export class FieldLink extends BaseLink implements OnInit {

  @Input('record') record!: BaseEntity; // Input variable to get the entity record
  @Input('fieldName') fieldName!: string; // Input variable to get the fieldInfo
  @Input('replaceText') replaceText: boolean = true ; // 

  private _targetEntity: string = '';
  private _targetRecordID: number = 0;

  constructor(private el: ElementRef, private renderer: Renderer2, private route: ActivatedRoute, private router: Router) {
    super();
  }

  public get field(): EntityField {
    if (!this.record) throw new Error('entity not set');
    if (!this.fieldName) throw new Error('fieldName not set');
    const field = this.record.Fields.find(f => f.Name === this.fieldName);
    if (!field) throw new Error(`Unable to find field ${this.fieldName} in entity ${this.record.EntityInfo.Name}`);
    return field;
  }

  ngOnInit() {
    const relatedEntity = this.field.EntityFieldInfo.RelatedEntity;
    if (relatedEntity && relatedEntity.length > 0) {
      this._targetEntity = relatedEntity;
      this._targetRecordID = this.field.Value;
      this.CreateLink(this.el, this.field, this.renderer, '', false);
      
      if (this.replaceText) { 
        // replace the value of the field with the record name
        // first see if we already have the value locally using metadata for RelatedEntityNameFieldMap
        if (this.field.EntityFieldInfo.RelatedEntityNameFieldMap && 
            this.field.EntityFieldInfo.RelatedEntityNameFieldMap.length > 0) {
          const nameField = this.field.EntityFieldInfo.RelatedEntityNameFieldMap;
          const nameFieldValue = this.record.Get(nameField)
          if (nameFieldValue && nameFieldValue.length > 0)
            this.renderer.setProperty(this.el.nativeElement, 'textContent', nameFieldValue);
        }
        else {
          // no luck, no related entity name field map provided in the entity field metadata, so do a lookup
          // requires a server round trip and hitting the DB, so we try to avoid this
          const md = new Metadata();
          md.GetEntityRecordName(relatedEntity, [{FieldName: "ID", Value: this.field.Value}]).then(recordName => {
            if (recordName && recordName.length > 0)
                this.renderer.setProperty(this.el.nativeElement, 'textContent', recordName);
          });
        }
      }
    }
    else {
        LogStatus('no linked entity found for field: ' + this.field.Name);
    }
  }

  @HostListener('click', ['$event'])
  onClick(event: Event) {
    event.preventDefault();
    this.router.navigate(['resource', 'record', this._targetRecordID], { queryParams: { Entity: this._targetEntity } })
  }  

}
