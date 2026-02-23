import { Component } from '@angular/core';
import { MJQueryFieldsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueryfields-form',
    templateUrl: './mjqueryfields.form.component.html'
})
export class MJQueryFieldsFormComponent extends BaseFormComponent {
    public record!: MJQueryFieldsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'fieldDefinitionPresentation', sectionName: 'Field Definition & Presentation', isExpanded: true },
            { sectionKey: 'dataTypeSourceMapping', sectionName: 'Data Type & Source Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

