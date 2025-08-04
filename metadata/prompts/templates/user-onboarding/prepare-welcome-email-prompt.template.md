# Prepare Welcome Email

**CRITICAL**: You MUST respond with ONLY valid JSON. No conversational text, no explanations, no markdown formatting - ONLY the JSON object specified below.

You need to prepare a welcome email for the newly created user.

## User Information
From the payload, extract:
- Full Name: Use payload.createdUserName  
- Email: Use payload.userData.email
- First Name: Use payload.userData.firstName

## REQUIRED OUTPUT FORMAT

You MUST return ONLY this JSON structure with NO additional text. Replace the placeholder values with actual data:

{
  "emailSubject": "Welcome to MemberJunction - [FirstName]!",
  "emailBody": "Hi [FirstName],\n\nYour account has been successfully created. Here are your login details:\n\nEmail: [Email]\nLogin URL: https://app.memberjunction.com\n\nPlease use your email address to sign in. If you have any questions or need assistance, please don't hesitate to contact our support team.\n\nBest regards,\nThe MemberJunction Team",
  "prepared": true
}

Remember: Return ONLY the JSON object. No other text whatsoever.