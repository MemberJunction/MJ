import { Component } from '@angular/core';
import { hubspottax_ratesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Tax Rates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottax_rates-form',
    templateUrl: './hubspottax_rates.form.component.html'
})
export class hubspottax_ratesFormComponent extends BaseFormComponent {
    public record!: hubspottax_ratesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taxRateConfiguration', sectionName: 'Tax Rate Configuration', isExpanded: true },
            { sectionKey: 'validityPeriod', sectionName: 'Validity Period', isExpanded: true },
            { sectionKey: 'geographicApplicability', sectionName: 'Geographic Applicability', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

