import { useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import App from './App';
import { Lazy, LoadFailed } from './components/LoadBoundary';
import { ModePicker } from './components/ModePicker';
import { AppUpdateContext } from './lib/appUpdate';
import type { AppMode } from './lib/prefs';
import { sharedRouteId } from './lib/routeLink';
import { accountReturn } from './account/link';
import { isSundayLink, withoutSundayParam } from './lib/sundayLink';
import { SW_OPTIONS, UPDATE_CHECK_MS } from './lib/swUpdate';

// The route library (and its map library) and the dashboard load only when
// opened, so the timer's first load stays as small as before.
const loadRoutes = () => import('./sixk/SixKMode');
const loadDashboard = () => import('./dashboard/DashboardMode');
// Only in builds with accounts switched on (__ACCOUNTS__), so other builds don't ship it.
const loadAccount = __ACCOUNTS__ ? () => import('./account/AccountMode') : null;

/**
 * Looks for a new version when the app starts and whenever it comes back into
 * view (at most once a minute): an installed Android app is often resumed for
 * days without a fresh load, so the browser never checks on its own.
 */
function checkWhenBack(registration: ServiceWorkerRegistration | undefined) {
  if (!registration) return;
  let lastCheck = Date.now();
  void registration.update().catch(() => {}); // offline: try again next time
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
    lastCheck = Date.now();
    void registration.update().catch(() => {}); // offline: try again next time
  });
}

/**
 * Always opens on the mode picker ("What are we doing today?"), except a shared
 * route link (`?route=<id>`, src/lib/routeLink.ts), which opens that route's page,
 * and `?sunday` (src/lib/sundayLink.ts), which opens Stooopid Sunday.
 * The app's one service worker registration lives here, so the home screen and
 * every mode share one "new version ready" state (see UpdateBanner).
 */
export default function Root() {
  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW({ ...SW_OPTIONS, onRegisteredSW: (_url: string, r: ServiceWorkerRegistration | undefined) => checkWhenBack(r) });
  const appUpdate = useMemo(
    // Dev only: ?update-banner shows the banner without a real new version (service workers don't run in dev).
    () => ({
      ready: updateReady || (import.meta.env.DEV && new URLSearchParams(location.search).has('update-banner')),
      update: () => void updateServiceWorker(true),
    }),
    [updateReady, updateServiceWorker],
  );
  return (
    <AppUpdateContext.Provider value={appUpdate}>
      <Modes />
    </AppUpdateContext.Provider>
  );
}

function Modes() {
  // A shared route link opens the Route Library on that route, once (SixKMode cleans the address).
  const [openRoute] = useState(() => sharedRouteId(location.search));
  // A Stooopid Sunday link (`?sunday`, src/lib/sundayLink.ts) opens that mode; the address is cleaned so HOME and a reload go to the picker.
  // Back from Auth0 (`?account…`, src/account/link.ts): the account screen, once (AccountMode cleans the address).
  const [accountStatus] = useState(() => (__ACCOUNTS__ ? accountReturn(location.search) : null));
  const [mode, setMode] = useState<AppMode | null>(() => {
    if (openRoute) return 'sixk';
    if (accountStatus !== null) return 'account';
    if (!isSundayLink(location.search)) return null;
    try {
      history.replaceState(history.state, '', withoutSundayParam(location.href));
    } catch {
      /* address stays as is */
    }
    return 'dashboard';
  });
  const toPicker = () => setMode(null);

  if (mode === 'account' && loadAccount) {
    return (
      <Lazy
        load={loadAccount}
        props={{ onSwitchMode: toPicker, returnStatus: accountStatus }}
        loading={<p className="loading">Loading your account…</p>}
        failed={(retry) => (
          <div className="app">
            <LoadFailed what="The account screen" onRetry={retry} onBack={toPicker} />
          </div>
        )}
      />
    );
  }
  if (mode === 'timer') return <App onSwitchMode={toPicker} />;
  if (mode === 'sixk' || mode === 'dashboard') {
    const routes = mode === 'sixk';
    return (
      <Lazy
        key={mode}
        load={routes ? loadRoutes : loadDashboard}
        props={routes ? { onSwitchMode: toPicker, openRoute } : { onSwitchMode: toPicker }}
        loading={<p className="loading">{routes ? 'Loading routes…' : 'Loading the dashboard…'}</p>}
        failed={(retry) => (
          <div className="app">
            <LoadFailed what={routes ? 'The route library' : 'The dashboard'} onRetry={retry} onBack={toPicker} />
          </div>
        )}
      />
    );
  }
  return <ModePicker onPick={setMode} />;
}
