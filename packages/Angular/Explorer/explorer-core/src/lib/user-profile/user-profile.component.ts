import { Component } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { MJAuthBase, StandardUserInfo } from '@memberjunction/ng-auth-services';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent {
  public JSON: any = JSON;
  public User: Observable<StandardUserInfo | null>;

  constructor(public authBase: MJAuthBase) {
    // v3.0 API - User is now an observable that the template subscribes to
    this.User = authBase.getUserInfo();
  }
}