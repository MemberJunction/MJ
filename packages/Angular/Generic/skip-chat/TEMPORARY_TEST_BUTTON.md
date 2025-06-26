# Temporary Test Button Added to Skip Chat Component

## What was added:

1. **HTML Template** (`skip-chat.component.html`):
   - Added a red test button with a flask icon (fa-flask) after the sharing button
   - The button has inline styling with red background and white text
   - Located at lines 150-154

2. **TypeScript Component** (`skip-chat.component.ts`):
   - Added `testButtonClick()` method at line 2225
   - The method logs to console and shows an alert
   - Also logs current conversation state, message count, and selected artifact

3. **Button Count Logic**:
   - Updated `NumVisibleButtons` getter to include the test button in the count
   - This ensures proper margin calculation for the button area

## How to use:
1. The test button will appear as a red button with a flask icon in the Skip Chat interface
2. Click it to trigger the test functionality
3. Check the browser console for logged information

## To remove:
1. Remove the button HTML from lines 150-154 in `skip-chat.component.html`
2. Remove the `testButtonClick()` method from lines 2222-2234 in `skip-chat.component.ts`
3. Remove the `count++` line and comment from the `NumVisibleButtons` getter (lines 1947-1948)

## Files modified:
- `/packages/Angular/Generic/skip-chat/src/lib/skip-chat/skip-chat.component.html`
- `/packages/Angular/Generic/skip-chat/src/lib/skip-chat/skip-chat.component.ts`