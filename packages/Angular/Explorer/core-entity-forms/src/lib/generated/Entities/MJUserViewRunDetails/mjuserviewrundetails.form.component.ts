import { Component } from '@angular/core';
import { MJUserViewRunDetailsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User View Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserviewrundetails-form',
    templateUrl: './mjuserviewrundetails.form.component.html'
})
export class MJUserViewRunDetailsFormComponent extends BaseFormComponent {
    public record!: MJUserViewRunDetailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runDetails', sectionName: 'Run Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

