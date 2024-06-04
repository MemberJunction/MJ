import { Component, Inject, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

@Component({
  selector: 'app-auth-button',
  templateUrl: './auth-button.component.html',
  styleUrls: ['./auth-button.component.css']
})
export class AuthButtonComponent implements OnInit {
  // Inject the authentication service into your component through the constructor
  constructor(@Inject(DOCUMENT) public document: Document, public authBase: MJAuthBase) {}

  ngOnInit(): void {
  }

  public async logout() {
    this.authBase.logout();
    localStorage.removeItem('auth')
    localStorage.removeItem('claims')
  }
}


