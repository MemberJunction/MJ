import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-appearance',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="appearance-settings">
      <h2>Appearance Settings</h2>

      <div class="form-group">
        <label>Theme</label>
        <select class="form-control">
          <option>Light</option>
          <option>Dark</option>
          <option>Auto</option>
        </select>
      </div>

      <div class="form-group">
        <label>Font Size</label>
        <select class="form-control">
          <option>Small</option>
          <option selected>Medium</option>
          <option>Large</option>
        </select>
      </div>

      <div class="form-group">
        <label>Accent Color</label>
        <div class="color-options">
          <div class="color-option" style="background: #1976d2;" title="Blue"></div>
          <div class="color-option" style="background: #388e3c;" title="Green"></div>
          <div class="color-option" style="background: #d32f2f;" title="Red"></div>
          <div class="color-option" style="background: #7b1fa2;" title="Purple"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .appearance-settings {
      max-width: 600px;

      h2 {
        margin: 0 0 24px 0;
        color: #424242;
      }
    }

    .form-group {
      margin-bottom: 24px;

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
        background: white;
        cursor: pointer;
        transition: border-color 0.15s;

        &:focus {
          outline: none;
          border-color: #1976d2;
        }
      }
    }

    .color-options {
      display: flex;
      gap: 12px;
    }

    .color-option {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.15s;

      &:hover {
        border-color: #424242;
        transform: scale(1.1);
      }
    }
  `]
})
export class AppearanceComponent {}
