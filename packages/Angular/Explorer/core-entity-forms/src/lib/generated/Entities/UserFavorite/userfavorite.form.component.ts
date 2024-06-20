import { Component } from '@angular/core';
import { UserFavoriteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserFavoriteDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'User Favorites') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userfavorite-form',
    templateUrl: './userfavorite.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserFavoriteFormComponent extends BaseFormComponent {
    public record!: UserFavoriteEntity;
} 

export function LoadUserFavoriteFormComponent() {
    LoadUserFavoriteDetailsComponent();
}
