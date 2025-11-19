import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-contact-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="contact-detail-container" *ngIf="contact">
      <div class="contact-header">
        <div class="contact-avatar-large">{{ contact.initials }}</div>
        <div class="contact-info">
          <h2>{{ contact.name }}</h2>
          <p class="company">{{ contact.company }}</p>
        </div>
      </div>

      <div class="contact-sections">
        <div class="section">
          <h3>Contact Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>Email</label>
              <span>{{ contact.email }}</span>
            </div>
            <div class="info-item">
              <label>Phone</label>
              <span>{{ contact.phone }}</span>
            </div>
            <div class="info-item">
              <label>Company</label>
              <span>{{ contact.company }}</span>
            </div>
            <div class="info-item">
              <label>Title</label>
              <span>{{ contact.title }}</span>
            </div>
          </div>
        </div>

        <div class="section">
          <h3>Recent Activity</h3>
          <div class="timeline">
            <div class="timeline-item" *ngFor="let activity of contact.activities">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <strong>{{ activity.title }}</strong>
                <p>{{ activity.description }}</p>
                <span class="time">{{ activity.time }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .contact-detail-container {
      padding: 24px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .contact-header {
      display: flex;
      gap: 24px;
      margin-bottom: 32px;
      padding: 24px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }

    .contact-avatar-large {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #1976d2;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 28px;
    }

    .contact-info {
      flex: 1;

      h2 {
        margin: 0 0 8px 0;
        color: #424242;
      }

      .company {
        margin: 0;
        color: #757575;
        font-size: 16px;
      }
    }

    .contact-sections {
      display: grid;
      gap: 24px;
    }

    .section {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;

      h3 {
        margin: 0 0 20px 0;
        color: #424242;
        font-size: 18px;
      }
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }

    .info-item {
      label {
        display: block;
        font-size: 12px;
        color: #9e9e9e;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      span {
        color: #424242;
        font-size: 14px;
      }
    }

    .timeline {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .timeline-item {
      display: flex;
      gap: 16px;
      position: relative;

      &:not(:last-child)::before {
        content: '';
        position: absolute;
        left: 7px;
        top: 24px;
        bottom: -20px;
        width: 2px;
        background: #e0e0e0;
      }
    }

    .timeline-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #1976d2;
      margin-top: 4px;
      flex-shrink: 0;
    }

    .timeline-content {
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
  `]
})
export class ContactDetailComponent implements OnInit {
  contactId: string | null = null;
  contact: any = null;

  // Mock contact database
  private contacts: any = {
    '1': {
      id: '1',
      name: 'Sarah Johnson',
      initials: 'SJ',
      company: 'Acme Corp',
      title: 'VP of Sales',
      email: 'sarah.j@acme.com',
      phone: '(555) 123-4567',
      activities: [
        {
          title: 'Email Sent',
          description: 'Product demo follow-up',
          time: '2 hours ago'
        },
        {
          title: 'Meeting Completed',
          description: 'Initial discovery call',
          time: '3 days ago'
        },
        {
          title: 'Contact Created',
          description: 'Added to CRM',
          time: '1 week ago'
        }
      ]
    },
    '2': {
      id: '2',
      name: 'Michael Chen',
      initials: 'MC',
      company: 'TechStart Inc',
      title: 'CTO',
      email: 'mchen@techstart.io',
      phone: '(555) 234-5678',
      activities: [
        {
          title: 'Demo Scheduled',
          description: 'Technical evaluation meeting',
          time: '1 day ago'
        }
      ]
    },
    '3': {
      id: '3',
      name: 'Emily Rodriguez',
      initials: 'ER',
      company: 'Global Solutions',
      title: 'Director of Operations',
      email: 'emily.r@global.com',
      phone: '(555) 345-6789',
      activities: []
    },
    '4': {
      id: '4',
      name: 'David Kim',
      initials: 'DK',
      company: 'Innovation Labs',
      title: 'Product Manager',
      email: 'dkim@innovationlabs.com',
      phone: '(555) 456-7890',
      activities: []
    }
  };

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.contactId = params['id'];
      if (this.contactId) {
        this.contact = this.contacts[this.contactId];
      }
    });
  }
}
