import { Component } from '@angular/core';
import { MJEntityCommunicationFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Communication Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitycommunicationfield-form',
    templateUrl: './mjentitycommunicationfield.form.component.html'
})
export class MJEntityCommunicationFieldFormComponent extends BaseFormComponent {
    public record!: MJEntityCommunicationFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identification', sectionName: 'Identification', isExpanded: true },
            { sectionKey: 'mappingConfiguration', sectionName: 'Mapping Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

