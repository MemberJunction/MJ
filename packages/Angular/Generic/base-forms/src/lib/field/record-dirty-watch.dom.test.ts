import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { ChangeDetectorRef } from '@angular/core';
import { FormFieldEditCoordinator } from '../form-field-edit.coordinator';
import { MjFormFieldComponent } from './form-field.component';
import {
  BaseEntity,
  type BaseEntityEvent,
  CompositeKey,
  type EntityFieldInfo,
  type EntityInfo,
  type IMetadataProvider,
  ValidationErrorInfo,
  ValidationErrorType,
  ValidationResult,
} from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

describe('Event-driven dirty state & form-field performance safeguards', () => {
  it('triggers change detection callback on FormFieldEditCoordinator edit events', () => {
    const coordinator = new FormFieldEditCoordinator();
    const markForCheck = vi.fn();
    const destroy$ = new Subject<void>();

    coordinator.Edited$.subscribe(() => markForCheck());

    coordinator.Notify({ FieldName: 'Status' });
    expect(markForCheck).toHaveBeenCalledTimes(1);

    coordinator.Notify({ FieldName: 'Name' });
    expect(markForCheck).toHaveBeenCalledTimes(2);

    destroy$.next();
  });

  it('triggers change detection on matching BaseEntity events via CompositeKey.Equals', () => {
    const markForCheck = vi.fn();
    const mockRecord = {
      PrimaryKey: new CompositeKey([{ FieldName: 'ID', Value: '11111111-2222-3333-4444-555555555555' }]),
      EntityInfo: { Name: 'Customers' },
      Dirty: true,
    } as unknown as BaseEntity;

    const sub = MJGlobal.Instance.GetEventListener(false).subscribe((e) => {
      if (e.eventCode !== BaseEntity.BaseEventCode) return;
      const entityEvt = e.args as BaseEntityEvent | undefined;
      if (!entityEvt) return;
      if (entityEvt.baseEntity === mockRecord) {
        markForCheck();
      } else if (entityEvt.baseEntity && entityEvt.entityName === mockRecord.EntityInfo?.Name) {
        if (entityEvt.baseEntity.PrimaryKey?.HasValue && mockRecord.PrimaryKey?.HasValue && entityEvt.baseEntity.PrimaryKey.Equals(mockRecord.PrimaryKey)) {
          markForCheck();
        }
      }
    });

    // Unrelated entity event
    MJGlobal.Instance.RaiseEvent({
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: {
        type: 'save',
        entityName: 'Orders',
        baseEntity: {
          PrimaryKey: new CompositeKey([{ FieldName: 'ID', Value: '99999999-9999-9999-9999-999999999999' }]),
          EntityInfo: { Name: 'Orders' },
        } as unknown as BaseEntity,
      } as BaseEntityEvent,
      component: {},
    });
    expect(markForCheck).not.toHaveBeenCalled();

    // Matching record via case-differing UUID
    MJGlobal.Instance.RaiseEvent({
      event: MJEventType.ComponentEvent,
      eventCode: BaseEntity.BaseEventCode,
      args: {
        type: 'save',
        entityName: 'Customers',
        baseEntity: {
          PrimaryKey: new CompositeKey([{ FieldName: 'ID', Value: '11111111-2222-3333-4444-555555555555'.toUpperCase() }]),
          EntityInfo: { Name: 'Customers' },
        } as unknown as BaseEntity,
      } as BaseEntityEvent,
      component: {},
    });
    expect(markForCheck).toHaveBeenCalledTimes(1);

    sub.unsubscribe();
  });

  it('preserves subclass Record.Validate() custom cross-field rules in MjFormFieldComponent.runFieldValidation', () => {
    const fieldComp = Object.create(MjFormFieldComponent.prototype) as MjFormFieldComponent;
    const internals = fieldComp as unknown as {
      Record: BaseEntity;
      EditMode: boolean;
      FieldName: string;
      _fieldErrors: ValidationErrorInfo[];
      cdr: Pick<ChangeDetectorRef, 'markForCheck'>;
      runFieldValidation: () => void;
    };

    const crossFieldResult = new ValidationResult();
    crossFieldResult.Success = false;
    crossFieldResult.Errors.push(
      new ValidationErrorInfo('EndDate', 'EndDate must be after StartDate', null, ValidationErrorType.Failure),
      new ValidationErrorInfo('OtherField', 'Unrelated error', null, ValidationErrorType.Failure),
    );

    internals.Record = {
      Validate: vi.fn(() => crossFieldResult),
    } as unknown as BaseEntity;
    internals.EditMode = true;
    internals.FieldName = 'EndDate';
    internals._fieldErrors = [];
    internals.cdr = { markForCheck: vi.fn() };

    internals.runFieldValidation();

    expect(internals._fieldErrors).toHaveLength(1);
    expect(internals._fieldErrors[0].Source).toBe('EndDate');
    expect(internals._fieldErrors[0].Message).toBe('EndDate must be after StartDate');
  });

  it('caches FKDisplayName across UUID case differences and drops out-of-order stale FK responses', async () => {
    const fieldComp = Object.create(MjFormFieldComponent.prototype) as MjFormFieldComponent;
    const uuidLower = 'abcdef01-2345-6789-abcd-ef0123456789';
    const uuidUpper = uuidLower.toUpperCase();
    const uuidSecond = '11111111-2222-3333-4444-555555555555';

    let currentValue = uuidLower;
    const resolvers: Array<(name: string) => void> = [];
    const getEntityRecordName = vi.fn((_entityName: string, _pk: CompositeKey) => {
      return new Promise<string>((resolve) => {
        resolvers.push(resolve);
      });
    });

    const relatedEntityInfo = {
      Name: 'Accounts',
      FirstPrimaryKey: { Name: 'ID' },
    } as unknown as EntityInfo;

    const fieldInfo = {
      Name: 'AccountID',
      RelatedEntity: 'Accounts',
      RelatedEntityFieldName: 'ID',
      RelatedEntityNameFieldMap: '',
      EntityIDFieldName: '',
    } as unknown as EntityFieldInfo;

    Object.defineProperty(fieldComp, 'Value', {
      get: () => currentValue,
      configurable: true,
    });
    Object.defineProperty(fieldComp, 'FieldInfo', {
      get: () => fieldInfo,
      configurable: true,
    });
    Object.defineProperty(fieldComp, 'ProviderToUse', {
      get: () => ({
        Entities: [relatedEntityInfo],
        EntityByName: () => relatedEntityInfo,
        GetEntityRecordName: getEntityRecordName,
      }) as unknown as IMetadataProvider,
      configurable: true,
    });

    const internals = fieldComp as unknown as {
      Record: BaseEntity;
      _destroyed: boolean;
      _fkResolveSeq: number;
      cdr: Pick<ChangeDetectorRef, 'markForCheck' | 'detectChanges'>;
      getRelatedEntityInfo: () => EntityInfo;
    };
    internals.Record = {
      EntityInfo: { IsFieldReadableByUser: () => true },
      Get: () => null,
    } as unknown as BaseEntity;
    internals._destroyed = false;
    internals._fkResolveSeq = 0;
    internals.cdr = { markForCheck: vi.fn(), detectChanges: vi.fn() };
    internals.getRelatedEntityInfo = () => relatedEntityInfo;

    // First read kicks off GetEntityRecordName once
    expect(fieldComp.FKDisplayName).toBeNull();
    expect(getEntityRecordName).toHaveBeenCalledTimes(1);

    // Resolve first request
    resolvers[0]('Acme Corp');
    await Promise.resolve();
    expect(fieldComp.FKDisplayName).toBe('Acme Corp');

    // Changing only UUID casing MUST reuse cached 'Acme Corp' without a new network call
    currentValue = uuidUpper;
    expect(fieldComp.FKDisplayName).toBe('Acme Corp');
    expect(getEntityRecordName).toHaveBeenCalledTimes(1);

    // Now test out-of-order race protection: start lookup #2, then immediately switch to #3
    currentValue = uuidSecond;
    expect(fieldComp.FKDisplayName).toBeNull();
    expect(getEntityRecordName).toHaveBeenCalledTimes(2);

    const uuidThird = '99999999-8888-7777-6666-555555555555';
    currentValue = uuidThird;
    expect(fieldComp.FKDisplayName).toBeNull();
    expect(getEntityRecordName).toHaveBeenCalledTimes(3);

    // Resolve #3 first ('Newest Account'), then late-resolve #2 ('Stale Account')
    resolvers[2]('Newest Account');
    await Promise.resolve();
    expect(fieldComp.FKDisplayName).toBe('Newest Account');

    resolvers[1]('Stale Account');
    await Promise.resolve();
    expect(fieldComp.FKDisplayName).toBe('Newest Account');
  });
});
