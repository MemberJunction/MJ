import { Component } from '@angular/core';
import { MJCommunicationActivityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Activities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationactivity-form',
    templateUrl: './mjcommunicationactivity.form.component.html'
})
export class MJCommunicationActivityFormComponent extends BaseFormComponent {
    public record!: MJCommunicationActivityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

