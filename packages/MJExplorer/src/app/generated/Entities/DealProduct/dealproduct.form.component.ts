import { Component } from '@angular/core';
import { DealProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dealproduct-form',
    templateUrl: './dealproduct.form.component.html'
})
export class DealProductFormComponent extends BaseFormComponent {
    public record!: DealProductEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadDealProductFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
