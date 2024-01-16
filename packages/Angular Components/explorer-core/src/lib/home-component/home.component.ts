import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css', '../../shared/first-tab-styles.css']
})
export class HomeComponent {
  constructor(private router: Router) { }
  public navigate(route: string) {
    this.router.navigate([route]);
  }
}
