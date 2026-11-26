import { MountTours, RegisterAnchor } from '@memberjunction/ng-tours';

/**
 * Programmatic embed example (`MountTours()` + `Signal()` + `On()` + `RegisterAnchor()`).
 */
export async function InitPortalTours(navigate: (url: string) => void): Promise<void> {
  const renewBtn = document.querySelector<HTMLElement>('#renew-btn');
  if (renewBtn) {
    RegisterAnchor('portal.renew', renewBtn);
  }

  const tours = await MountTours({
    SurfaceKey: 'ts_live_replace_me',
    ApiUrl: 'https://api.example.org',
    OnNavigate: (intent) => {
      if (intent.Url) {
        navigate(intent.Url);
      }
    },
  });

  const off = tours.On('AfterTourStepComplete', (evt) => {
    if (evt.EventName === 'AfterTourStepComplete') {
      console.info('Completed tour step:', evt.StepKey);
    }
  });

  await tours.Start('portal.renewal');

  // Later, when payment completes in the host page:
  tours.Signal('portal.renewal.paid', { Amount: 120 });

  window.addEventListener('beforeunload', () => {
    off();
    tours.Dispose();
  });
}
