import { Component, ChangeDetectorRef, ElementRef, OnInit } from '@angular/core';
import { SpeakerEntity, ContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { ActivatedRoute, Router } from '@angular/router';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';

@Component({
  selector: 'mj-speaker-form',
  templateUrl: './speaker-form.component.html',
  styleUrls: ['../shared/form-styles.css', './speaker-form.component.css']
})
@RegisterClass(BaseFormComponent, 'Speakers')
export class SpeakerFormComponent extends BaseFormComponent implements OnInit {
  public record!: SpeakerEntity;

  // Form data
  public contacts: ContactEntity[] = [];
  public loadingContacts = false;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  override async ngOnInit() {
    await super.ngOnInit();
    await this.loadContacts();
  }

  private async loadContacts(): Promise<void> {
    this.loadingContacts = true;
    try {
      const rv = new RunView();
      const md = new Metadata();
      const result = await rv.RunView<ContactEntity>({
        EntityName: 'Contacts',
        OrderBy: 'LastName, FirstName',
        ResultType: 'entity_object'
      }, md.CurrentUser);

      if (result.Success && result.Results) {
        this.contacts = result.Results;
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
      this.sharedService.CreateSimpleNotification('Error loading contacts', 'error', 3000);
    } finally {
      this.loadingContacts = false;
      this.cdr.detectChanges();
    }
  }

  public get isRecordReady(): boolean {
    return !!(this.record && !this.loadingContacts);
  }

  public get hasDossierData(): boolean {
    return !!(this.record.DossierSummary || this.record.CredibilityScore != null);
  }

  public get hasResearchData(): boolean {
    return !!(this.record.SpeakingHistory || this.record.Expertise || this.record.PublicationsCount || this.record.SocialMediaReach);
  }

  public get hasRedFlags(): boolean {
    return !!(this.record.RedFlags);
  }

  public get credibilityScoreClass(): string {
    const score = this.record.CredibilityScore;
    if (score == null) return '';
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-fair';
    return 'score-poor';
  }

  public getContactName(contactId: number): string {
    const contact = this.contacts.find(c => c.ID === contactId);
    return contact ? contact.FullName : 'Unknown Contact';
  }

  public parseJsonArray(jsonString: string | null): string[] {
    if (!jsonString) return [];
    try {
      const parsed = JSON.parse(jsonString);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public formatNumber(num: number | null): string {
    if (num == null) return '0';
    return num.toLocaleString();
  }

  public openContactRecord(): void {
    if (this.record.ContactID) {
      this.sharedService.OpenEntityRecord('Contacts', CompositeKey.FromID(this.record.ContactID));
    }
  }
}

export function LoadSpeakerFormComponent() {
  // Tree-shaking prevention
}
