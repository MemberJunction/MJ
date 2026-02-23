import { Component } from '@angular/core';
import { DealProductsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Products') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dealproducts-form',
    templateUrl: './dealproducts.form.component.html'
})
export class DealProductsFormComponent extends BaseFormComponent {
    public record!: DealProductsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

