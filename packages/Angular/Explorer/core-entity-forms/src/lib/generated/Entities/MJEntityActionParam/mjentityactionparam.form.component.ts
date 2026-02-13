import { Component } from '@angular/core';
import { MJEntityActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityactionparam-form',
    templateUrl: './mjentityactionparam.form.component.html'
})
export class MJEntityActionParamFormComponent extends BaseFormComponent {
    public record!: MJEntityActionParamEntity;

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

