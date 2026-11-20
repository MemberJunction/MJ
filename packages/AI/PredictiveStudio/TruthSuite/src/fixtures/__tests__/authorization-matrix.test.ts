/**
 * The A-FV-AUTHZ grant matrix (Task M5b.2): every case still mirrors a case of MJServer's authorization test (D4-52),
 * the matrix covers the cells §5.8.4 names, and seeding writes a case's tree parents-first with each role once.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { AuthorizationMatrix, type AuthorizationMatrixWriter, type MatrixGrantType, type MatrixUserType } from '../authorization-matrix';

const mirrored = readFileSync(new URL(`../../../../../../../${AuthorizationMatrix.MirroredTestFile}`, import.meta.url), 'utf8').replace(/\\'/g, "'");

/** A writer that records every write and hands out sequential IDs. */
class RecordingWriter implements AuthorizationMatrixWriter {
  public readonly Writes: string[] = [];
  private next = 0;
  private id(kind: string, detail: string): string {
    const id = `${kind}-${this.next++}`;
    this.Writes.push(`${id} ${detail}`);
    return id;
  }
  public async CreateAuthorization(name: string, parentId: string | null, isActive: boolean): Promise<string> { return this.id('auth', `${name} parent=${parentId} active=${isActive}`); }
  public async CreateRole(name: string): Promise<string> { return this.id('role', name); }
  public async CreateUser(name: string, email: string, type: MatrixUserType): Promise<string> { return this.id('user', `${email} ${type}`); }
  public async AddUserRole(userId: string, roleId: string): Promise<string> { return this.id('userrole', `${userId}->${roleId}`); }
  public async Grant(authorizationId: string, roleId: string, type: MatrixGrantType): Promise<string> { return this.id('grant', `${authorizationId} ${roleId} ${type}`); }
}

describe('AuthorizationMatrix', () => {
  it.each(AuthorizationMatrix.Cases)('$Name mirrors a case of actionAuthorization.test.ts ($Mirrors)', (c) => {
    expect(mirrored).toContain(`it('${c.Mirrors}'`);
  });

  it('covers an Owner, a Deny on the leaf and on an ancestor, a three-level chain, inactive leaves and parents, two roles and no grant', () => {
    const names = AuthorizationMatrix.Cases.map((c) => c.Name).join('\n');
    for (const cell of ['Owner', 'Deny on the linked', 'Deny on an ancestor', 'three-level', 'inactive leaf', 'inactive parent', 'two roles', 'no grant']) {
      expect(names).toContain(cell);
    }
    expect(AuthorizationMatrix.Cases.filter((c) => c.Expected).length).toBeGreaterThan(0);
    expect(AuthorizationMatrix.Cases.filter((c) => !c.Expected).length).toBeGreaterThan(0);
  });

  it('seeds a case parents first, each role once, and returns the user and the linked authorization', async () => {
    const c = AuthorizationMatrix.Cases.find((x) => x.Name.startsWith('a three-level chain granted at the root with a Deny'));
    if (!c) throw new Error('the matrix lost its three-level Deny case');
    const writer = new RecordingWriter();
    const seeded = await AuthorizationMatrix.Seed(writer, c, 'TAG');
    expect(writer.Writes.slice(0, 3)).toEqual([
      expect.stringMatching(/^auth-0 TAG c\d+ root parent=null active=true$/),
      'auth-1 ' + `TAG c${AuthorizationMatrix.Cases.indexOf(c)} mid parent=auth-0 active=true`,
      'auth-2 ' + `TAG c${AuthorizationMatrix.Cases.indexOf(c)} leaf parent=auth-1 active=true`,
    ]);
    expect(writer.Writes.filter((w) => w.startsWith('role-'))).toHaveLength(2);
    expect(writer.Writes.filter((w) => w.startsWith('grant-'))).toHaveLength(2);
    expect(seeded).toEqual({ UserID: expect.stringMatching(/^user-/), AuthorizationID: 'auth-2' });
  });

  it('refuses a case that names a key it does not define', async () => {
    const broken = { ...AuthorizationMatrix.Cases[2], Linked: 'missing' };
    await expect(AuthorizationMatrix.Seed(new RecordingWriter(), broken, 'TAG')).rejects.toThrow(/linked authorization 'missing'/);
  });
});
