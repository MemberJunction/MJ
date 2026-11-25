// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJUserNotificationEntity } from '@memberjunction/core-entities';
import { ClassifyNotificationMessage, StripNotificationMarkdown, UserNotificationsComponent } from '../user-notifications.component';

/**
 * Wall-clock ceiling for the pathological-input check. It guards against catastrophic or polynomial
 * backtracking (seconds), not machine speed: tight millisecond bounds fail on shared CI runners
 * (v6.3.0-edge.0's publish gate failed one at 211 ms vs 200 ms).
 */
const PATHOLOGICAL_INPUT_CEILING_MS = 2000;

function createNotificationEntity(id: string, title: string, message: string): MJUserNotificationEntity {
  const info = new EntityInfo({
    Name: 'MJ: User Notifications',
    Status: 'Active',
    Fields: [
      { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Status: 'Active' },
      { Name: 'Title', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'Message', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'Unread', Type: 'bit', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'NotificationTypeID', Type: 'uniqueidentifier', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'ResourceTypeID', Type: 'uniqueidentifier', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'ResourceRecordID', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'ResourceConfiguration', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: '__mj_CreatedAt', Type: 'datetimeoffset', IsPrimaryKey: false, Status: 'Active' },
    ],
  });
  const entity = new MJUserNotificationEntity(info);
  entity.ID = id;
  entity.Title = title;
  entity.Message = message;
  entity.Unread = true;
  entity.ResourceTypeID = null;
  entity.ResourceRecordID = null;
  entity.ResourceConfiguration = null;
  return entity;
}

function createNotificationsComponent(notifications: MJUserNotificationEntity[]): UserNotificationsComponent {
  const component = Object.create(UserNotificationsComponent.prototype) as UserNotificationsComponent;
  Reflect.set(component, 'RadioSelected', 'All');
  Reflect.set(component, 'CurrentFilter', '');
  Reflect.set(component, 'SelectedTypeFilter', null);
  Reflect.set(component, 'groups', []);
  Reflect.set(component, 'groupsKey', '');
  Reflect.set(component, 'vmCache', new Map());
  Reflect.set(component, 'notificationsToShowKey', '');
  Reflect.set(component, 'notificationsToShowCache', []);
  Reflect.set(component, 'navigationService', {});
  Reflect.set(component, 'appManager', {});
  Object.defineProperty(component, 'AllNotifications', {
    get: () => notifications,
    configurable: true,
  });
  return component;
}

