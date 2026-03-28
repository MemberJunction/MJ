import { Component } from '@angular/core';
import { AssociationDemoProductAwardEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Product Awards') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoproductaward-form',
    templateUrl: './associationdemoproductaward.form.component.html'
})
export class AssociationDemoProductAwardFormComponent extends BaseFormComponent {
    public record!: AssociationDemoProductAwardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

