import { Component } from '@angular/core';
import { EntityDocumentSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Document Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entitydocumentsetting-form',
    templateUrl: './entitydocumentsetting.form.component.html'
})
export class EntityDocumentSettingFormComponent extends BaseFormComponent {
    public record!: EntityDocumentSettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'documentIdentification', sectionName: 'Document Identification', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

