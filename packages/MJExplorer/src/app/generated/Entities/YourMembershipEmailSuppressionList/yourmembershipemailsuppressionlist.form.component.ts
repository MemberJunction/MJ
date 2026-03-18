import { Component } from '@angular/core';
import { YourMembershipEmailSuppressionListEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Suppression Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipemailsuppressionlist-form',
    templateUrl: './yourmembershipemailsuppressionlist.form.component.html'
})
export class YourMembershipEmailSuppressionListFormComponent extends BaseFormComponent {
    public record!: YourMembershipEmailSuppressionListEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'suppressionDetails', sectionName: 'Suppression Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

