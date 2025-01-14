import { Component } from '@angular/core';
import { Location } from '@angular/common';
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
    private location: Location
  ) {}

  private cachedRouteSegments = {
    "report-list": [],
    settings: [],
    chat: [],
  }

  goToReports() {
    this.UpdateCachedRouteSegments();
    this.router.navigate(this.getRouteSegments('report-list'));
  }
  goToSettings() {
    this.UpdateCachedRouteSegments();
    this.router.navigate(this.getRouteSegments('settings'));
  }
  goToChat() {
    this.UpdateCachedRouteSegments();
    this.router.navigate(this.getRouteSegments('chat'));
  }

  getRouteSegments(route: 'report-list' | 'settings' | 'chat'): string[] {
    const s = [`/${route}`];
    const cache = this.GetCachedRouteSegments(route);
    if (cache && cache.length) {
      // we have 1+ cached segments for the route, add them to the s array
      s.push(...cache);
    }
    return s;
  }

  GetCachedRouteSegments(route: 'report-list' | 'settings' | 'chat'): string[] {
    return this.cachedRouteSegments[route];
  }

  UpdateCachedRouteSegments() {
    const url = this.location.path();
    const segments = url.split('/').filter(x => x);
    const cachableSegments = segments && segments.length > 1 ? segments.slice(1) : []
    if (url.includes('/report-list')) {
      this.cachedRouteSegments["report-list"] = cachableSegments;
    } 
    else if (url.includes('/settings')) {
      this.cachedRouteSegments.settings = cachableSegments;
    } 
    else if (url.includes('/chat')) {
      this.cachedRouteSegments.chat = cachableSegments;
    }
  }
}
