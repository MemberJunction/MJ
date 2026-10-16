import { Component } from '@angular/core';
import { MJRecordCloneLogItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Clone Log Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordclonelogitem-form',
    templateUrl: './mjrecordclonelogitem.form.component.html'
})
export class MJRecordCloneLogItemFormComponent extends BaseFormComponent {
    public record!: MJRecordCloneLogItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

