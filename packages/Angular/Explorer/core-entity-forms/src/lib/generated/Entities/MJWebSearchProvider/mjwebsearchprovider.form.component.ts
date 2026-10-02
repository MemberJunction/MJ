import { Component } from '@angular/core';
import { MJWebSearchProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Web Search Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjwebsearchprovider-form',
    templateUrl: './mjwebsearchprovider.form.component.html'
})
export class MJWebSearchProviderFormComponent extends BaseFormComponent {
    public record!: MJWebSearchProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

