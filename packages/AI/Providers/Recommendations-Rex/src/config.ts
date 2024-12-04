import env from 'env-var';

export const REX_API_HOST: string = env.get('REX_API_HOST').asString();
export const REX_RECOMMEND_HOST: string = env.get('REX_RECOMMEND_HOST').asString();
export const REX_USERNAME: string = env.get('REX_USERNAME').asString();
export const REX_PASSWORD: string = env.get('REX_PASSWORD').asString();
export const REX_API_KEY: string = env.get('REX_API_KEY').asString();

//Note that higher values may run into timeout issues when calling the Rex API
export const REX_BATCH_SIZE: number = env.get('REX_BATCH_SIZE').default(100).asInt();