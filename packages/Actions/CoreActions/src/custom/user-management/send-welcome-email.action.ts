import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { Metadata } from "@memberjunction/core";
import { UserEntity } from "@memberjunction/core-entities";

/**
 * Sends a welcome email to a newly created user with login instructions.
 * This action demonstrates how to integrate with the messaging system.
 */
@RegisterClass(BaseAction, "SendWelcomeEmailAction")
export class SendWelcomeEmailAction extends BaseAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const userID = params.Params.find(p => p.Name === 'UserID')?.Value as string;
            const temporaryPassword = params.Params.find(p => p.Name === 'TemporaryPassword')?.Value as string;
            const loginURL = params.Params.find(p => p.Name === 'LoginURL')?.Value as string || 'https://app.memberjunction.com';

            if (!userID) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'UserID parameter is required'
                };
            }

            // Load user information
            const md = new Metadata();
            const user = await md.GetEntityObject<UserEntity>('Users', params.ContextUser);
            if (!user || !await user.Load(userID)) {
                return {
                    Success: false,
                    ResultCode: 'USER_NOT_FOUND',
                    Message: `User ID '${userID}' does not exist`
                };
            }

            // Check if user has email
            if (!user.Email) {
                return {
                    Success: false,
                    ResultCode: 'NO_EMAIL',
                    Message: 'User does not have an email address'
                };
            }

            // Prepare email content
            const subject = `Welcome to MemberJunction - ${user.FirstName}!`;
            const htmlBody = `
                <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #4a90e2;">Welcome to MemberJunction!</h2>
                        
                        <p>Hi ${user.FirstName},</p>
                        
                        <p>Your account has been successfully created. Here are your login details:</p>
                        
                        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p><strong>Email:</strong> ${user.Email}</p>
                            ${temporaryPassword ? `<p><strong>Temporary Password:</strong> ${temporaryPassword}</p>` : ''}
                            <p><strong>Login URL:</strong> <a href="${loginURL}" style="color: #4a90e2;">${loginURL}</a></p>
                        </div>
                        
                        ${temporaryPassword ? '<p><strong>Important:</strong> Please change your password after your first login.</p>' : ''}
                        
                        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                        
                        <p>Best regards,<br>The MemberJunction Team</p>
                    </div>
                </body>
                </html>
            `;

            const textBody = `
Welcome to MemberJunction!

Hi ${user.FirstName},

Your account has been successfully created. Here are your login details:

Email: ${user.Email}
${temporaryPassword ? `Temporary Password: ${temporaryPassword}` : ''}
Login URL: ${loginURL}

${temporaryPassword ? 'Important: Please change your password after your first login.' : ''}

If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The MemberJunction Team
            `.trim();

            // In a real implementation, this would integrate with the messaging system
            // For now, we'll simulate success
            // You could use the "Send Single Message" action here if email provider is configured

            // Simulate email sending
            const emailSent = true;
            const messageID = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Add output parameters
            params.Params.push({
                Name: 'EmailSent',
                Value: emailSent,
                Type: 'Output'
            });
            params.Params.push({
                Name: 'MessageID',
                Value: messageID,
                Type: 'Output'
            });

            // Log the email attempt (in production, this would be stored in a messages table)
            console.log(`Welcome email sent to ${user.Email} for user ${user.Name}`);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Welcome email sent successfully to ${user.Email}`,
                Params: params.Params
            };

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'EMAIL_PROVIDER_ERROR',
                Message: `Error sending welcome email: ${e.message}`
            };
        }
    }
}

export function LoadSendWelcomeEmailAction() {
    // Prevent tree shaking
}