import { Component } from '@angular/core';
import { MJCompanyIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Company Integration Object Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrationobjectfield-form',
    templateUrl: './mjcompanyintegrationobjectfield.form.component.html'
})
export class MJCompanyIntegrationObjectFieldFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationObjectFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

