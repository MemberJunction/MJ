import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

// Import Kendo types
import { ChipThemeColor } from '@progress/kendo-angular-buttons';
import { BadgeThemeColor, BadgeAlign } from '@progress/kendo-angular-indicators';

@Component({
  selector: 'mj-style-guide-test',
  templateUrl: './style-guide-test.component.html',
  styleUrls: ['./style-guide-test.component.css']
})
export class StyleGuideTestComponent {
  // Sample data for demonstrations
  public sampleItems = [
    { name: 'Analytics Dashboard', description: 'View comprehensive analytics and metrics', icon: 'fa-chart-line', color: 'primary' as ChipThemeColor },
    { name: 'User Management', description: 'Manage users and permissions', icon: 'fa-users', color: 'info' as ChipThemeColor },
    { name: 'System Settings', description: 'Configure application settings', icon: 'fa-cog', color: 'warning' as ChipThemeColor },
    { name: 'Reports', description: 'Generate and view reports', icon: 'fa-file-alt', color: 'success' as ChipThemeColor }
  ];

  // Enhanced grid data with avatars
  public gridData = [
    { id: 1, name: 'John Anderson', email: 'john.anderson@company.com', department: 'Engineering', status: 'Active', role: 'Senior Developer' },
    { id: 2, name: 'Sarah Mitchell', email: 'sarah.mitchell@company.com', department: 'Design', status: 'Active', role: 'UI/UX Lead' },
    { id: 3, name: 'Michael Chen', email: 'michael.chen@company.com', department: 'Marketing', status: 'Pending', role: 'Marketing Manager' },
    { id: 4, name: 'Emily Rodriguez', email: 'emily.rodriguez@company.com', department: 'Sales', status: 'Inactive', role: 'Sales Representative' },
    { id: 5, name: 'David Park', email: 'david.park@company.com', department: 'Operations', status: 'Active', role: 'Operations Manager' }
  ];

  // Dropdown data
  public departments = [
    { id: 1, name: 'Engineering', icon: 'fa fa-code' },
    { id: 2, name: 'Design', icon: 'fa fa-paint-brush' },
    { id: 3, name: 'Marketing', icon: 'fa fa-bullhorn' },
    { id: 4, name: 'Sales', icon: 'fa fa-dollar-sign' },
    { id: 5, name: 'Operations', icon: 'fa fa-cogs' }
  ];

  public technologies = ['JavaScript', 'TypeScript', 'Angular', 'React', 'Vue.js', 'Node.js'];
  public phases = ['Planning', 'Design', 'Development', 'Testing', 'Deployment', 'Maintenance'];
  public themeOptions = ['Light', 'Dark', 'Auto'];

  // Form group
  public formGroup: FormGroup;

  // State variables
  public isModalOpen = false;
  public isConfirmModalOpen = false;
  public isKendoDialogOpen = false;
  public selectedTab = 0;
  public selectedDepartment = this.departments[0];
  public selectedTechnologies: string[] = ['Angular', 'TypeScript'];
  public selectedTheme = 'Light';
  public searchText = '';
  public progressValue = 65;
  public dateValue = new Date();

  // Notification counter
  public notificationCount = 5;

  // Badge align values
  public badgeAlignTopEnd: BadgeAlign = { horizontal: 'end', vertical: 'top' };
  public badgeAlignBottomEnd: BadgeAlign = { horizontal: 'end', vertical: 'bottom' };

  constructor() {
    this.formGroup = new FormGroup({
      fullName: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      department: new FormControl(null),
      comments: new FormControl('')
    });
  }

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

  public openKendoDialog(): void {
    this.isKendoDialogOpen = true;
  }

  public closeKendoDialog(): void {
    this.isKendoDialogOpen = false;
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

  // Get Kendo theme color for status
  public getStatusThemeColor(status: string): BadgeThemeColor {
    switch (status.toLowerCase()) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'info';
    }
  }

  // Get Font Awesome icon for status
  public getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'active':
        return 'fa fa-check-circle';
      case 'inactive':
        return 'fa fa-times-circle';
      case 'pending':
        return 'fa fa-clock';
      default:
        return 'fa fa-info-circle';
    }
  }

  public handleCardClick(item: any): void {
    console.log('Card clicked:', item);
    // Could open a detail view or dialog
  }

  public handleButtonClick(action: string, item?: any): void {
    console.log('Button clicked:', action, item);
  }

  // Form submission
  public submitForm(): void {
    if (this.formGroup.valid) {
      console.log('Form submitted:', this.formGroup.value);
      this.closeKendoDialog();
    }
  }

  // Simulate data loading
  public loadData(): void {
    this.progressValue = 0;
    const interval = setInterval(() => {
      this.progressValue += 10;
      if (this.progressValue >= 100) {
        clearInterval(interval);
      }
    }, 200);
  }

  // Get initials from name
  public getInitials(name: string): string {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  // Grid actions
  public editItem(dataItem: any): void {
    console.log('Edit item:', dataItem);
    this.openKendoDialog();
  }

  public deleteItem(dataItem: any): void {
    console.log('Delete item:', dataItem);
    this.openConfirmModal();
  }

  // Helper methods for form controls
  public get fullNameControl(): FormControl {
    return this.formGroup.get('fullName') as FormControl;
  }

  public get emailControl(): FormControl {
    return this.formGroup.get('email') as FormControl;
  }

  public get departmentControl(): FormControl {
    return this.formGroup.get('department') as FormControl;
  }

  public get commentsControl(): FormControl {
    return this.formGroup.get('comments') as FormControl;
  }
}
