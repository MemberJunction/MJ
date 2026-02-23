import { Component } from '@angular/core';
import { MJEntityActionParamsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactionparams-form',
    templateUrl: './mjentityactionparams.form.component.html'
})
export class MJEntityActionParamsFormComponent extends BaseFormComponent {
    public record!: MJEntityActionParamsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifierRelationships', sectionName: 'Identifier & Relationships', isExpanded: true },
            { sectionKey: 'parameterDefinition', sectionName: 'Parameter Definition', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

