import { Component } from '@angular/core';
import { MJCommunicationRunChunkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Run Chunks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationrunchunk-form',
    templateUrl: './mjcommunicationrunchunk.form.component.html'
})
export class MJCommunicationRunChunkFormComponent extends BaseFormComponent {
    public record!: MJCommunicationRunChunkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

