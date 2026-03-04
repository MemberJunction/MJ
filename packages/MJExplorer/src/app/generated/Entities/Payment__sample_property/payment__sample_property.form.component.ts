import { Component } from '@angular/core';
import { Payment__sample_propertyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Payments__sample_property') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-payment__sample_property-form',
    templateUrl: './payment__sample_property.form.component.html'
})
export class Payment__sample_propertyFormComponent extends BaseFormComponent {
    public record!: Payment__sample_propertyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

