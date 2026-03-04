import { Component } from '@angular/core';
import { CheckoutEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Checkouts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-checkout-form',
    templateUrl: './checkout.form.component.html'
})
export class CheckoutFormComponent extends BaseFormComponent {
    public record!: CheckoutEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'fines', sectionName: 'Fines', isExpanded: false }
        ]);
    }
}

