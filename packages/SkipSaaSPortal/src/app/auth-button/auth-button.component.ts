import { Component, Inject } from '@angular/core';
// Import the AuthService type from the SDK
import { AuthService } from '@auth0/auth0-angular';
import { DOCUMENT } from '@angular/common';
import { Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-auth-button',
  templateUrl: './auth-button.component.html',
  styleUrls: ['./auth-button.component.css']
})
export class AuthButtonComponent {
  // Inject the authentication service into your component through the constructor
  constructor(@Inject(DOCUMENT) public document: Document, public auth: AuthService) {}

  public doSignUp() {
    this.auth.loginWithRedirect({
      authorizationParams: {
        screen_hint: 'signup',
      },
    });
  }

  public doLogOut() {
    // wipe out the metadata in the local storage
    const md = new Metadata()
    md.RemoveLocalMetadataFromStorage();
    this.auth.logout({ logoutParams: { returnTo: document.location.origin } })
  }
} 