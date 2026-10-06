import { Component } from '@angular/core';
import { MJRSUPendingWorkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: RSU Pending Works') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrsupendingwork-form',
    templateUrl: './mjrsupendingwork.form.component.html'
})
export class MJRSUPendingWorkFormComponent extends BaseFormComponent {
    public record!: MJRSUPendingWorkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

