import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-dashboards';

/**
 * This is a very simple demo dashboard that allows the user to change the text color to a random
 * color by clicking a button. This demo illustrates the use of the Config property of the parent
 * class and setting/getting the UserState object within the Config property to persist state. In this
 * simple example we're simply persisting the last color the user randomly generated and displaying
 * it if we have a prior persisted value, otherwise we generate a new random color on initialization 
 * and persist it.
 * 
 * For this dashboard to show up in the app UI you must create a record in the `Dashboard User Preferences` entity
 */
@Component({
  selector: 'mj-hello-dashboard',
  templateUrl: './hello-dashboard.component.html',
  styleUrls: ['./hello-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'HelloDemo')
export class HelloDashboardComponent extends BaseDashboard {
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

  // Current text color
  protected textColor: string = this.colors[0]; // Default to the first color
  
  protected override initDashboard(): void {
    // Nothing special to initialize
    if (this.Config?.userState?.lastColor) {
      // there is a saved user state for the last color, use it
      this.textColor = this.Config.userState.lastColor;
    }
    else {
      this.setRandomColor();
    }
  }

  /**
   * In this demo dashboard, there is no data to load for this simple dashboard from the database. 
   * In a real dashboard, you would utilize other MJ objects such as @see Metadata @see BaseEntity sub-classes from the 
   * @see Metadata.GetEntityObject methdo, and @see RunView etc
   */
  protected override loadData(): void {
  }

  /**
   * Change the text color to a random fun color
   */
  changeColor(): void {
    this.setRandomColor();

    // This is how to emit a custom event
    // Emit interaction event for tracking
    this.Interaction.emit({ type: 'colorChange', color: this.textColor });

    // This is how we tell the container component to persist a change
    // in the user state for this user. When the component is initialized
    // in the future the state object is deserialized and provided back to 
    // us as @see this.Config.UserState

    // Create a state variable and make it an object with whatever JSON structure we want
    const theUserState =  {
        lastColor: this.textColor
    };
    // Then emit the event to tell our container that the user state changed and pass it along
    // the container component is responsible for actually persisting the user state and associating
    // it with this dashboard for this user, we'll get back the state via our Config.userState property
    // next time we load.
    this.UserStateChanged.emit(theUserState);
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