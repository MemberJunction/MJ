import { Component } from '@angular/core';
import { EntityActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Action Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entityactionparam-form',
    templateUrl: './entityactionparam.form.component.html'
})
export class EntityActionParamFormComponent extends BaseFormComponent {
    public record!: EntityActionParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifierRelationships', sectionName: 'Identifier & Relationships', isExpanded: true },
            { sectionKey: 'parameterDefinition', sectionName: 'Parameter Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

