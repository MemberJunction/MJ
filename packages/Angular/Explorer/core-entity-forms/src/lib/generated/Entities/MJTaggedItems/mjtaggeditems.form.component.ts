import { Component } from '@angular/core';
import { MJTaggedItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tagged Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtaggeditems-form',
    templateUrl: './mjtaggeditems.form.component.html'
})
export class MJTaggedItemsFormComponent extends BaseFormComponent {
    public record!: MJTaggedItemsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagDefinition', sectionName: 'Tag Definition', isExpanded: true },
            { sectionKey: 'linkedRecord', sectionName: 'Linked Record', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

