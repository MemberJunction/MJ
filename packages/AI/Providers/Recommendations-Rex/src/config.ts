import env from 'env-var';

//default values simply use the developerment parameters rex providers in their docs
export const API_HOST: string = env.get('API_HOST').default("api-dev.rasa.io").asString();
export const REX_HOST: string = env.get('REX_HOST').default("recommend-dev.rasa.io").asString();
export const REX_USERNAME: string = env.get('REX_USERNAME').default("rex.test@rasa.io").asString();
export const REX_PASSWORD: string = env.get('REX_PASSWORD').default("rexRulesTheR00st!").asString();
export const REX_API_KEY: string = env.get('REX_API_KEY').default("9f889111-e3d3-458f-94c8-1862cc05acbe").asString();