describe('ClassifyNotificationMessage & StripNotificationMarkdown — routine & in-app cards', () => {
  it('decodes apostrophes, double quotes, and ampersands in routine Markdown Body and Preview', () => {
    const raw = [
      '✅ **Elena&#39;s &quot;Northwind&quot; &amp; Co Brief** — Success',
      '',
      'Reviewed Q4 pipeline for Elena&#x27;s &quot;Enterprise&quot; &amp; Partners segment.',
    ].join('\n');

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Kind).toBe('markdown');
    expect(classified.Expandable).toBe(true);
    expect(classified.Body).toBe(
      ['✅ **Elena\'s "Northwind" & Co Brief** — Success', '', 'Reviewed Q4 pipeline for Elena\'s "Enterprise" & Partners segment.'].join('\n'),
    );
    expect(classified.Preview).toBe('✅ Elena\'s "Northwind" & Co Brief — Success Reviewed Q4 pipeline for Elena\'s "Enterprise" & Partners segment.');
    expect(classified.Preview).not.toContain('&#39;');
    expect(classified.Preview).not.toContain('&#x27;');
    expect(classified.Preview).not.toContain('&quot;');
    expect(classified.Preview).not.toContain('&amp;');
  });

  it('converts @{"_mode":"mention",...} tokens and deduplicates adjacent record titles in Body and Preview', () => {
    const raw = [
      '✅ **Account Watch** — Success',
      '',
      'Reviewed **Northwind** @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"}.',
      'Flagged @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Contoso","ID":"acc-2"} with @{"_mode":"mention","type":"user","id":"u-1","name":"Elena Vance"} and @{"_mode":"mention","type":"agent","id":"a-1","name":"Planner"} in @{"_mode":"mention","type":"entity","id":"e-1","name":"Accounts"}.',
    ].join('\n');

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Kind).toBe('markdown');
    expect(classified.Body).toBe(
      ['✅ **Account Watch** — Success', '', 'Reviewed **Northwind**.', 'Flagged Contoso with @Elena Vance and @Planner in #Accounts.'].join('\n'),
    );
    expect(classified.Body).not.toContain('Northwind Northwind');
    expect(classified.Body).not.toContain('@{"_mode"');

    expect(classified.Preview).toBe('✅ Account Watch — Success Reviewed Northwind. Flagged Contoso with @Elena Vance and @Planner in #Accounts.');
    expect(classified.Preview).not.toContain('Northwind Northwind');
    expect(classified.Preview).not.toContain('@{"_mode"');
  });

  it('decodes legacy HTML-escaped @{&quot;_mode&quot;:&quot;mention&quot;,...} tokens from pre-fix DB rows', () => {
    const raw = [
      '✅ **Elena&#39;s Account Digest** — Success',
      '',
      'Checked Northwind @{&quot;_mode&quot;:&quot;mention&quot;,&quot;type&quot;:&quot;record&quot;,&quot;entityName&quot;:&quot;Accounts&quot;,&quot;name&quot;:&quot;Northwind&quot;,&quot;ID&quot;:&quot;acc-1&quot;} &amp; Southwind.',
    ].join('\n');

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Kind).toBe('markdown');
    expect(classified.Body).toContain('Checked Northwind & Southwind.');
    expect(classified.Body).not.toContain('Northwind Northwind');
    expect(classified.Body).not.toContain('&quot;');
    expect(classified.Preview).toBe("✅ Elena's Account Digest — Success Checked Northwind & Southwind.");
  });

  it('does not falsely deduplicate partial suffix matches or break icon-only record mentions', () => {
    const raw = [
      '**Account Sweep** — Success',
      '',
      'SuperNorthwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"} and Accounts @{"_mode":"mention","type":"record","entityName":"Accounts","ID":"acc-2"} updated.',
    ].join('\n');

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Body).toContain('SuperNorthwind Northwind and Accounts updated.');
    expect(classified.Preview).toBe('Account Sweep — Success SuperNorthwind Northwind and Accounts updated.');
  });

  it('preserves user-authored fenced and inline code blocks without decoding or double-decoding', () => {
    const raw = [
      '✅ **Parser Audit** — Success',
      '',
      'Elena&#39;s prose &quot;A &amp; B&quot; and double-escaped &amp;quot; &amp;#39; &amp;amp; stay single-decoded.',
      'Inline code `const expr = "a &amp; b &#39;c&#39; &#x27;d&#x27; &quot;e&quot;";` stays literal, and ``const nested = `x &amp; y`;`` stays literal.',
      '',
      '```html',
      '<div title="&quot;Northwind&quot; &amp; Co">&#39;Literal&#39; @{"_mode":"mention","type":"user","id":"u1","name":"KeepRaw"}</div>',
      '```',
      '',
      '~~~ts',
      'const q = "&amp;quot; &#39;";',
      '~~~',
    ].join('\n');

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Kind).toBe('markdown');
    // Prose decoded exactly once
    expect(classified.Body).toContain('Elena\'s prose "A & B" and double-escaped &quot; &#39; &amp; stay single-decoded.');
    // Inline code preserved verbatim
    expect(classified.Body).toContain('`const expr = "a &amp; b &#39;c&#39; &#x27;d&#x27; &quot;e&quot;";`');
    expect(classified.Body).toContain('``const nested = `x &amp; y`;``');
    // Fenced code blocks preserved verbatim (including HTML tags & mention-like text inside code)
    expect(classified.Body).toContain(
      '<div title="&quot;Northwind&quot; &amp; Co">&#39;Literal&#39; @{"_mode":"mention","type":"user","id":"u1","name":"KeepRaw"}</div>',
    );
    expect(classified.Body).toContain('const q = "&amp;quot; &#39;";');

    const stripped = StripNotificationMarkdown(raw);
    expect(stripped).toContain('Elena\'s prose "A & B" and double-escaped &quot; &#39; &amp; stay single-decoded.');
    expect(stripped).toContain('const expr = "a &amp; b &#39;c&#39; &#x27;d&#x27; &quot;e&quot;";');
    expect(stripped).toContain('const nested = `x &amp; y`;');
    expect(stripped).not.toContain('KeepRaw');
    expect(stripped).not.toContain('```');
    expect(stripped).not.toContain('~~~');
  });

  it('handles Markdown links, headings, blockquotes, and snake_case identifiers cleanly in StripNotificationMarkdown', () => {
    const raw = [
      '### Weekly Summary for Elena&#39;s Team',
      '',
      '> **Note:** Review [Northwind_Account](https://example.com/a_b) @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind_Account","ID":"acc-9"} &amp; _confirm_.',
    ].join('\n');

    const stripped = StripNotificationMarkdown(raw);

    expect(stripped).toBe("Weekly Summary for Elena's Team Note: Review Northwind_Account & confirm.");
  });

  it('handles pathological repeated bracket/newline/angle inputs in linear time without backtracking', () => {
    const repeatedNewlines = '\n'.repeat(10_000) + '- item';
    expect(ClassifyNotificationMessage(repeatedNewlines).Kind).toBe('markdown');

    const repeatedBrackets = '['.repeat(10_000) + 'text';
    expect(ClassifyNotificationMessage(repeatedBrackets).Kind).toBe('text');

    const repeatedLinkStarts = '[]('.repeat(5_000);
    expect(ClassifyNotificationMessage(repeatedLinkStarts).Kind).toBe('text');

    const repeatedUnclosedLink = '[a]('.repeat(5_000);
    expect(ClassifyNotificationMessage(repeatedUnclosedLink).Kind).toBe('text');

    const balancedParenLink = 'Check [Northwind](https://example.com/wiki/Account_(US)) today.';
    const classified = ClassifyNotificationMessage(balancedParenLink);
    expect(classified.Kind).toBe('markdown');
    expect(classified.Preview).toBe('Check Northwind today.');
  });

  it('scales linearly O(n) on large pathological bracket and unclosed parenthesis inputs', () => {
    const pathologicalCases = [
      '['.repeat(20_000) + 'text',
      '[a]('.repeat(10_000),
      '[a]('.repeat(10_000) + ')',
      '['.repeat(10_000) + '](' + '('.repeat(10_000),
      '['.repeat(10_000) + 'a](' + '('.repeat(10_000),
    ];

    for (const input of pathologicalCases) {
      const start = performance.now();
      const classified = ClassifyNotificationMessage(input);
      const stripped = StripNotificationMarkdown(input);
      const elapsedMs = performance.now() - start;

      expect(classified.Kind).toBe('text');
      expect(stripped).toBe(input);
      expect(elapsedMs).toBeLessThan(PATHOLOGICAL_INPUT_CEILING_MS);
    }
  });

  it('cleans entities and mention tokens in plain-text notifications (Kind === "text")', () => {
    const raw =
      'Routine &quot;Elena&#39;s Watch&quot; checked Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"} &amp; Contoso.';

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Kind).toBe('text');
    expect(classified.Body).toBe('Routine "Elena\'s Watch" checked Northwind & Contoso.');
    expect(classified.Expandable).toBe(false);
    expect(classified.Preview).toBe('Routine "Elena\'s Watch" checked Northwind & Contoso.');
  });

  it('populates clean vm.Body for long (>240 chars) plain-text notifications when expanded', () => {
    const suffix = 'A'.repeat(240);
    const raw = `Elena&#39;s &quot;Northwind&quot; &amp; Co checked Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"} and Contoso @{"_mode":"mention","type":"user","id":"u-1","name":"Elena Vance"} — ${suffix}`;
    const entity = createNotificationEntity('notif-long-text', 'Long Plain Notification', raw);
    const component = createNotificationsComponent([entity]);

    const vm = component.Groups[0].Items[0];

    expect(vm.Kind).toBe('text');
    expect(vm.Expandable).toBe(true);
    expect(vm.Body.length).toBeGreaterThan(240);
    expect(vm.Body).toContain('Elena\'s "Northwind" & Co checked Northwind and Contoso @Elena Vance');
    expect(vm.Body).not.toContain('&#39;');
    expect(vm.Body).not.toContain('&quot;');
    expect(vm.Body).not.toContain('&amp;');
    expect(vm.Body).not.toContain('@{"_mode"');
    expect(vm.Body).not.toContain('Northwind Northwind');
  });

  it('truncates long Markdown previews cleanly at 240 characters with an ellipsis', () => {
    const longSentence =
      'Updated Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"1"} with details: ' + 'A'.repeat(260);
    const raw = `**Long Routine** — Success\n\n${longSentence}`;

    const classified = ClassifyNotificationMessage(raw);

    expect(classified.Kind).toBe('markdown');
    expect(classified.Preview.length).toBe(240);
    expect(classified.Preview.endsWith('…')).toBe(true);
    expect(classified.Preview).not.toContain('Northwind Northwind');
    expect(classified.Preview).not.toContain('@{"_mode"');
  });

  it('wires UserNotificationsComponent.Groups through classifyMessage and stripMarkdown', () => {
    const msg = [
      '✅ **Elena&#39;s &quot;Northwind&quot; Watch** — Success',
      '',
      'Reviewed **Northwind** @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"} &amp; `const s = "&amp;";`.',
    ].join('\n');
    const entity = createNotificationEntity('notif-1', 'Routine "Elena\'s Watch": completed', msg);
    const component = createNotificationsComponent([entity]);

    const groups = component.Groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].Items).toHaveLength(1);

    const vm = groups[0].Items[0];
    expect(vm.Kind).toBe('markdown');
    expect(vm.Expandable).toBe(true);
    expect(vm.Preview).toBe('✅ Elena\'s "Northwind" Watch — Success Reviewed Northwind & const s = "&amp;";.');
    expect(vm.Body).toBe(['✅ **Elena\'s "Northwind" Watch** — Success', '', 'Reviewed **Northwind** & `const s = "&amp;";`.'].join('\n'));
  });
});
