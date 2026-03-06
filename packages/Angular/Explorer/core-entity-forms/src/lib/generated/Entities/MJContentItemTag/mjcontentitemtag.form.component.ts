import { Component } from '@angular/core';
import { MJContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Item Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentitemtag-form',
    templateUrl: './mjcontentitemtag.form.component.html'
})
export class MJContentItemTagFormComponent extends BaseFormComponent {
    public record!: MJContentItemTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'tagAssociation', sectionName: 'Tag Association', isExpanded: true }
        ]);
    }
}

