import { Component } from '@angular/core';
import { ContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Item Tags') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentitemtag-form',
    templateUrl: './contentitemtag.form.component.html'
})
export class ContentItemTagFormComponent extends BaseFormComponent {
    public record!: ContentItemTagEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'tagAssociation', sectionName: 'Tag Association', isExpanded: true }
        ]);
    }
}

