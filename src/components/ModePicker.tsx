import scene from '../assets/home/riverside.webp';
import sceneDuck from '../assets/home/riverside-duck.webp';
import diwali from '../assets/home/diwali.webp';
import { specialScene } from '../lib/homeScene';
import type { AppMode } from '../lib/prefs';
import { InstallHint } from './InstallHint';
import { UpdateBanner } from './UpdateBanner';

interface Props {
  onPick: (mode: AppMode) => void;
}

/**
 * Home screen: the app always opens here. The duck runs along the river under
 * a Montréal skyline; the scene fades into graph paper (the Route Library's
 * thumbnail grid) while the duck, a separate cut-out, stays solid over the fade.
 */
export function ModePicker({ onPick }: Props) {
  const special = specialScene(Date.now());
  return (
    <div className="app picker">
      <header className={special ? 'picker__hero picker__hero--square' : 'picker__hero'}>
        <div className="picker__sky">
          {/* Read as "AnyoneCanPace 2.0" (plus "BETA"); drawn as ANYONE CAN / PACE 2.0 with a sticker. */}
          <h1 className="picker__title" aria-label={__BETA__ ? 'AnyoneCanPace 2.0 BETA' : 'AnyoneCanPace 2.0'}>
            <span className="picker__t1" aria-hidden="true">
              Anyone Can
            </span>
            <span className="picker__t2" aria-hidden="true">
              Pace<span className="picker__version">2.0</span>
              {__BETA__ && <span className="beta-tag picker__beta">BETA</span>}
            </span>
          </h1>
          <p className="picker__ribbon">Your Stooopid Co-Pacer</p>
        </div>
        {special?.id === 'diwali' ? (
          // One square picture, duck and all: shown whole, never cropped.
          <div className="picker__scene picker__scene--square" aria-hidden="true">
            <img className="picker__scene-whole" src={diwali} alt="" width={1080} height={1080} />
          </div>
        ) : (
          <div className="picker__scene" aria-hidden="true">
            <img className="picker__scene-bg" src={scene} alt="" width={1080} height={720} />
            <img className="picker__scene-duck" src={sceneDuck} alt="" width={1080} height={720} />
          </div>
        )}
      </header>

      <main className="main picker__main">
        <UpdateBanner />
        <h2 className="visually-hidden">What are we doing today?</h2>
        <ul className="picker__list">
          <li>
            <button type="button" className="mode-card mode-card--dashboard" onClick={() => onPick('dashboard')}>
              <span className="mode-card__name">Stooopid Sunday Dashboard</span>
              <span className="mode-card__help">What to wear, where we meet.</span>
            </button>
          </li>
          <li>
            <button type="button" className="mode-card mode-card--timer" onClick={() => onPick('timer')}>
              <span className="mode-card__name">ACR Run/Walk Timer</span>
              <span className="mode-card__help">RUN/WALK intervals for pacing.</span>
            </button>
          </li>
          <li>
            <button type="button" className="mode-card mode-card--sixk" onClick={() => onPick('sixk')}>
              <span className="mode-card__name">Route Library</span>
              <span className="mode-card__help">Follow a route on a street map.</span>
            </button>
          </li>
        </ul>
        <p className="picker__note">You can switch modes later from each mode’s menu.</p>
        {__ACCOUNTS__ && (
          // Only here on the home screen: signing in leaves the app for Auth0's page,
          // so it must never be reachable while a timer or a route is running.
          <button type="button" className="btn btn--secondary btn--small picker__account" onClick={() => onPick('account')}>
            YOUR ACCOUNT
          </button>
        )}
        <InstallHint />
      </main>

      <footer className="footer">
        <p>ANYONE CAN RUN. ANYONE CAN PACE.</p>
        <p className="footer__build">Build {__BUILD_ID__}</p>
      </footer>
    </div>
  );
}
