import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrmApp } from '../crm.app';

@Component({
  selector: 'app-crm-companies',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="companies-container">
      <h2>Companies</h2>

      <div class="companies-grid">
        <div
          class="company-card"
          *ngFor="let company of companies"
          (click)="OpenCompanyInNewTab(company)"
        >
          <div class="company-header">
            <div class="company-logo">{{ company.initials }}</div>
            <button class="icon-btn" (click)="OpenCompanyInNewTab(company); $event.stopPropagation()">
              <i class="fa-solid fa-external-link"></i>
            </button>
          </div>
          <h3>{{ company.name }}</h3>
          <p class="industry">{{ company.industry }}</p>
          <div class="stats">
            <div class="stat">
              <i class="fa-solid fa-user"></i>
              <span>{{ company.contacts }} contacts</span>
            </div>
            <div class="stat">
              <i class="fa-solid fa-dollar-sign"></i>
              <span>{{ company.revenue }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .companies-container {
      padding: 24px;

      h2 {
        margin: 0 0 24px 0;
        color: #424242;
      }
    }

    .companies-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    .company-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: #1976d2;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }

    .company-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .company-logo {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: #e3f2fd;
      color: #1976d2;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
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

    h3 {
      margin: 0 0 8px 0;
      color: #424242;
      font-size: 18px;
    }

    .industry {
      margin: 0 0 16px 0;
      color: #757575;
      font-size: 14px;
    }

    .stats {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #616161;
      font-size: 13px;

      i {
        color: #9e9e9e;
        width: 16px;
      }
    }
  `]
})
export class CompaniesComponent {
  companies = [
    {
      id: '1',
      name: 'Acme Corp',
      initials: 'AC',
      industry: 'Manufacturing',
      contacts: 12,
      revenue: '$5M'
    },
    {
      id: '2',
      name: 'TechStart Inc',
      initials: 'TS',
      industry: 'Technology',
      contacts: 8,
      revenue: '$2.5M'
    },
    {
      id: '3',
      name: 'Global Solutions',
      initials: 'GS',
      industry: 'Consulting',
      contacts: 15,
      revenue: '$8M'
    },
    {
      id: '4',
      name: 'Innovation Labs',
      initials: 'IL',
      industry: 'Research',
      contacts: 6,
      revenue: '$1.2M'
    }
  ];

  constructor(private crmApp: CrmApp) {}

  OpenCompanyInNewTab(company: any): void {
    this.crmApp.RequestNewTab(
      `Company: ${company.name}`,
      `/crm/company/${company.id}`,
      { companyId: company.id, company }
    );
  }
}
