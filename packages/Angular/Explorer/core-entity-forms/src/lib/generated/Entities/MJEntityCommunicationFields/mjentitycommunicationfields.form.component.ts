import { Component } from '@angular/core';
import { MJEntityCommunicationFieldsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Communication Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitycommunicationfields-form',
    templateUrl: './mjentitycommunicationfields.form.component.html'
})
export class MJEntityCommunicationFieldsFormComponent extends BaseFormComponent {
    public record!: MJEntityCommunicationFieldsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'mappingConfiguration', sectionName: 'Mapping Configuration', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

