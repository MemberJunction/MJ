import { Component } from '@angular/core';
import { AssociationDemoResourceVersionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoresourceversion-form',
    templateUrl: './associationdemoresourceversion.form.component.html'
})
export class AssociationDemoResourceVersionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoResourceVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionDetails', sectionName: 'Version Details', isExpanded: true },
            { sectionKey: 'fileInformation', sectionName: 'File Information', isExpanded: true },
            { sectionKey: 'auditInformation', sectionName: 'Audit Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

