import { Component } from '@angular/core';
import { MJEntityIndexFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Index Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityindexfield-form',
    templateUrl: './mjentityindexfield.form.component.html'
})
export class MJEntityIndexFieldFormComponent extends BaseFormComponent {
    public record!: MJEntityIndexFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

