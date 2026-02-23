import { Component } from '@angular/core';
import { MJContentItemTagsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Item Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentitemtags-form',
    templateUrl: './mjcontentitemtags.form.component.html'
})
export class MJContentItemTagsFormComponent extends BaseFormComponent {
    public record!: MJContentItemTagsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'tagAssociation', sectionName: 'Tag Association', isExpanded: true }
        ]);
    }
}

