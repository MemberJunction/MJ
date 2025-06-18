import { Component } from '@angular/core';

@Component({
  selector: 'mj-style-guide-test',
  templateUrl: './style-guide-test.component.html',
  styleUrls: ['./style-guide-test.component.css']
})
export class StyleGuideTestComponent {
  // Sample data for demonstrations
  public sampleItems = [
    { name: 'Analytics Dashboard', description: 'View comprehensive analytics and metrics', icon: 'fa-chart-line' },
    { name: 'User Management', description: 'Manage users and permissions', icon: 'fa-users' },
    { name: 'System Settings', description: 'Configure application settings', icon: 'fa-cog' },
    { name: 'Reports', description: 'Generate and view reports', icon: 'fa-file-alt' }
  ];

  public tableData = [
    { id: 1, name: 'John Anderson', email: 'john.anderson@company.com', department: 'Engineering', status: 'Active' },
    { id: 2, name: 'Sarah Mitchell', email: 'sarah.mitchell@company.com', department: 'Design', status: 'Active' },
    { id: 3, name: 'Michael Chen', email: 'michael.chen@company.com', department: 'Marketing', status: 'Pending' },
    { id: 4, name: 'Emily Rodriguez', email: 'emily.rodriguez@company.com', department: 'Sales', status: 'Inactive' }
  ];

  public isModalOpen = false;
  public isConfirmModalOpen = false;
  public isKendoDialogOpen = false;
  public selectedTab = 0;

  // Modal methods
  public openModal(): void {
    this.isModalOpen = true;
  }

  public closeModal(): void {
    this.isModalOpen = false;
  }

  public openConfirmModal(): void {
    this.isConfirmModalOpen = true;
  }

  public closeConfirmModal(): void {
    this.isConfirmModalOpen = false;
  }

  // Utility methods
  public getStatusBadgeClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'active':
        return 'badge badge-success';
      case 'inactive':
        return 'badge badge-danger';
      case 'pending':
        return 'badge badge-primary';
      default:
        return 'badge';
    }
  }

  public handleCardClick(item: any): void {
    console.log('Card clicked:', item);
  }

  public handleButtonClick(action: string): void {
    console.log('Button clicked:', action);
  }

  public openKendoDialog(): void {
    this.isKendoDialogOpen = true;
  }

  public closeKendoDialog(): void {
    this.isKendoDialogOpen = false;
  }
}
