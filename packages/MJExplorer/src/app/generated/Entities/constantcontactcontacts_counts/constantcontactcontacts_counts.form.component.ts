import { Component } from '@angular/core';
import { constantcontactcontacts_countsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contacts Counts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactcontacts_counts-form',
    templateUrl: './constantcontactcontacts_counts.form.component.html'
})
export class constantcontactcontacts_countsFormComponent extends BaseFormComponent {
    public record!: constantcontactcontacts_countsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

