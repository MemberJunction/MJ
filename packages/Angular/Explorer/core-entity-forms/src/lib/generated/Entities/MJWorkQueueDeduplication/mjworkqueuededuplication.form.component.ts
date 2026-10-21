import { Component } from '@angular/core';
import { MJWorkQueueDeduplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Work Queue Deduplications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkqueuededuplication-form',
    templateUrl: './mjworkqueuededuplication.form.component.html'
})
export class MJWorkQueueDeduplicationFormComponent extends BaseFormComponent {
    public record!: MJWorkQueueDeduplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

