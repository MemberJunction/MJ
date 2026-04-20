import { describe, it, expect } from 'vitest';
import { ContentItemParams, ContentSourceParams, ContentSourceTypeParams } from '../Engine/generic/content.types';
import { ProcessRunParams, ContentItemProcessParams, ContentItemProcessResults } from '../Engine/generic/process.types';
import type { JsonObject } from '../Engine/generic/process.types';

describe('ContentItemParams', () => {
  it('should create an instance with required fields', () => {
    const params = new ContentItemParams();
    params.contentSourceID = 'source-1';
    params.name = 'Test Item';
    params.ContentTypeID = 'type-1';
    params.ContentSourceTypeID = 'source-type-1';
    params.ContentFileTypeID = 'file-type-1';
    params.URL = 'https://example.com';

    expect(params.contentSourceID).toBe('source-1');
    expect(params.name).toBe('Test Item');
    expect(params.ContentTypeID).toBe('type-1');
    expect(params.ContentSourceTypeID).toBe('source-type-1');
    expect(params.ContentFileTypeID).toBe('file-type-1');
    expect(params.URL).toBe('https://example.com');
  });

  it('should have optional fields as undefined by default', () => {
    const params = new ContentItemParams();
    expect(params.description).toBeUndefined();
    expect(params.AIModelID).toBeUndefined();
    expect(params.minTags).toBeUndefined();
    expect(params.maxTags).toBeUndefined();
  });

  it('should allow setting optional fields', () => {
    const params = new ContentItemParams();
    params.description = 'A test description';
    params.AIModelID = 'model-1';
    params.minTags = 3;
    params.maxTags = 10;

    expect(params.description).toBe('A test description');
    expect(params.AIModelID).toBe('model-1');
    expect(params.minTags).toBe(3);
    expect(params.maxTags).toBe(10);
  });
});

describe('ContentSourceParams', () => {
  it('should create an instance with required fields', () => {
    const params = new ContentSourceParams();
    params.contentSourceID = 'source-1';
    params.ContentTypeID = 'type-1';
    params.ContentSourceTypeID = 'source-type-1';
    params.ContentFileTypeID = 'file-type-1';
    params.URL = 'https://example.com/feed';

    expect(params.contentSourceID).toBe('source-1');
    expect(params.ContentTypeID).toBe('type-1');
    expect(params.URL).toBe('https://example.com/feed');
  });

  it('should have optional fields as undefined by default', () => {
    const params = new ContentSourceParams();
    expect(params.name).toBeUndefined();
    expect(params.description).toBeUndefined();
    expect(params.AIModelID).toBeUndefined();
    expect(params.minTags).toBeUndefined();
    expect(params.maxTags).toBeUndefined();
  });

  it('should allow setting all fields', () => {
    const params = new ContentSourceParams();
    params.contentSourceID = 'source-1';
    params.name = 'RSS Feed';
    params.description = 'Daily news feed';
    params.ContentTypeID = 'type-1';
    params.ContentSourceTypeID = 'source-type-1';
    params.ContentFileTypeID = 'file-type-1';
    params.URL = 'https://example.com/feed';
    params.AIModelID = 'gpt-4';
    params.minTags = 5;
    params.maxTags = 15;

    expect(params.name).toBe('RSS Feed');
    expect(params.description).toBe('Daily news feed');
    expect(params.minTags).toBe(5);
    expect(params.maxTags).toBe(15);
  });
});

describe('ContentSourceTypeParams', () => {
  it('should create an instance with all fields', () => {
    const params = new ContentSourceTypeParams();
    params.contentSourceID = 'source-1';
    params.contentSourceTypeID = 'type-1';
    params.name = 'maxDepth';
    params.value = '3';
    params.type = 'number';

    expect(params.contentSourceID).toBe('source-1');
    expect(params.contentSourceTypeID).toBe('type-1');
    expect(params.name).toBe('maxDepth');
    expect(params.value).toBe('3');
    expect(params.type).toBe('number');
  });
});

