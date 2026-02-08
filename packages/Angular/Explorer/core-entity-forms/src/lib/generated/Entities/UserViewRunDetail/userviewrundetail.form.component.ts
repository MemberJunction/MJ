import { Component } from '@angular/core';
import { UserViewRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User View Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userviewrundetail-form',
    templateUrl: './userviewrundetail.form.component.html'
})
export class UserViewRunDetailFormComponent extends BaseFormComponent {
    public record!: UserViewRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runDetails', sectionName: 'Run Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

