import { Component } from '@angular/core';
import { MJUserViewRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User View Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserviewrundetail-form',
    templateUrl: './mjuserviewrundetail.form.component.html'
})
export class MJUserViewRunDetailFormComponent extends BaseFormComponent {
    public record!: MJUserViewRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runDetails', sectionName: 'Run Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

