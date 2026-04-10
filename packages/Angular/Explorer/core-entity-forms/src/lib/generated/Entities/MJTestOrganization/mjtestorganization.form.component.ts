import { Component } from '@angular/core';
import { MJTestOrganizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Organizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestorganization-form',
    templateUrl: './mjtestorganization.form.component.html'
})
export class MJTestOrganizationFormComponent extends BaseFormComponent {
    public record!: MJTestOrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

