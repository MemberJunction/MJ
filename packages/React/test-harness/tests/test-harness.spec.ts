import { ReactTestHarness } from '../src/lib/test-harness';
import { AssertionHelpers } from '../src/lib/assertion-helpers';

describe('ReactTestHarness', () => {
  let harness: ReactTestHarness;

  beforeEach(() => {
    harness = new ReactTestHarness({ headless: true });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('should initialize browser context', async () => {
    await harness.initialize();
    // If no error is thrown, initialization was successful
    expect(true).toBe(true);
  });

  it('should execute simple component', async () => {
    const result = await harness.testComponent(`
      const Component = () => <div>Hello Test</div>;
    `);

    expect(result.success).toBe(true);
    expect(result.html).toContain('Hello Test');
    expect(result.errors).toHaveLength(0);
  });

  it('should pass props to component', async () => {
    const result = await harness.testComponent(`
      const Component = ({ message, count }) => (
        <div>
          <p>{message}</p>
          <span>Count: {count}</span>
        </div>
      );
    `, { message: 'Test Message', count: 42 });

    expect(result.success).toBe(true);
    expect(AssertionHelpers.containsText(result.html, 'Test Message')).toBe(true);
    expect(AssertionHelpers.containsText(result.html, 'Count: 42')).toBe(true);
  });

  it('should capture console output', async () => {
    const result = await harness.testComponent(`
      const Component = () => {
        console.log('Test log message');
        console.error('Test error message');
        return <div>Console Test</div>;
      };
    `);

    const logs = result.console.filter(c => c.type === 'log');
    const errors = result.console.filter(c => c.type === 'error');

    expect(logs).toHaveLength(1);
    expect(logs[0].text).toContain('Test log message');
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toContain('Test error message');
  });

  it('should detect rendering errors', async () => {
    const result = await harness.testComponent(`
      const Component = () => {
        throw new Error('Render error');
      };
    `);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('AssertionHelpers', () => {
  it('should check for text content', () => {
    const html = '<div>Hello <span>World</span></div>';
    expect(AssertionHelpers.containsText(html, 'Hello World')).toBe(true);
    expect(AssertionHelpers.containsText(html, 'Goodbye')).toBe(false);
  });

  it('should check for elements by id', () => {
    const html = '<div id="test-id">Content</div>';
    expect(AssertionHelpers.hasElement(html, '#test-id')).toBe(true);
    expect(AssertionHelpers.hasElement(html, '#other-id')).toBe(false);
  });

  it('should check for elements by class', () => {
    const html = '<div class="test-class other-class">Content</div>';
    expect(AssertionHelpers.hasElement(html, '.test-class')).toBe(true);
    expect(AssertionHelpers.hasElement(html, '.other-class')).toBe(true);
    expect(AssertionHelpers.hasElement(html, '.missing-class')).toBe(false);
  });

  it('should count elements', () => {
    const html = '<ul><li>1</li><li>2</li><li>3</li></ul>';
    expect(AssertionHelpers.countElements(html, 'li')).toBe(3);
    expect(AssertionHelpers.countElements(html, 'ul')).toBe(1);
    expect(AssertionHelpers.countElements(html, 'div')).toBe(0);
  });

  it('should check attributes', () => {
    const html = '<button type="submit" disabled>Click</button>';
    expect(AssertionHelpers.hasAttribute(html, 'button', 'type', 'submit')).toBe(true);
    expect(AssertionHelpers.hasAttribute(html, 'button', 'disabled')).toBe(true);
    expect(AssertionHelpers.hasAttribute(html, 'button', 'onclick')).toBe(false);
  });

  it('should create matcher object', () => {
    const html = '<div id="test"><h1>Title</h1><p>Content</p></div>';
    const matcher = AssertionHelpers.createMatcher(html);

    expect(() => matcher.toContainText('Title')).not.toThrow();
    expect(() => matcher.toHaveElement('#test')).not.toThrow();
    expect(() => matcher.toHaveElementCount('p', 1)).not.toThrow();
    
    expect(() => matcher.toContainText('Missing')).toThrow();
    expect(() => matcher.toHaveElement('#missing')).toThrow();
    expect(() => matcher.toHaveElementCount('p', 2)).toThrow();
  });
});