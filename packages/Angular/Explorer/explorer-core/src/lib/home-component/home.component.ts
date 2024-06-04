import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
export class HomeComponent {
  constructor(public sharedService: SharedService, private router: Router) { }
  public navigate(route: string) {
    this.router.navigate([route]);
  }
}
