import { Component } from '@angular/core';
import { MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Integration Object Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrationobjectfield-form',
    templateUrl: './mjintegrationobjectfield.form.component.html'
})
export class MJIntegrationObjectFieldFormComponent extends BaseFormComponent {
    public record!: MJIntegrationObjectFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'objectMapping', sectionName: 'Object Mapping', isExpanded: true },
            { sectionKey: 'fieldIdentity', sectionName: 'Field Identity', isExpanded: true },
            { sectionKey: 'dataConstraints', sectionName: 'Data Constraints', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

