import { Component } from '@angular/core';
import { MJCommunicationProviderEventEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Provider Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationproviderevent-form',
    templateUrl: './mjcommunicationproviderevent.form.component.html'
})
export class MJCommunicationProviderEventFormComponent extends BaseFormComponent {
    public record!: MJCommunicationProviderEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

