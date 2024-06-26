import { Component } from '@angular/core';
import { RowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRowLevelSecurityFilterDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Row Level Security Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rowlevelsecurityfilter-form',
    templateUrl: './rowlevelsecurityfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RowLevelSecurityFilterFormComponent extends BaseFormComponent {
    public record!: RowLevelSecurityFilterEntity;
} 

export function LoadRowLevelSecurityFilterFormComponent() {
    LoadRowLevelSecurityFilterDetailsComponent();
}
