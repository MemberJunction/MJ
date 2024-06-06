import { TemplateEngineService } from '@memberjunction/templates';

TestTemplates();
async function TestTemplates() {
    const templateEngine = new TemplateEngineService();  
  
    const template = `
      <h1>Hello, {{context.name}}!</h1>
    `;
  
    const renderedHtml = await templateEngine.render(template, { name: 'World' });
    console.log(renderedHtml);
  }