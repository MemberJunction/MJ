import { Component } from '@angular/core';
import { constantcontactsocial_postsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Social Posts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactsocial_posts-form',
    templateUrl: './constantcontactsocial_posts.form.component.html'
})
export class constantcontactsocial_postsFormComponent extends BaseFormComponent {
    public record!: constantcontactsocial_postsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

