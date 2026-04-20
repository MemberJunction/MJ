import { describe, it, expect } from 'vitest';
import {
  BaseFormComponentEventCodes,
  BaseFormComponentEvent,
  FormEditingCompleteEvent,
  PendingRecordItem
} from '../types';

describe('BaseFormComponentEventCodes', () => {
  it('should define BASE_CODE constant', () => {
    expect(BaseFormComponentEventCodes.BASE_CODE).toBe('BaseFormComponent_Event');
  });

  it('should define EDITING_COMPLETE constant', () => {
    expect(BaseFormComponentEventCodes.EDITING_COMPLETE).toBe('EDITING_COMPLETE');
  });

  it('should define REVERT_PENDING_CHANGES constant', () => {
    expect(BaseFormComponentEventCodes.REVERT_PENDING_CHANGES).toBe('REVERT_PENDING_CHANGES');
  });

  it('should define POPULATE_PENDING_RECORDS constant', () => {
    expect(BaseFormComponentEventCodes.POPULATE_PENDING_RECORDS).toBe('POPULATE_PENDING_RECORDS');
  });
});

describe('BaseFormComponentEvent', () => {
  it('should create an instance with required properties', () => {
    const event = new BaseFormComponentEvent();
    expect(event).toBeInstanceOf(BaseFormComponentEvent);
    expect(event.subEventCode).toBeUndefined();
    expect(event.elementRef).toBeUndefined();
    expect(event.returnValue).toBeUndefined();
  });

  it('should allow setting properties', () => {
    const event = new BaseFormComponentEvent();
    event.subEventCode = 'TEST_CODE';
    event.elementRef = { nativeElement: {} };
    event.returnValue = 42;
    expect(event.subEventCode).toBe('TEST_CODE');
    expect(event.returnValue).toBe(42);
  });
});

describe('FormEditingCompleteEvent', () => {
  it('should create an instance extending BaseFormComponentEvent', () => {
    const event = new FormEditingCompleteEvent();
    expect(event).toBeInstanceOf(BaseFormComponentEvent);
    expect(event).toBeInstanceOf(FormEditingCompleteEvent);
  });

  it('should have EDITING_COMPLETE as default subEventCode', () => {
    const event = new FormEditingCompleteEvent();
    expect(event.subEventCode).toBe(BaseFormComponentEventCodes.EDITING_COMPLETE);
  });

  it('should initialize pendingChanges as empty array', () => {
    const event = new FormEditingCompleteEvent();
    expect(event.pendingChanges).toEqual([]);
    expect(Array.isArray(event.pendingChanges)).toBe(true);
  });
});

describe('PendingRecordItem', () => {
  it('should create with default save action', () => {
    const item = new PendingRecordItem();
    expect(item.action).toBe('save');
  });

  it('should allow setting action to delete', () => {
    const item = new PendingRecordItem();
    item.action = 'delete';
    expect(item.action).toBe('delete');
  });
});
