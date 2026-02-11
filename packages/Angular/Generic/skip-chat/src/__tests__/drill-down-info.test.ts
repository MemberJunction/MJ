import { describe, it, expect } from 'vitest';
import { DrillDownInfo } from '../lib/drill-down-info';

describe('DrillDownInfo', () => {
  it('should create with entity name and filter', () => {
    const info = new DrillDownInfo('Users', "Status='Active'");
    expect(info.EntityName).toBe('Users');
    expect(info.Filter).toBe("Status='Active'");
    expect(info.BaseFilter).toBe('');
  });

  describe('UserViewGridParams', () => {
    it('should return filter as ExtraFilter when no BaseFilter', () => {
      const info = new DrillDownInfo('Users', "Status='Active'");
      const params = info.UserViewGridParams;
      expect(params.EntityName).toBe('Users');
      expect(params.ExtraFilter).toBe("Status='Active'");
    });

    it('should combine Filter and BaseFilter with AND', () => {
      const info = new DrillDownInfo('Users', "Status='Active'");
      info.BaseFilter = "Type='Admin'";
      const params = info.UserViewGridParams;
      expect(params.ExtraFilter).toBe("(Status='Active') AND (Type='Admin')");
    });

    it('should ignore empty BaseFilter', () => {
      const info = new DrillDownInfo('Orders', "Total > 100");
      info.BaseFilter = '';
      const params = info.UserViewGridParams;
      expect(params.ExtraFilter).toBe("Total > 100");
    });

    it('should handle complex filters', () => {
      const info = new DrillDownInfo('Products', "Price > 10 AND Category='Food'");
      info.BaseFilter = "IsActive = 1";
      const params = info.UserViewGridParams;
      expect(params.ExtraFilter).toContain('AND');
      expect(params.ExtraFilter).toContain("Price > 10");
      expect(params.ExtraFilter).toContain("IsActive = 1");
    });
  });

  it('should allow setting properties after creation', () => {
    const info = new DrillDownInfo('Entity', 'f1');
    info.EntityName = 'NewEntity';
    info.Filter = 'f2';
    info.BaseFilter = 'bf';
    expect(info.EntityName).toBe('NewEntity');
    expect(info.Filter).toBe('f2');
    expect(info.BaseFilter).toBe('bf');
  });
});
