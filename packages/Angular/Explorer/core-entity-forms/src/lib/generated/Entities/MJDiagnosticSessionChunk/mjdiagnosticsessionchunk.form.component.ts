import { Component } from '@angular/core';
import { MJDiagnosticSessionChunkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Diagnostic Session Chunks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdiagnosticsessionchunk-form',
    templateUrl: './mjdiagnosticsessionchunk.form.component.html'
})
export class MJDiagnosticSessionChunkFormComponent extends BaseFormComponent {
    public record!: MJDiagnosticSessionChunkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

