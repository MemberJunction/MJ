import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notifications-settings">
      <h2>Notification Settings</h2>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Email Notifications</h4>
          <p>Receive email updates about your activity</p>
        </div>
        <label class="toggle">
          <input type="checkbox" checked>
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Push Notifications</h4>
          <p>Get notified about important updates</p>
        </div>
        <label class="toggle">
          <input type="checkbox">
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>Daily Digest</h4>
          <p>Receive a daily summary email</p>
        </div>
        <label class="toggle">
          <input type="checkbox" checked>
          <span class="slider"></span>
        </label>
      </div>
    </div>
  `,
  styles: [`
    .notifications-settings {
      max-width: 600px;

      h2 {
        margin: 0 0 24px 0;
        color: #424242;
      }
    }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 12px;

      .setting-info {
        flex: 1;

        h4 {
          margin: 0 0 4px 0;
          color: #424242;
          font-size: 16px;
        }

        p {
          margin: 0;
          color: #757575;
          font-size: 14px;
        }
      }
    }

    .toggle {
      position: relative;
      display: inline-block;
      width: 50px;
      height: 28px;

      input {
        opacity: 0;
        width: 0;
        height: 0;

        &:checked + .slider {
          background-color: #1976d2;

          &:before {
            transform: translateX(22px);
          }
        }
      }

      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        border-radius: 28px;
        transition: 0.2s;

        &:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          border-radius: 50%;
          transition: 0.2s;
        }
      }
    }
  `]
})
export class NotificationsComponent {}
