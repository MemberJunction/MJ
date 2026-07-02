import { Component } from '@angular/core';
import { MJUserRoutineRecipientEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Routine Recipients') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserroutinerecipient-form',
    templateUrl: './mjuserroutinerecipient.form.component.html'
})
export class MJUserRoutineRecipientFormComponent extends BaseFormComponent {
    public record!: MJUserRoutineRecipientEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'routineContext', sectionName: 'Routine Context', isExpanded: true },
            { sectionKey: 'recipientConfiguration', sectionName: 'Recipient Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

