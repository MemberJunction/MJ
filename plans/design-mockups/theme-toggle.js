/**
 * MemberJunction Theme Toggle
 * ============================
 *
 * Simple theme switching for design mockups.
 * Demonstrates the dark/light mode toggle functionality.
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'mj-theme';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';
  const THEME_SYSTEM = 'system';

  /**
   * Get the system's preferred color scheme
   */
  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEME_DARK;
    }
    return THEME_LIGHT;
  }

  /**
   * Get the effective theme (resolving 'system' to actual theme)
   */
  function getEffectiveTheme(preference) {
    if (preference === THEME_SYSTEM) {
      return getSystemTheme();
    }
    return preference;
  }

  /**
   * Apply theme to the document
   */
  function applyTheme(theme) {
    const effectiveTheme = getEffectiveTheme(theme);
    document.documentElement.setAttribute('data-theme', effectiveTheme);

    // Update theme toggle buttons
    updateToggleButtons(theme);

    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('mj-theme-change', {
      detail: { preference: theme, effective: effectiveTheme }
    }));
  }

  /**
   * Update toggle button states
   */
  function updateToggleButtons(activeTheme) {
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach(button => {
      const theme = button.getAttribute('data-theme-toggle');
      button.classList.toggle('active', theme === activeTheme);
      button.setAttribute('aria-pressed', theme === activeTheme);
    });

    // Update icon in simple toggle button
    const simpleToggle = document.getElementById('theme-toggle');
    if (simpleToggle) {
      const icon = simpleToggle.querySelector('i');
      if (icon) {
        const effectiveTheme = getEffectiveTheme(activeTheme);
        icon.className = effectiveTheme === THEME_DARK
          ? 'fa-solid fa-sun'
          : 'fa-solid fa-moon';
      }
    }
  }

  /**
   * Save theme preference to localStorage
   */
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Unable to save theme preference:', e);
    }
  }

  /**
   * Load theme preference from localStorage
   */
  function loadTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || THEME_LIGHT;
    } catch (e) {
      console.warn('Unable to load theme preference:', e);
      return THEME_LIGHT;
    }
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const current = loadTheme();
    const effectiveCurrent = getEffectiveTheme(current);
    const next = effectiveCurrent === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    saveTheme(next);
    applyTheme(next);
  }

  /**
   * Set a specific theme
   */
  function setTheme(theme) {
    if ([THEME_LIGHT, THEME_DARK, THEME_SYSTEM].includes(theme)) {
      saveTheme(theme);
      applyTheme(theme);
    }
  }

  /**
   * Initialize theme system
   */
  function init() {
    // Apply saved theme immediately
    const savedTheme = loadTheme();
    applyTheme(savedTheme);

    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentPreference = loadTheme();
        if (currentPreference === THEME_SYSTEM) {
          applyTheme(THEME_SYSTEM);
        }
      });
    }

    // Set up event listeners once DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupEventListeners);
    } else {
      setupEventListeners();
    }
  }

  /**
   * Set up event listeners for theme toggle buttons
   */
  function setupEventListeners() {
    // Simple toggle button
    const simpleToggle = document.getElementById('theme-toggle');
    if (simpleToggle) {
      simpleToggle.addEventListener('click', toggleTheme);
    }

    // Theme selector buttons (light, dark, system)
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const theme = button.getAttribute('data-theme-toggle');
        setTheme(theme);
      });
    });
  }

  // Expose API globally
  window.MJTheme = {
    toggle: toggleTheme,
    set: setTheme,
    get: loadTheme,
    getEffective: () => getEffectiveTheme(loadTheme())
  };

  // Initialize
  init();
})();
