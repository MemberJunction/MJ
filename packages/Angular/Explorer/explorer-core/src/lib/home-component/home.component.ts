import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Home')
export class HomeComponent extends BaseNavigationComponent {
  constructor(public sharedService: SharedService, private router: Router) { 
    super();
  }

  public md = new Metadata();
  public HomeItems = this.md.VisibleExplorerNavigationItems.filter(item => item.ShowInHomeScreen); // only want to show the home items here

  public navigate(route: string) {
    this.router.navigate([route]).catch(err => {
      console.error('Navigation error:', err);
    });
  }
}
