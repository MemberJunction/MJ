import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import env from 'env-var';


export const ServerPort = env.get('PORT').default('3999').asPortNumber();

/** @deprecated Use {@link ServerPort}. */
export const ___serverPort = ServerPort;
