import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { draftStore } from '../myRoutes/drafts';
import { clearMyRoutesCopies } from '../myRoutes/load';
import { clearRouteMaps } from '../sixk/map/routeTiles';
import { UpdateBanner } from '../components/UpdateBanner';
import {
  ApiError,
  checkUsername,
  deleteAccount,
  deleteMyRoute,
  listMyRoutes,
  finishOnboarding,
  getMe,
  goToSignIn,
  listSessions,
  newRecoveryCode,
  recover,
  signOut,
  signOutDevice,
  updateProfile,
  type DeviceSession,
  type Me,
  type MyRouteSummary,
} from './api';
import { withoutAccountParam } from './link';
import { cleanDisplayName, displayNameProblem, DISPLAY_NAME_MAX, normalizeUsername, usernameProblem, USERNAME_MAX } from './rules';
import './account.css';

interface Props {
  onSwitchMode: () => void;
  /** The `?account=` status the server sent back with, '' for none (see link.ts). */
  returnStatus?: string | null;
}

const RETURN_MESSAGES: Record<string, string> = {
  'signin-failed': 'Sign-in didn’t finish. Try again.',
  disabled: 'This account is disabled.',
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.');

/**
 * The account screen (design/backend-v1-spec.md §5): sign in or create an
 * account (on Auth0's page), first-time setup with the recovery code, and
 * settings. Only reachable from the home screen, so it never interrupts a
 * running timer or a route being followed.
 */
export default function AccountMode({ onSwitchMode, returnStatus = null }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [notice] = useState(() => (returnStatus ? (RETURN_MESSAGES[returnStatus] ?? null) : null));
  const [code, setCode] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  const refresh = useCallback(async () => setMe(await getMe()), []);

  useEffect(() => {
    if (returnStatus !== null) history.replaceState(history.state, '', withoutAccountParam(location.href));
    void refresh();
  }, [returnStatus, refresh]);

  let body: ReactNode;
  if (code) {
    body = (
      <RecoveryCodeView
        code={code}
        onDone={() => {
          setCode(null);
          void refresh();
        }}
      />
    );
  } else if (!me) {
    body = <p className="loading">Checking your account…</p>;
  } else if (me.state === 'offline' || me.state === 'unavailable') {
    body = (
      <section className="acct-card" role="status">
        <p>{me.state === 'offline' ? 'You seem to be offline. Accounts need a connection.' : 'Accounts aren’t available right now.'}</p>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void refresh()}>
          TRY AGAIN
        </button>
      </section>
    );
  } else if (me.state === 'signed-out') {
    body = recovering ? <RecoverView onBack={() => setRecovering(false)} /> : <SignedOutView onRecover={() => setRecovering(true)} />;
  } else if (me.state === 'onboarding') {
    body = <OnboardingView onCreated={setCode} />;
  } else if (me.state === 'disabled') {
    body = (
      <section className="acct-card" role="status">
        <p>This account is disabled. If you think that’s a mistake, contact the app’s privacy contact.</p>
        <SignOutButton />
      </section>
    );
  } else if (me.needsRecoveryCode) {
    body = <NewCodeNeededView onCode={setCode} />;
  } else {
    body = <SettingsView me={me} onChanged={(next) => setMe(next)} onCode={setCode} />;
  }

  return (
    <div className="app app--paper acct">
      <header className="header">
        <div>
          <p className="brand brand--small">AnyoneCanPace</p>
          <h1 className="acct__title">Your account</h1>
        </div>
        <button type="button" className="btn btn--secondary btn--small" onClick={onSwitchMode}>
          HOME
        </button>
      </header>
      <main className="main">
        <UpdateBanner />
        {notice && (
          <p className="acct-msg" role="status">
            {notice}
          </p>
        )}
        {body}
      </main>
    </div>
  );
}

// ---------- signed out ----------

