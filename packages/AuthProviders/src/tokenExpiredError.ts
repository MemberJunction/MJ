import { GraphQLError } from 'graphql';

export class TokenExpiredError extends GraphQLError {
  constructor(expiryDate: Date, message = 'The provided token has expired. Please authenticate again.') {
    super(message, {
      extensions: {
        code: 'JWT_EXPIRED',
        expiryDate: expiryDate.toISOString(),
      },
    });
  }
}
