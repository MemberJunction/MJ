import { Location } from '@angular/common';
import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { EntityInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { SkipChatComponent } from '@memberjunction/ng-skip-chat';
import { SharedService } from '../services/shared-service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-skip',
  templateUrl: './skip.component.html',
  styleUrl: './skip.component.css'
})
export class SkipComponent implements AfterViewInit {
  constructor(public auth: AuthService, private router: Router, private location: Location, private sharedService: SharedService) {}

  @ViewChild('skipChat') skipChat!: SkipChatComponent;

  public targetEntities: EntityInfo[] = [];
  async ngAfterViewInit() {
    const p = this.sharedService.InstanceProvider;
    this.skipChat.Provider = p;
    this.skipChat.Load();
  } 

  public showReport(reportId: string) {
    this.router.navigate(['/report', reportId]);
  }
  
  public onConversationSelected(conversationId: string) {
    this.location.go('/chat/' + conversationId);
  }
}
