import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-crm-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-container">
      <h2>CRM Dashboard</h2>

      <div class="stats-grid">
        <div class="stat-card">
          <i class="fa-solid fa-user"></i>
          <h3>42</h3>
          <p>Active Contacts</p>
        </div>
        <div class="stat-card">
          <i class="fa-solid fa-building"></i>
          <h3>15</h3>
          <p>Companies</p>
        </div>
        <div class="stat-card">
          <i class="fa-solid fa-handshake"></i>
          <h3>8</h3>
          <p>Open Deals</p>
        </div>
        <div class="stat-card">
          <i class="fa-solid fa-dollar-sign"></i>
          <h3>$2.4M</h3>
          <p>Pipeline Value</p>
        </div>
      </div>

      <div class="section">
        <h3>Recent Activity</h3>
        <div class="activity-list">
          <div class="activity-item" *ngFor="let activity of recentActivity">
            <i [class]="activity.icon"></i>
            <div class="activity-content">
              <strong>{{ activity.title }}</strong>
              <p>{{ activity.description }}</p>
              <span class="time">{{ activity.time }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 24px;
    }

    h2 {
      margin: 0 0 24px 0;
      color: #424242;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      transition: box-shadow 0.15s;

      &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      i {
        font-size: 32px;
        color: #1976d2;
        margin-bottom: 12px;
      }

      h3 {
        margin: 0 0 8px 0;
        font-size: 32px;
        color: #424242;
      }

      p {
        margin: 0;
        color: #757575;
        font-size: 14px;
      }
    }

    .section {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;

      h3 {
        margin: 0 0 16px 0;
        color: #424242;
        font-size: 18px;
      }
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .activity-item {
      display: flex;
      gap: 16px;
      padding: 12px;
      border-radius: 6px;
      transition: background 0.15s;

      &:hover {
        background: #f5f5f5;
      }

      i {
        font-size: 24px;
        color: #1976d2;
        margin-top: 4px;
      }

      .activity-content {
        flex: 1;

        strong {
          display: block;
          color: #424242;
          margin-bottom: 4px;
        }

        p {
          margin: 0 0 4px 0;
          color: #616161;
          font-size: 14px;
        }

        .time {
          color: #9e9e9e;
          font-size: 12px;
        }
      }
    }
  `]
})
export class CrmDashboardComponent {
  recentActivity = [
    {
      icon: 'fa-solid fa-user-plus',
      title: 'New Contact Added',
      description: 'Sarah Johnson from Acme Corp',
      time: '2 hours ago'
    },
    {
      icon: 'fa-solid fa-handshake',
      title: 'Deal Won',
      description: 'Enterprise License - $50,000',
      time: '5 hours ago'
    },
    {
      icon: 'fa-solid fa-calendar-check',
      title: 'Meeting Scheduled',
      description: 'Product demo with TechStart Inc',
      time: '1 day ago'
    }
  ];
}
