import { Component } from '@angular/core';
import { TaggedItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Tagged Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-taggeditem-form',
    templateUrl: './taggeditem.form.component.html'
})
export class TaggedItemFormComponent extends BaseFormComponent {
    public record!: TaggedItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDefinition', sectionName: 'Tag Definition', isExpanded: true },
            { sectionKey: 'linkedRecord', sectionName: 'Linked Record', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

