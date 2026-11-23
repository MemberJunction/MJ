document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const dialog = document.getElementById('proto-dialog');
  const sheet = document.getElementById('proto-sheet');
  const popover = document.getElementById('proto-popover');
  const lookButtons = document.querySelectorAll('[data-set-look]');
  const menuItems = document.querySelectorAll('[data-popover-action]');

  const applyLook = (look) => {
    root.setAttribute('data-look', look);
    lookButtons.forEach((b) => {
      const active = b.getAttribute('data-set-look') === look;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    menuItems.forEach((item) => {
      item.setAttribute('selected', item.getAttribute('data-popover-action') === look ? 'true' : 'false');
    });
  };

  lookButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyLook(btn.getAttribute('data-set-look') || 'mj');
    });
  });

  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    document.getElementById('toggle-theme')?.setAttribute('aria-pressed', String(next === 'dark'));
  });

  const wireLayer = (openBtnId, layerEl, closeBtnId, toggle = false) => {
    document.getElementById(openBtnId)?.addEventListener('click', () => {
      if (!layerEl) return;
      if (toggle && layerEl.hasAttribute('open') && layerEl.getAttribute('open') !== 'false') {
        layerEl.removeAttribute('open');
      } else {
        layerEl.setAttribute('open', 'true');
      }
    });

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (closeBtnId && event.target.closest(`#${closeBtnId}`)) {
        layerEl?.removeAttribute('open');
      }
      const closeTarget = event.target.closest('[data-close-layer]');
      if (closeTarget && layerEl && closeTarget.getAttribute('data-close-layer') === layerEl.id) {
        layerEl?.removeAttribute('open');
      }
    });

    layerEl?.addEventListener('mj-after-close', () => {
      layerEl.removeAttribute('open');
    });
  };

  wireLayer('open-dialog', dialog, 'close-dialog');
  wireLayer('open-sheet', sheet, 'close-sheet');
  wireLayer('open-popover', popover, '', true);

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('#cancel-dialog')) {
      dialog?.removeAttribute('open');
    }
  });

  // Single-select listbox behavior for curriculum rows
  const listboxRows = document.querySelectorAll('[role="listbox"] > mj-row[item-role="option"]');
  listboxRows.forEach((row) => {
    row.addEventListener('mj-after-select', () => {
      listboxRows.forEach((r) => r.setAttribute('selected', r === row ? 'true' : 'false'));
    });
  });

  // Toggle button row ("Include archived submissions")
  document.querySelectorAll('mj-row[item-role="button"][pressed]').forEach((row) => {
    row.addEventListener('mj-after-select', () => {
      const current = row.getAttribute('pressed') === 'true';
      row.setAttribute('pressed', current ? 'false' : 'true');
    });
  });

  // Menu item radio rows inside the Appearance menu popover (works for both click and Enter/Space!)
  menuItems.forEach((item) => {
    item.addEventListener('mj-after-select', () => {
      const look = item.getAttribute('data-popover-action') || 'mj';
      applyLook(look);
      popover?.removeAttribute('open');
    });
  });
});
