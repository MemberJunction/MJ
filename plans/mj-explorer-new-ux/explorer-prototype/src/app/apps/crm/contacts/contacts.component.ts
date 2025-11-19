import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrmApp } from '../crm.app';

@Component({
  selector: 'app-crm-contacts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="contacts-container">
      <div class="contacts-header">
        <h2>Contacts</h2>
        <button class="add-btn">
          <i class="fa-solid fa-plus"></i>
          Add Contact
        </button>
      </div>

      <div class="contacts-table">
        <div class="table-header">
          <div class="col-name">Name</div>
          <div class="col-company">Company</div>
          <div class="col-email">Email</div>
          <div class="col-phone">Phone</div>
          <div class="col-actions">Actions</div>
        </div>

        <div
          class="table-row"
          *ngFor="let contact of contacts"
          (click)="OpenContactInNewTab(contact)"
        >
          <div class="col-name">
            <div class="contact-avatar">{{ contact.initials }}</div>
            <strong>{{ contact.name }}</strong>
          </div>
          <div class="col-company">{{ contact.company }}</div>
          <div class="col-email">{{ contact.email }}</div>
          <div class="col-phone">{{ contact.phone }}</div>
          <div class="col-actions">
            <button class="icon-btn" (click)="OpenContactInNewTab(contact); $event.stopPropagation()">
              <i class="fa-solid fa-external-link"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .contacts-container {
      padding: 24px;
    }

    .contacts-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;

      h2 {
        margin: 0;
        color: #424242;
      }
    }

    .add-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.15s;

      &:hover {
        background: #1565c0;
      }
    }

    .contacts-table {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .table-header,
    .table-row {
      display: grid;
      grid-template-columns: 2fr 1.5fr 2fr 1.5fr 100px;
      gap: 16px;
      padding: 16px;
      align-items: center;
    }

    .table-header {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 14px;
      color: #616161;
      border-bottom: 1px solid #e0e0e0;
    }

    .table-row {
      border-bottom: 1px solid #f5f5f5;
      cursor: pointer;
      transition: background 0.15s;

      &:hover {
        background: #fafafa;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    .col-name {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .contact-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #1976d2;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
    }

    .col-email,
    .col-phone {
      color: #757575;
      font-size: 14px;
    }

    .icon-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #757575;
      transition: all 0.15s;

      &:hover {
        background: #e3f2fd;
        color: #1976d2;
      }
    }
  `]
})
export class ContactsComponent {
  contacts = [
    {
      id: '1',
      name: 'Sarah Johnson',
      initials: 'SJ',
      company: 'Acme Corp',
      email: 'sarah.j@acme.com',
      phone: '(555) 123-4567'
    },
    {
      id: '2',
      name: 'Michael Chen',
      initials: 'MC',
      company: 'TechStart Inc',
      email: 'mchen@techstart.io',
      phone: '(555) 234-5678'
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      initials: 'ER',
      company: 'Global Solutions',
      email: 'emily.r@global.com',
      phone: '(555) 345-6789'
    },
    {
      id: '4',
      name: 'David Kim',
      initials: 'DK',
      company: 'Innovation Labs',
      email: 'dkim@innovationlabs.com',
      phone: '(555) 456-7890'
    }
  ];

  constructor(private crmApp: CrmApp) {}

  OpenContactInNewTab(contact: any): void {
    this.crmApp.RequestNewTab(
      `Contact: ${contact.name}`,
      `/crm/contact/${contact.id}`,
      { contactId: contact.id, contact }
    );
  }
}
