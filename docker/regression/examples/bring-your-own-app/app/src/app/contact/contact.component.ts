import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Contact form component.
 *
 * INTENTIONAL BUG #2: the Submit button is wired to a no-op handler. The user can fill
 * out the form and click Submit, but nothing happens — no success message appears,
 * no fields are cleared. Test T02-contact-form-submit.json expects a "Thanks!"
 * confirmation after submission; the test should fail because the submission silently
 * does nothing.
 */
@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="container">
      <h1>Contact Us</h1>
      <p>Fill out the form and click Submit to send us a message.</p>
      <form (submit)="$event.preventDefault(); onSubmit()">
        <label for="name">Name</label>
        <input id="name" name="name" type="text" [(ngModel)]="name" required>

        <label for="email">Email</label>
        <input id="email" name="email" type="email" [(ngModel)]="email" required>

        <label for="message">Message</label>
        <textarea id="message" name="message" rows="4" [(ngModel)]="message" required></textarea>

        <button type="submit" data-testid="submit-btn">Submit</button>
      </form>

      @if (submitted()) {
        <div class="message" data-testid="success-msg">Thanks! We'll be in touch.</div>
      }
    </div>
  `,
})
export class ContactComponent {
  name = '';
  email = '';
  message = '';
  readonly submitted = signal(false);

  onSubmit(): void {
    // BUG: should set submitted.set(true) to show the success message; does nothing instead.
    // The form never confirms the submission to the user.
  }
}
