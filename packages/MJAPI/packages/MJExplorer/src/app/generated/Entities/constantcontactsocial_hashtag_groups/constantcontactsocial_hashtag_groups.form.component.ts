import { Component } from '@angular/core';
import { constantcontactsocial_hashtag_groupsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Social Hashtag Groups') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactsocial_hashtag_groups-form',
    templateUrl: './constantcontactsocial_hashtag_groups.form.component.html'
})
export class constantcontactsocial_hashtag_groupsFormComponent extends BaseFormComponent {
    public record!: constantcontactsocial_hashtag_groupsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

