import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, attr, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { MJEntityCardComponent } from './entity-card.component';
import { CardTemplate, CardDisplayField, CardFieldType } from './entity-card.types';

/**
 * DOM spec for <mj-entity-card>. The component is STANDALONE and metadata-driven, but it only
 * touches the MJ provider when it has to auto-generate a template (no Template + an
 * EntityName/Entity). By passing a pre-built `Template` plus a plain `Record`, the whole
 * provider/metadata path is bypassed — resolveTemplate() returns the Template as-is — so the
 * component renders deterministically with no backend. We assert the variant/CssClass on the
 * container, the title/subtitle/description/entity slots, the display-field @for (incl. value
 * formatting + empty-skip), the avatar fallback chain, the open button, and the
 * cancelable click / open @Output pattern.
 */

function field(name: string, type: CardFieldType = 'text', label = name): CardDisplayField {
  return { Name: name, Label: label, Type: type, IsDefaultInView: true, Sequence: 0 };
}

function tpl(p: Partial<CardTemplate> = {}): CardTemplate {
  return {
    TitleFields: p.TitleFields ?? ['Name'],
    SubtitleField: p.SubtitleField ?? null,
    DescriptionField: p.DescriptionField ?? null,
    DisplayFields: p.DisplayFields ?? [],
    ThumbnailFields: p.ThumbnailFields ?? [],
    BadgeField: p.BadgeField ?? null,
    FieldLabels: p.FieldLabels ?? {},
  };
}

