import { Component } from '@angular/core';
import { MJSystemEventEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: System Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsystemevent-form',
    templateUrl: './mjsystemevent.form.component.html'
})
export class MJSystemEventFormComponent extends BaseFormComponent {
    public record!: MJSystemEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

