import { UserInfo } from '@memberjunction/core';

/**
 * Creates a mock UserInfo object for Storybook stories.
 * Used by components that require a currentUser input.
 */
export function createMockUserInfo(overrides?: Partial<UserInfo>): UserInfo {
  return {
    ID: 'mock-user-001',
    Name: 'Test User',
    FirstName: 'Test',
    LastName: 'User',
    Email: 'test.user@example.com',
    Type: 'User',
    LinkedRecordType: 'None',
    EmployeeID: '',
    LinkedEntityID: '',
    LinkedEntityRecordID: '',
    IsActive: true,
    ...overrides
  } as UserInfo;
}
