import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Metadata } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';

/**
 * Displays read-only account information for the current user.
 * Shows name, email, role, creation date, and last login.
 */
@Component({
  selector: 'mj-account-info',
  templateUrl: './account-info.component.html',
  styleUrls: ['./account-info.component.css']
})
export class AccountInfoComponent implements OnInit {
  IsLoading = true;
  CurrentUser: UserEntity | null = null;
  ErrorMessage = '';

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    await this.LoadAccountInfo();
  }

  private async LoadAccountInfo(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = '';

    try {
      const md = new Metadata();
      const userInfo = md.CurrentUser;

      // Load full user entity for additional details
      const user = await md.GetEntityObject<UserEntity>('Users');
      const loaded = await user.Load(userInfo.ID);

      if (loaded) {
        this.CurrentUser = user;
      } else {
        this.ErrorMessage = 'Unable to load account information.';
      }
    } catch (error) {
      this.ErrorMessage = 'Failed to load account information.';
      console.error('Error loading account info:', error);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Formats a date for display
   */
  FormatDate(date: Date | null | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

}
