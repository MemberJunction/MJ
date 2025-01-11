import { Location } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ViewChild } from '@angular/core';
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
  constructor(public auth: AuthService, private router: Router, private location: Location, private sharedService: SharedService, private cdr: ChangeDetectorRef) {}

  @ViewChild('skipChat') skipChat!: SkipChatComponent;

  public targetEntities: EntityInfo[] = [];
  public loading: boolean = true;
  async ngAfterViewInit() {
    this.sharedService.setupComplete$.subscribe(async () => {
      this.loading = false;
      this.cdr.detectChanges();
      
      const p = this.sharedService.InstanceProvider;
      this.skipChat.Provider = p;
      await this.skipChat.Load();  
    });
  } 

  public showReport(reportId: string) {
    this.router.navigate(['/report', reportId]);
  }
  
  public onConversationSelected(conversationId: string) {
    this.location.go('/chat/' + conversationId);
  }
}
