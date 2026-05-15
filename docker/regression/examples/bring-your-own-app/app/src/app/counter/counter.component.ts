import { Component, signal } from '@angular/core';

/**
 * Counter component.
 *
 * INTENTIONAL BUG #1: the "+1" button decrements the counter instead of incrementing it.
 * Test T01-counter-increment.json expects the count to go UP when the user clicks "+1";
 * the test should fail because this implementation goes DOWN.
 */
@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <div class="container">
      <h1>Counter</h1>
      <p>Click "+1" to increment the counter.</p>
      <div class="count" data-testid="count">{{ count() }}</div>
      <button (click)="increment()" data-testid="increment-btn">+1</button>
    </div>
  `,
})
export class CounterComponent {
  readonly count = signal(0);

  increment(): void {
    // BUG: decrements instead of increments
    this.count.update(v => v - 1);
  }
}