function SignedOutView({ onRecover }: { onRecover: () => void }) {
  return (
    <>
      <section className="acct-card">
        <p>
          An account keeps your own routes on all your devices. Signing in happens on Auth0’s page, our sign-in
          service, and brings you back here.
        </p>
        <button type="button" className="btn btn--primary btn--block" onClick={() => goToSignIn(false)}>
          SIGN IN
        </button>
        <button type="button" className="btn btn--secondary btn--block acct-gap" onClick={() => goToSignIn(true)}>
          CREATE AN ACCOUNT
        </button>
        <p className="acct-small">Accounts are for people 14 and older. The app works without one.</p>
      </section>
      <section className="acct-card">
        <h2 className="acct__h2">Can’t sign in?</h2>
        <p>
          On the sign-in page, tap “Forgot password?” for a reset email (check your spam folder). If it doesn’t arrive, use
          the recovery code you saved when you made your account.
        </p>
        <button type="button" className="btn btn--secondary btn--small" onClick={onRecover}>
          USE MY RECOVERY CODE
        </button>
      </section>
    </>
  );
}

function RecoverView({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ticketUrl } = await recover(username, code);
      location.assign(ticketUrl);
    } catch (err) {
      const left = err instanceof ApiError && typeof err.body.triesLeft === 'number' ? err.body.triesLeft : null;
      setError(left === null || left <= 0 ? errorText(err) : `${errorText(err)} ${left} ${left === 1 ? 'try' : 'tries'} left today.`);
      setBusy(false);
    }
  };

  return (
    <form className="acct-card" onSubmit={(e) => void submit(e)}>
      <h2 className="acct__h2">Use your recovery code</h2>
      <p>
        You’ll set a new password on Auth0’s page. Every device you’re signed in on is signed out. Then come back to
        AnyoneCanPace, sign in with the new password, and save the new recovery code it gives you.
      </p>
      <label className="acct-field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </label>
      <label className="acct-field">
        <span>Recovery code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
      </label>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'CHECKING…' : 'CONTINUE'}
      </button>
      <button type="button" className="btn btn--secondary btn--small acct-gap" onClick={onBack}>
        BACK
      </button>
    </form>
  );
}

// ---------- first-time setup ----------

