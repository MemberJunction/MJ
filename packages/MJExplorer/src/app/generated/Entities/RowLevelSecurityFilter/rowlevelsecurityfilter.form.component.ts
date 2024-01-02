import { Component } from '@angular/core';
import { RowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadRowLevelSecurityFilterDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Row Level Security Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rowlevelsecurityfilter-form',
    templateUrl: './rowlevelsecurityfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RowLevelSecurityFilterFormComponent extends BaseFormComponent {
    public record: RowLevelSecurityFilterEntity | null = null;
} 

export function LoadRowLevelSecurityFilterFormComponent() {
    LoadRowLevelSecurityFilterDetailsComponent();
}
