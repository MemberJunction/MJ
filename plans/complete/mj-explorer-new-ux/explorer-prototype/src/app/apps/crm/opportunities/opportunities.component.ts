import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrmApp } from '../crm.app';

@Component({
  selector: 'app-crm-opportunities',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="opportunities-container">
      <h2>Opportunities</h2>

      <div class="pipeline-stages">
        <div class="stage" *ngFor="let stage of stages">
          <h3>{{ stage.name }}</h3>
          <p class="stage-value">{{ stage.value }}</p>

          <div class="opportunities-list">
            <div
              class="opportunity-card"
              *ngFor="let opp of getOpportunitiesForStage(stage.name)"
              (click)="OpenOpportunityInNewTab(opp)"
            >
              <div class="opp-header">
                <strong>{{ opp.name }}</strong>
                <button class="icon-btn" (click)="OpenOpportunityInNewTab(opp); $event.stopPropagation()">
                  <i class="fa-solid fa-external-link"></i>
                </button>
              </div>
              <p class="company">{{ opp.company }}</p>
              <div class="opp-footer">
                <span class="value">{{ opp.value }}</span>
                <span class="probability">{{ opp.probability }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .opportunities-container {
      padding: 24px;

      h2 {
        margin: 0 0 24px 0;
        color: #424242;
      }
    }

    .pipeline-stages {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .stage {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 16px;

      h3 {
        margin: 0 0 4px 0;
        color: #424242;
        font-size: 16px;
      }

      .stage-value {
        margin: 0 0 16px 0;
        color: #1976d2;
        font-weight: 600;
        font-size: 18px;
      }
    }

    .opportunities-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .opportunity-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: #1976d2;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
    }

    .opp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      strong {
        color: #424242;
        font-size: 14px;
      }
    }

    .icon-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #757575;
      font-size: 12px;
      transition: all 0.15s;

      &:hover {
        background: #e3f2fd;
        color: #1976d2;
      }
    }

    .company {
      margin: 0 0 8px 0;
      color: #757575;
      font-size: 13px;
    }

    .opp-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .value {
        color: #1976d2;
        font-weight: 600;
        font-size: 14px;
      }

      .probability {
        background: #e3f2fd;
        color: #1976d2;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
      }
    }
  `]
})
export class OpportunitiesComponent {
  stages = [
    { name: 'Prospecting', value: '$320K' },
    { name: 'Qualification', value: '$580K' },
    { name: 'Proposal', value: '$420K' },
    { name: 'Negotiation', value: '$280K' }
  ];

  opportunities = [
    {
      id: '1',
      name: 'Enterprise License',
      company: 'Acme Corp',
      value: '$50K',
      probability: 75,
      stage: 'Negotiation'
    },
    {
      id: '2',
      name: 'Cloud Migration',
      company: 'TechStart Inc',
      value: '$120K',
      probability: 60,
      stage: 'Proposal'
    },
    {
      id: '3',
      name: 'Consulting Package',
      company: 'Global Solutions',
      value: '$85K',
      probability: 80,
      stage: 'Negotiation'
    },
    {
      id: '4',
      name: 'Platform Integration',
      company: 'Innovation Labs',
      value: '$45K',
      probability: 45,
      stage: 'Qualification'
    },
    {
      id: '5',
      name: 'Training Program',
      company: 'Acme Corp',
      value: '$30K',
      probability: 65,
      stage: 'Proposal'
    },
    {
      id: '6',
      name: 'API Development',
      company: 'TechStart Inc',
      value: '$95K',
      probability: 40,
      stage: 'Qualification'
    }
  ];

  constructor(private crmApp: CrmApp) {}

  getOpportunitiesForStage(stageName: string) {
    return this.opportunities.filter(opp => opp.stage === stageName);
  }

  OpenOpportunityInNewTab(opportunity: any): void {
    this.crmApp.RequestNewTab(
      `Deal: ${opportunity.name}`,
      `/crm/opportunity/${opportunity.id}`,
      { opportunityId: opportunity.id, opportunity }
    );
  }
}