describe('ProcessRunParams', () => {
  it('should create an instance with all fields', () => {
    const params = new ProcessRunParams();
    const start = new Date('2024-01-15T10:00:00Z');
    const end = new Date('2024-01-15T10:05:00Z');

    params.sourceID = 'source-1';
    params.startTime = start;
    params.endTime = end;
    params.numItemsProcessed = 42;

    expect(params.sourceID).toBe('source-1');
    expect(params.startTime).toBe(start);
    expect(params.endTime).toBe(end);
    expect(params.numItemsProcessed).toBe(42);
  });

  it('should allow zero items processed', () => {
    const params = new ProcessRunParams();
    params.numItemsProcessed = 0;
    expect(params.numItemsProcessed).toBe(0);
  });
});

describe('ContentItemProcessParams', () => {
  it('should create an instance with all fields', () => {
    const params = new ContentItemProcessParams();
    params.text = 'Sample content text';
    params.modelID = 'model-1';
    params.minTags = 3;
    params.maxTags = 10;
    params.contentItemID = 'item-1';
    params.contentTypeID = 'type-1';
    params.contentFileTypeID = 'file-type-1';
    params.contentSourceTypeID = 'source-type-1';

    expect(params.text).toBe('Sample content text');
    expect(params.modelID).toBe('model-1');
    expect(params.minTags).toBe(3);
    expect(params.maxTags).toBe(10);
    expect(params.contentItemID).toBe('item-1');
    expect(params.contentTypeID).toBe('type-1');
    expect(params.contentFileTypeID).toBe('file-type-1');
    expect(params.contentSourceTypeID).toBe('source-type-1');
  });
});

describe('ContentItemProcessResults', () => {
  it('should create an instance with all fields', () => {
    const results = new ContentItemProcessResults();
    const startTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T10:01:00Z');
    const pubDate = new Date('2024-01-10');

    results.title = 'Article Title';
    results.author = ['John Doe', 'Jane Smith'];
    results.publicationDate = pubDate;
    results.keywords = ['ai', 'machine-learning', 'nlp'];
    results.content_text = 'Full article text here';
    results.processStartTime = startTime;
    results.processEndTime = endTime;
    results.contentItemID = 'item-1';

    expect(results.title).toBe('Article Title');
    expect(results.author).toEqual(['John Doe', 'Jane Smith']);
    expect(results.publicationDate).toBe(pubDate);
    expect(results.keywords).toEqual(['ai', 'machine-learning', 'nlp']);
    expect(results.content_text).toBe('Full article text here');
    expect(results.processStartTime).toBe(startTime);
    expect(results.processEndTime).toBe(endTime);
    expect(results.contentItemID).toBe('item-1');
  });

  it('should handle empty arrays', () => {
    const results = new ContentItemProcessResults();
    results.author = [];
    results.keywords = [];

    expect(results.author).toEqual([]);
    expect(results.keywords).toEqual([]);
  });
});

describe('JsonObject interface', () => {
  it('should support arbitrary key-value pairs', () => {
    const obj: JsonObject = {
      title: 'Test',
      count: 42,
      nested: { key: 'value' },
      list: [1, 2, 3],
      isValid: true,
      empty: null,
    };

    expect(obj.title).toBe('Test');
    expect(obj.count).toBe(42);
    expect(obj.nested).toEqual({ key: 'value' });
    expect(obj.list).toEqual([1, 2, 3]);
    expect(obj.isValid).toBe(true);
    expect(obj.empty).toBeNull();
  });

  it('should support empty object', () => {
    const obj: JsonObject = {};
    expect(Object.keys(obj)).toHaveLength(0);
  });

  it('should support string values', () => {
    const obj: JsonObject = {
      contentItemID: 'item-1',
      title: 'A title',
      description: 'A description',
    };

    expect(typeof obj.contentItemID).toBe('string');
  });
});
