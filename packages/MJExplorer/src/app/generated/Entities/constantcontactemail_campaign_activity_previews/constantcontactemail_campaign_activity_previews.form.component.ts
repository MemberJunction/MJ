import { Component } from '@angular/core';
import { constantcontactemail_campaign_activity_previewsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Campaign Activity Previews') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemail_campaign_activity_previews-form',
    templateUrl: './constantcontactemail_campaign_activity_previews.form.component.html'
})
export class constantcontactemail_campaign_activity_previewsFormComponent extends BaseFormComponent {
    public record!: constantcontactemail_campaign_activity_previewsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

