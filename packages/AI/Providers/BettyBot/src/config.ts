import env from 'env-var';

export const BETTY_BOT_BASE_URL: string = env.get('BETTY_BOT_BASE_URL').default("https://betty-api.tasio.co/").asString();