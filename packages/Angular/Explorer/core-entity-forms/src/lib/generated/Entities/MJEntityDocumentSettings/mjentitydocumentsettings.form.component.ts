import { Component } from '@angular/core';
import { MJEntityDocumentSettingsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Document Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitydocumentsettings-form',
    templateUrl: './mjentitydocumentsettings.form.component.html'
})
export class MJEntityDocumentSettingsFormComponent extends BaseFormComponent {
    public record!: MJEntityDocumentSettingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'documentIdentification', sectionName: 'Document Identification', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

