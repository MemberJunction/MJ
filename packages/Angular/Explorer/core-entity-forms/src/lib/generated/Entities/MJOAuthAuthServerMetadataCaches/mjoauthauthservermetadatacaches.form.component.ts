import { Component } from '@angular/core';
import { MJOAuthAuthServerMetadataCachesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Auth Server Metadata Caches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthauthservermetadatacaches-form',
    templateUrl: './mjoauthauthservermetadatacaches.form.component.html'
})
export class MJOAuthAuthServerMetadataCachesFormComponent extends BaseFormComponent {
    public record!: MJOAuthAuthServerMetadataCachesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

