import { Component } from '@angular/core';
import { YourMembershipProductCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Product Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipproductcategory-form',
    templateUrl: './yourmembershipproductcategory.form.component.html'
})
export class YourMembershipProductCategoryFormComponent extends BaseFormComponent {
    public record!: YourMembershipProductCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

