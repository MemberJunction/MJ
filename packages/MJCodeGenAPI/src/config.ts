import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import env from 'env-var';


export const ___serverPort = env.get('PORT').default('3999').asPortNumber();
