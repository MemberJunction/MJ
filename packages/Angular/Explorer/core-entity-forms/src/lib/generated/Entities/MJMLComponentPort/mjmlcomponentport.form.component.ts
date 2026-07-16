import { Component } from '@angular/core';
import { MJMLComponentPortEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Component Ports') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponentport-form',
    templateUrl: './mjmlcomponentport.form.component.html'
})
export class MJMLComponentPortFormComponent extends BaseFormComponent {
    public record!: MJMLComponentPortEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

