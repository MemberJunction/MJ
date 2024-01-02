import { Component } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent {
  public JSON: any = JSON;
  public User: any;

  constructor(public authBase: MJAuthBase){
    this.User = authBase.getUser();
  }
}