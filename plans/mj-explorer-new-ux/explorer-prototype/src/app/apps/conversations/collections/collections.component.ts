import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-collections',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="collections-container">
      <h2>Collections</h2>
      <div class="collections-grid">
        <div class="collection-card" *ngFor="let collection of collections">
          <i [class]="collection.icon"></i>
          <h3>{{ collection.name }}</h3>
          <p>{{ collection.itemCount }} items</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .collections-container {
      padding: 24px;
    }

    h2 {
      margin: 0 0 24px 0;
      color: #424242;
    }

    .collections-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }

    .collection-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: #1976d2;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      i {
        font-size: 32px;
        color: #1976d2;
        margin-bottom: 12px;
      }

      h3 {
        margin: 0 0 8px 0;
        color: #424242;
        font-size: 16px;
      }

      p {
        margin: 0;
        color: #757575;
        font-size: 14px;
      }
    }
  `]
})
export class CollectionsComponent {
  collections = [
    { name: 'Q4 Reports', icon: 'fa-solid fa-folder', itemCount: 12 },
    { name: 'Client Feedback', icon: 'fa-solid fa-folder', itemCount: 8 },
    { name: 'Design Assets', icon: 'fa-solid fa-folder', itemCount: 24 }
  ];
}