function useUsernameCheck(raw: string, current?: string) {
  const [state, setState] = useState<{ name: string; message: string | null; ok: boolean } | null>(null);
  useEffect(() => {
    const name = normalizeUsername(raw);
    if (!name || name === current) {
      setState(null);
      return;
    }
    const local = usernameProblem(name);
    if (local) {
      setState({ name, message: local, ok: false });
      return;
    }
    const timer = setTimeout(() => {
      checkUsername(name)
        .then((r) => setState({ name, message: r.available ? 'Available.' : (r.reason ?? 'Not available.'), ok: r.available }))
        .catch(() => setState(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [raw, current]);
  return state;
}

function OnboardingView({ onCreated }: { onCreated: (code: string) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [age14, setAge14] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = useUsernameCheck(username);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = usernameProblem(username) ?? displayNameProblem(displayName) ?? (age14 ? null : 'Accounts are for people 14 and older.');
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { recoveryCode } = await finishOnboarding(username, cleanDisplayName(displayName), age14);
      onCreated(recoveryCode);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="acct-card" onSubmit={(e) => void submit(e)}>
      <h2 className="acct__h2">Set up your account</h2>
      <label className="acct-field">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={USERNAME_MAX}
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          aria-describedby="acct-username-help"
          required
        />
      </label>
      <p id="acct-username-help" className={`acct-small${check && !check.ok ? ' acct-small--bad' : ''}`} aria-live="polite">
        {check?.message ?? 'Unique. 3–20 lowercase letters, numbers, _ or -. Shown next to your name, e.g. “by Sam (@sam_runs)”.'}
      </p>
      <label className="acct-field">
        <span>Display name</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={DISPLAY_NAME_MAX} autoComplete="nickname" required />
      </label>
      <p className="acct-small">Any name; others can use the same one. Your email is never shown.</p>
      <label className="acct-check">
        <input type="checkbox" checked={age14} onChange={(e) => setAge14(e.target.checked)} />
        <span>I’m 14 or older.</span>
      </label>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'CREATING…' : 'CREATE ACCOUNT'}
      </button>
      <SignOutButton label="CANCEL AND SIGN OUT" />
    </form>
  );
}

function RecoveryCodeView({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="acct-card" aria-labelledby="acct-code-title">
      <h2 id="acct-code-title" className="acct__h2">
        Your recovery code
      </h2>
      <p className="acct-code" aria-label={`Recovery code ${code.split('').join(' ')}`}>
        {code}
      </p>
      <button type="button" className="btn btn--secondary btn--small" onClick={() => void copy()}>
        {copied ? 'COPIED' : 'COPY'}
      </button>
      <p>
        <strong>Save or print it now. It won’t be shown again.</strong> It’s your way back in if you forget your password
        and the reset email doesn’t arrive. Without your password, a reset email or this code, the account and its routes
        can’t be recovered, and the admin can’t help.
      </p>
      <label className="acct-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>I’ve saved my recovery code.</span>
      </label>
      <button type="button" className="btn btn--primary btn--block" disabled={!saved} onClick={onDone}>
        CONTINUE
      </button>
    </section>
  );
}

function NewCodeNeededView({ onCode }: { onCode: (code: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="acct-card">
      <h2 className="acct__h2">You need a new recovery code</h2>
      <p>Your last recovery code was used. Make a new one and save it before carrying on.</p>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() =>
          newRecoveryCode()
            .then((r) => onCode(r.recoveryCode))
            .catch((err) => setError(errorText(err)))
        }
      >
        MAKE MY NEW CODE
      </button>
    </section>
  );
}

// ---------- settings ----------

/** Two taps for anything that can't be undone: the first arms, the second acts (resets after 4 s). */
function useConfirm() {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return {
    armed,
    tap(action: () => void) {
      if (armed) {
        setArmed(false);
        action();
        return;
      }
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
    },
  };
}

const ROLE_LABEL = { runner: 'Runner', pacer: 'Pacer' } as const;

function SettingsView({
  me,
  onChanged,
  onCode,
}: {
  me: Extract<Me, { state: 'ready' }>;
  onChanged: (me: Me) => void;
  onCode: (code: string) => void;
}) {
  const { user } = me;
  return (
    <>
      <section className="acct-card">
        <p className="acct-who">
          <span className="acct-who__name">{user.displayName}</span> <span className="acct-who__handle">@{user.username}</span>
        </p>
        <p className="acct-small">{user.isAdmin ? 'Admin' : ROLE_LABEL[user.role]}</p>
      </section>
      <MyRoutesSection />
      <ProfileForm me={me} onChanged={onChanged} />
      <RecoverySection onCode={onCode} />
      <DevicesSection />
      <section className="acct-card">
        <SignOutButton />
      </section>
      <DeleteSection username={user.username} />
    </>
  );
}

function ProfileForm({ me, onChanged }: { me: Extract<Me, { state: 'ready' }>; onChanged: (me: Me) => void }) {
  const [displayName, setDisplayName] = useState(me.user.displayName);
  const [username, setUsername] = useState(me.user.username);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const check = useUsernameCheck(username, me.user.username);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { user } = await updateProfile({ displayName, username });
      onChanged({ ...me, user });
      setMessage({ text: 'Saved.', bad: false });
    } catch (err) {
      setMessage({ text: errorText(err), bad: true });
    }
  };

  return (
    <form className="acct-card" onSubmit={(e) => void submit(e)}>
      <h2 className="acct__h2">Profile</h2>
      <label className="acct-field">
        <span>Display name</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={DISPLAY_NAME_MAX} required />
      </label>
      <label className="acct-field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={USERNAME_MAX} autoCapitalize="none" spellCheck={false} required />
      </label>
      <p className={`acct-small${check && !check.ok ? ' acct-small--bad' : ''}`} aria-live="polite">
        {check?.message ?? 'If you change your username, the old one stays reserved for you for 30 days.'}
      </p>
      {message && (
        <p className={message.bad ? 'acct-error' : 'acct-msg'} role={message.bad ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <button type="submit" className="btn btn--secondary btn--small">
        SAVE
      </button>
    </form>
  );
}

function RecoverySection({ onCode }: { onCode: (code: string) => void }) {
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="acct-card">
      <h2 className="acct__h2">Recovery code</h2>
      <p>Lost your recovery code? Make a new one. The old one stops working.</p>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`btn btn--secondary btn--small${confirm.armed ? ' is-confirming' : ''}`}
        onClick={() =>
          confirm.tap(() =>
            newRecoveryCode()
              .then((r) => onCode(r.recoveryCode))
              .catch((err) => setError(errorText(err))),
          )
        }
      >
        {confirm.armed ? 'TAP AGAIN TO REPLACE IT' : 'MAKE A NEW CODE'}
      </button>
    </section>
  );
}

const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function DevicesSection() {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    listSessions()
      .then((r) => setSessions(r.sessions))
      .catch((err) => setError(errorText(err)));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="acct-card">
      <h2 className="acct__h2">Signed-in devices</h2>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      {!sessions && !error && <p className="loading">Loading…</p>}
      {sessions && (
        <ul className="acct-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.device}</strong>
                {s.current ? ' · this device' : ''}
                <br />
                <span className="acct-small">
                  Signed in {when(s.signedInAt)} · last used {when(s.lastUsedAt)}
                </span>
              </span>
              {!s.current && (
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() =>
                    signOutDevice(s.id)
                      .then(load)
                      .catch((err) => setError(errorText(err)))
                  }
                >
                  SIGN OUT
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SignOutButton({ label = 'SIGN OUT' }: { label?: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn--secondary btn--block acct-gap"
        onClick={() =>
          signOut()
            // Unsaved routes stay on a device only while its person is signed in.
            .then(async ({ logoutUrl }) => {
              await Promise.all([draftStore().clear(), clearMyRoutesCopies(), clearRouteMaps()]);
              location.assign(logoutUrl);
            })
            .catch((err) => setError(errorText(err)))
        }
      >
        {label}
      </button>
    </>
  );
}

function DeleteSection({ username }: { username: string }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const matches = normalizeUsername(typed) === username.toLowerCase();
  return (
    <section className="acct-card acct-card--danger">
      <h2 className="acct__h2">Delete account</h2>
      <p>
        Deletes your account, your personal routes and your sign-in. Public routes you uploaded stay, shown as “former
        pacer”. This can’t be undone.
      </p>
      <label className="acct-field">
        <span>Type your username to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" spellCheck={false} />
      </label>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`btn btn--danger btn--small${confirm.armed ? ' is-confirming' : ''}`}
        disabled={!matches}
        onClick={() =>
          confirm.tap(() =>
            deleteAccount(typed)
              .then(async ({ logoutUrl }) => {
                await Promise.all([draftStore().clear(), clearMyRoutesCopies(), clearRouteMaps()]);
                location.assign(logoutUrl);
              })
              .catch((err) => setError(errorText(err))),
          )
        }
      >
        {confirm.armed ? 'TAP AGAIN TO DELETE' : 'DELETE MY ACCOUNT'}
      </button>
    </section>
  );
}

// ---------- my routes ----------

const kmText = (m: number) => `${(m / 1000).toFixed(1)} km`;

function MyRoutesSection() {
  const [routes, setRoutes] = useState<MyRouteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    listMyRoutes()
      .then((r) => setRoutes(r.routes))
      .catch((err) => setError(errorText(err)));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="acct-card" aria-labelledby="acct-routes-title">
      <h2 id="acct-routes-title" className="acct__h2">
        My routes
      </h2>
      <p className="acct-small">
        Routes only you can see, on all your devices. Add, open and follow them in the Route Library, under My routes.
      </p>
      {error && (
        <p className="acct-error" role="alert">
          {error}
        </p>
      )}
      {routes && routes.length > 0 && (
        <ul className="acct-list">
          {routes.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.name}</strong>
                <br />
                <span className="acct-small">
                  {kmText(r.stats.distanceM)} · {r.verification === 'unverified' ? 'turns not checked' : r.verification.replace('-', ' ')}
                </span>
              </span>
              <DeleteRouteButton id={r.id} onDeleted={load} onError={setError} />
            </li>
          ))}
        </ul>
      )}
      {routes && routes.length === 0 && <p>No routes yet.</p>}
    </section>
  );
}

function DeleteRouteButton({ id, onDeleted, onError }: { id: string; onDeleted: () => void; onError: (e: string) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      className={`btn btn--danger btn--small${confirm.armed ? ' is-confirming' : ''}`}
      onClick={() =>
        confirm.tap(() =>
          deleteMyRoute(id)
            .then(onDeleted)
            .catch((err) => onError(errorText(err))),
        )
      }
    >
      {confirm.armed ? 'TAP AGAIN' : 'DELETE'}
    </button>
  );
}
