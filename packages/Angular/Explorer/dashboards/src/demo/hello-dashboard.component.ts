import { Component } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';

@Component({
  selector: 'mj-hello-dashboard',
  templateUrl: './hello-dashboard.component.html',
  styleUrls: ['./hello-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'HelloDemo')
export class HelloDashboardComponent extends BaseDashboard {
  // Current text color
  textColor: string = '#FF5733';
  
  // Available fun colors
  private colors: string[] = [
    '#FF5733', // Coral
    '#33FF57', // Lime
    '#3357FF', // Blue
    '#F033FF', // Magenta
    '#FF33A6', // Pink
    '#33FFF6', // Cyan
    '#FFD133', // Gold
    '#9C33FF', // Purple
    '#FF8C33'  // Orange
  ];

  protected override initDashboard(): void {
    // Nothing special to initialize
    this.setRandomColor();
  }

  protected override loadData(): void {
    // No data to load for this simple dashboard
  }

  /**
   * Change the text color to a random fun color
   */
  changeColor(): void {
    this.setRandomColor();
    // Emit interaction event for tracking
    this.Interaction.emit({ type: 'colorChange', color: this.textColor });
  }

  /**
   * Set a random color from our colors array
   */
  private setRandomColor(): void {
    // Get current color
    const currentColor = this.textColor;
    
    // Keep picking a random color until we get a different one
    let newColor: string;
    do {
      const randomIndex = Math.floor(Math.random() * this.colors.length);
      newColor = this.colors[randomIndex];
    } while (newColor === currentColor && this.colors.length > 1);
    
    this.textColor = newColor;
  }
}

export function LoadHelloDashboard() {
  // does nothing, point is to prevent tree-shaking
}