describe('MJEntityCardComponent (DOM)', () => {
  describe('container', () => {
    it('applies the variant modifier and the custom CssClass to the outer element', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme' }, Variant: 'detail', CssClass: 'my-extra' },
      });
      const el = query(f, '.mj-entity-card')!;
      expect(el.classList.contains('mj-entity-card--detail')).toBe(true);
      expect(el.classList.contains('my-extra')).toBe(true);
    });
  });

  describe('header / title', () => {
    it('renders the combined title from TitleFields', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ TitleFields: ['FirstName', 'LastName'] }), Record: { FirstName: 'Ada', LastName: 'Lovelace' } },
      });
      expect(text(f, '.mj-ec-title')).toBe('Ada Lovelace');
    });

    it('shows the entity display name on a card variant', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme', Entity: 'Accounts' }, Variant: 'card' },
      });
      expect(text(f, '.mj-ec-entity')).toBe('Accounts');
    });

    it('hides the entity display name on a compact variant', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme', Entity: 'Accounts' }, Variant: 'compact' },
      });
      expect(query(f, '.mj-ec-entity')).toBeNull();
    });
  });

  describe('subtitle / description', () => {
    it('shows the subtitle when SubtitleField is set and variant is not compact', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ SubtitleField: 'Status' }), Record: { Name: 'Acme', Status: 'Active' }, Variant: 'card' },
      });
      expect(text(f, '.mj-ec-subtitle')).toBe('Active');
    });

    it('shows the description only in the detail variant', () => {
      const withDetail = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DescriptionField: 'Notes' }), Record: { Name: 'Acme', Notes: 'A long note' }, Variant: 'detail' },
      });
      expect(text(withDetail, '.mj-ec-description')).toBe('A long note');
    });

    it('hides the description in the card variant even when a DescriptionField is set', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DescriptionField: 'Notes' }), Record: { Name: 'Acme', Notes: 'A long note' }, Variant: 'card' },
      });
      expect(query(f, '.mj-ec-description')).toBeNull();
    });
  });

  describe('display fields', () => {
    it('renders one field row per display field that has a value, skipping empties', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: {
          Template: tpl({ DisplayFields: [field('Email'), field('Phone')] }),
          Record: { Name: 'Acme', Email: 'a@b.com' }, // Phone absent → skipped
          Variant: 'card',
        },
      });
      const fields = queryAll(f, '.mj-ec-field');
      expect(fields).toHaveLength(1);
      expect(text(f, '.mj-ec-field-value')).toBe('a@b.com');
    });

    it('renders field labels on a card variant (ShouldShowLabels) but not on compact', () => {
      const card = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DisplayFields: [field('Email', 'text', 'Email Address')] }), Record: { Name: 'Acme', Email: 'a@b.com' }, Variant: 'card' },
      });
      expect(text(card, '.mj-ec-field-label')).toBe('Email Address');

      const compact = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DisplayFields: [field('Email', 'text', 'Email Address')] }), Record: { Name: 'Acme', Email: 'a@b.com' }, Variant: 'compact' },
      });
      expect(query(compact, '.mj-ec-field-label')).toBeNull();
    });

    it('flags the fields container with mj-ec-fields--labeled only when labels are shown', () => {
      const card = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DisplayFields: [field('Email')] }), Record: { Name: 'Acme', Email: 'a@b.com' }, Variant: 'card' },
      });
      expect(hasClass(card, '.mj-ec-fields', 'mj-ec-fields--labeled')).toBe(true);

      const compact = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DisplayFields: [field('Email')] }), Record: { Name: 'Acme', Email: 'a@b.com' }, Variant: 'compact' },
      });
      expect(hasClass(compact, '.mj-ec-fields', 'mj-ec-fields--labeled')).toBe(false);
    });

    it('formats a number field with K/M suffixes', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DisplayFields: [field('Employees', 'number')] }), Record: { Name: 'Acme', Employees: 1500 }, Variant: 'card' },
      });
      expect(text(f, '.mj-ec-field-value')).toBe('1.5K');
    });

    it('formats a boolean field as Yes/No', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ DisplayFields: [field('Active', 'boolean')] }), Record: { Name: 'Acme', Active: true }, Variant: 'card' },
      });
      expect(text(f, '.mj-ec-field-value')).toBe('Yes');
    });
  });

  describe('avatar area', () => {
    it('shows the avatar area on a card variant', () => {
      const f = renderComponentFixture(MJEntityCardComponent, { inputs: { Template: tpl(), Record: { Name: 'Acme' }, Variant: 'card' } });
      expect(query(f, '.mj-ec-avatar-area')).not.toBeNull();
    });

    it('hides the avatar area on a compact variant', () => {
      const f = renderComponentFixture(MJEntityCardComponent, { inputs: { Template: tpl(), Record: { Name: 'Acme' }, Variant: 'compact' } });
      expect(query(f, '.mj-ec-avatar-area')).toBeNull();
    });

    it('honors an explicit ShowAvatar=false override on a card variant', () => {
      const f = renderComponentFixture(MJEntityCardComponent, { inputs: { Template: tpl(), Record: { Name: 'Acme' }, Variant: 'card', ShowAvatar: false } });
      expect(query(f, '.mj-ec-avatar-area')).toBeNull();
    });

    it('renders an <img> thumbnail when a thumbnail field holds an image URL', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl({ ThumbnailFields: ['Photo'] }), Record: { Name: 'Acme', Photo: 'https://example.com/p.png' }, Variant: 'card' },
      });
      expect(attr(f, '.mj-ec-thumbnail img', 'src')).toBe('https://example.com/p.png');
    });

    it('falls back to the entity icon avatar when there is no thumbnail', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme', EntityIcon: 'fa-solid fa-building' }, Variant: 'card' },
      });
      expect(query(f, '.mj-ec-avatar i')).not.toBeNull();
      expect(hasClass(f, '.mj-ec-avatar i', 'fa-building')).toBe(true);
    });
  });

  describe('open button + cancelable events', () => {
    it('renders the open button only when ShowOpenButton is true', () => {
      const without = renderComponentFixture(MJEntityCardComponent, { inputs: { Template: tpl(), Record: { Name: 'Acme' } } });
      expect(query(without, '.mj-ec-open-btn')).toBeNull();

      const withBtn = renderComponentFixture(MJEntityCardComponent, { inputs: { Template: tpl(), Record: { Name: 'Acme' }, ShowOpenButton: true } });
      expect(query(withBtn, '.mj-ec-open-btn')).not.toBeNull();
    });

    it('emits CardClicked with the record payload when the card is clicked', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme', ID: 'acc-1', Entity: 'Accounts' } },
      });
      const clicks = capture(f.componentInstance.CardClicked);
      click(f, '.mj-entity-card');
      expect(clicks).toHaveLength(1);
      expect(clicks[0].RecordID).toBe('acc-1');
      expect(clicks[0].EntityName).toBe('Accounts');
    });

    it('does not emit CardClicked when a BeforeCardClick handler cancels', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme' } },
        setup: (c) => {
          c.BeforeCardClick.subscribe((e) => (e.Cancel = true));
        },
      });
      const clicks = capture(f.componentInstance.CardClicked);
      click(f, '.mj-entity-card');
      expect(clicks).toHaveLength(0);
    });

    it('emits OpenRequested (and not CardClicked, via stopPropagation) when the open button is clicked', () => {
      const f = renderComponentFixture(MJEntityCardComponent, {
        inputs: { Template: tpl(), Record: { Name: 'Acme', ID: 'acc-1' }, ShowOpenButton: true },
      });
      const opens = capture(f.componentInstance.OpenRequested);
      const clicks = capture(f.componentInstance.CardClicked);
      click(f, '.mj-ec-open-btn');
      expect(opens).toHaveLength(1);
      expect(clicks).toHaveLength(0);
    });
  });
});
