import { Component } from '@angular/core';
import { ProductAwardEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Product Awards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productaward-form',
    templateUrl: './productaward.form.component.html'
})
export class ProductAwardFormComponent extends BaseFormComponent {
    public record!: ProductAwardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadProductAwardFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
