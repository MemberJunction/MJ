import dotenv from 'dotenv';
dotenv.config();

export const dbHost: string = process.env['DB_HOST']
export const dbPort: number = Number(process.env['DB_PORT']) || 1433;
export const dbDatabase: string = process.env['DB_DATABASE']
export const dbUsername: string = process.env['DB_USERNAME']
export const dbPassword: string = process.env['DB_PASSWORD']
export const apiKey: string = process.env['OPENAI_API_KEY'] || '';