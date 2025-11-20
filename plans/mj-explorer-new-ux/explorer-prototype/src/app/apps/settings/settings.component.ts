import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="settings-container">
      <div class="settings-sidebar">
        <h3>User Preferences</h3>
        <nav class="settings-nav">
          <a routerLink="/settings/profile" routerLinkActive="active" class="nav-link">
            <i class="fa-solid fa-user"></i>
            Profile
          </a>
          <a routerLink="/settings/notifications" routerLinkActive="active" class="nav-link">
            <i class="fa-solid fa-bell"></i>
            Notifications
          </a>
          <a routerLink="/settings/appearance" routerLinkActive="active" class="nav-link">
            <i class="fa-solid fa-palette"></i>
            Appearance
          </a>
        </nav>
      </div>

      <div class="settings-content">
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
  styles: [`
    .settings-container {
      display: flex;
      height: 100%;
      overflow: hidden;
    }

    .settings-sidebar {
      width: 250px;
      background: #f5f5f5;
      border-right: 1px solid #e0e0e0;
      padding: 24px;

      h3 {
        margin: 0 0 16px 0;
        color: #424242;
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    .settings-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 6px;
      text-decoration: none;
      color: #616161;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;

      &:hover {
        background: #eeeeee;
        color: #424242;
      }

      &.active {
        background: #e3f2fd;
        color: #1976d2;
      }

      i {
        font-size: 16px;
        width: 20px;
        text-align: center;
      }
    }

    .settings-content {
      flex: 1;
      overflow: auto;
      padding: 24px;
    }
  `]
})
export class SettingsComponent {}
