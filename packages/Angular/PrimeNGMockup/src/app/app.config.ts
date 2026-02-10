import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';

import { routes } from './app.routes';

/**
 * Custom PrimeNG theme preset that maps the Lara base theme
 * to MJ's brand blue palette and neutral (slate) surface colors.
 */
const MJTheme = definePreset(Lara, {
  semantic: {
    primary: {
      50:  '#e6f3f9',
      100: '#b3dbed',
      200: '#80c3e1',
      300: '#4dabd5',
      400: '#2699cc',
      500: '#0076b6',
      600: '#006aa3',
      700: '#005a8a',
      800: '#004a71',
      900: '#092340',
      950: '#04111f'
    },
    colorScheme: {
      light: {
        surface: {
          0:   '#ffffff',
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        }
      },
      dark: {
        surface: {
          0:   '#ffffff',
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        }
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    providePrimeNG({
      theme: {
        preset: MJTheme,
        options: {
          darkModeSelector: '[data-theme="dark"]'
        }
      }
    }),
    MessageService,
    ConfirmationService,
    DialogService
  ]
};
