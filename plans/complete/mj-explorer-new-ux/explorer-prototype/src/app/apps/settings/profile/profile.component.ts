import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="profile-settings">
      <h2>Profile Settings</h2>

      <div class="form-group">
        <label>Full Name</label>
        <input type="text" value="John Doe" class="form-control">
      </div>

      <div class="form-group">
        <label>Email</label>
        <input type="email" value="john.doe@example.com" class="form-control">
      </div>

      <div class="form-group">
        <label>Role</label>
        <input type="text" value="Developer" class="form-control" readonly>
      </div>

      <button class="save-btn">Save Changes</button>
    </div>
  `,
  styles: [`
    .profile-settings {
      max-width: 600px;

      h2 {
        margin: 0 0 24px 0;
        color: #424242;
      }
    }

    .form-group {
      margin-bottom: 20px;

      label {
        display: block;
        margin-bottom: 8px;
        color: #616161;
        font-weight: 500;
        font-size: 14px;
      }

      .form-control {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        font-size: 14px;
        transition: border-color 0.15s;

        &:focus {
          outline: none;
          border-color: #1976d2;
        }

        &:readonly {
          background: #f5f5f5;
        }
      }
    }

    .save-btn {
      padding: 10px 24px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;

      &:hover {
        background: #1565c0;
      }
    }
  `]
})
export class ProfileComponent {}
