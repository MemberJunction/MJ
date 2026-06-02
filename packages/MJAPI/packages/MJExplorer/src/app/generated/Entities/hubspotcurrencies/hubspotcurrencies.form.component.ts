import { Component } from '@angular/core';
import { hubspotcurrenciesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Currencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcurrencies-form',
    templateUrl: './hubspotcurrencies.form.component.html'
})
export class hubspotcurrenciesFormComponent extends BaseFormComponent {
    public record!: hubspotcurrenciesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'currencyDetails', sectionName: 'Currency Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

