import { Component } from '@angular/core';
import { CommitteeTermEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeTermDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Committee Terms') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeeterm-form',
    templateUrl: './committeeterm.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeTermFormComponent extends BaseFormComponent {
    public record!: CommitteeTermEntity;
} 

export function LoadCommitteeTermFormComponent() {
    LoadCommitteeTermDetailsComponent();
}
