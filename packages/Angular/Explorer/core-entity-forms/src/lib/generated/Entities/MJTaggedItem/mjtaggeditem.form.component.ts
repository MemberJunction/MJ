import { Component } from '@angular/core';
import { MJTaggedItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tagged Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtaggeditem-form',
    templateUrl: './mjtaggeditem.form.component.html'
})
export class MJTaggedItemFormComponent extends BaseFormComponent {
    public record!: MJTaggedItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDefinition', sectionName: 'Tag Definition', isExpanded: true },
            { sectionKey: 'linkedRecord', sectionName: 'Linked Record', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

