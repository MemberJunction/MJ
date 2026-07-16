import { Component } from '@angular/core';
import { MJMLPortAdapterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Port Adapters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlportadapter-form',
    templateUrl: './mjmlportadapter.form.component.html'
})
export class MJMLPortAdapterFormComponent extends BaseFormComponent {
    public record!: MJMLPortAdapterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

