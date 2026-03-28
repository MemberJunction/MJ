import { Component } from '@angular/core';
import { AssociationDemoPolicyPositionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Policy Positions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemopolicyposition-form',
    templateUrl: './associationdemopolicyposition.form.component.html'
})
export class AssociationDemoPolicyPositionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoPolicyPositionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

