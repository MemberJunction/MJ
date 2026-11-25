import { Component } from '@angular/core';
import { MJGraphEdgeProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Graph Edge Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphedgeprovider-form',
    templateUrl: './mjgraphedgeprovider.form.component.html'
})
export class MJGraphEdgeProviderFormComponent extends BaseFormComponent {
    public record!: MJGraphEdgeProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

