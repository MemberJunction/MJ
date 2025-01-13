import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  logoUrl: string = "../../assets/images/img-logo.jpg";
  private subscription: Subscription = new Subscription();

  constructor (
    private router: Router,
  ) {}

  goToReports() {
    this.router.navigate([`/report-list`]);
  }
  goToSettings() {
    this.router.navigate([`/settings`]);
  }
  goToChat() {
    this.router.navigate([`/chat`]);
  }
}
