import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountMode from './AccountMode';
import { accountReturn, withoutAccountParam } from './link';
import { displayNameProblem, usernameProblem } from './rules';

type Handler = (method: string, path: string, body: unknown) => { status?: number; body: unknown };

function mockApi(handler: Handler) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });
      const r = handler(method, path, body);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return calls;
}

const assign = vi.fn();
beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, assign, href: window.location.href, search: '' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

const ready = {
  state: 'ready',
  user: { username: 'sam_runs', displayName: 'Sam', role: 'runner', isAdmin: false },
  needsRecoveryCode: false,
};

describe('account screen', () => {
  it('signed out: offers sign-in and sign-up on Auth0, and the recovery code', async () => {
    mockApi(() => ({ body: { state: 'signed-out' } }));
    render(<AccountMode onSwitchMode={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'SIGN IN' }));
    expect(assign).toHaveBeenLastCalledWith('/api/auth/login');
    fireEvent.click(screen.getByRole('button', { name: 'CREATE AN ACCOUNT' }));
    expect(assign).toHaveBeenLastCalledWith('/api/auth/login?signup=1');
    expect(screen.getByText(/14 and older/)).toBeTruthy();
  });

  it('first-time setup: needs 14+, then shows the recovery code once', async () => {
    let state: unknown = { state: 'onboarding' };
    const calls = mockApi((method, path) => {
      if (path === '/api/me') return { body: state };
      if (path.startsWith('/api/usernames/')) return { body: { available: true, reason: null } };
      if (path === '/api/me/onboarding' && method === 'POST') {
        state = ready;
        return { body: { user: ready.user, recoveryCode: 'ABCD-EFGH-JKMN-PQRS' } };
      }
      if (path === '/api/me/sessions') return { body: { sessions: [] } };
      return { status: 404, body: {} };
    });
    render(<AccountMode onSwitchMode={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'sam_runs' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/14 and older/);
    expect(calls.some((c) => c.path === '/api/me/onboarding')).toBe(false);

    fireEvent.click(screen.getByLabelText('I’m 14 or older.'));
    fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }));
    expect(await screen.findByText('ABCD-EFGH-JKMN-PQRS')).toBeTruthy();
    expect(calls.find((c) => c.path === '/api/me/onboarding')?.body).toEqual({ username: 'sam_runs', displayName: 'Sam', age14: true });

    const go = screen.getByRole('button', { name: 'CONTINUE' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('I’ve saved my recovery code.'));
    fireEvent.click(go);
    expect(await screen.findByText('@sam_runs')).toBeTruthy();
    expect(screen.queryByText('ABCD-EFGH-JKMN-PQRS')).toBeNull();
  });

  it('settings: signs out through Auth0 and deletes only after typing the username and two taps', async () => {
    const calls = mockApi((method, path) => {
      if (path === '/api/me' && method === 'DELETE') return { body: { logoutUrl: 'https://tenant.example/v2/logout' } };
      if (path === '/api/me') return { body: ready };
      if (path === '/api/me/sessions') {
        return { body: { sessions: [{ id: 's1', device: 'iPhone · Safari', signedInAt: 0, lastUsedAt: 0, current: true }] } };
      }
      if (path === '/api/auth/logout') return { body: { logoutUrl: 'https://tenant.example/v2/logout' } };
      return { status: 404, body: {} };
    });
    render(<AccountMode onSwitchMode={() => {}} />);
    expect(await screen.findByText(/this device/)).toBeTruthy();

    const del = screen.getByRole('button', { name: 'DELETE MY ACCOUNT' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type your username to confirm'), { target: { value: 'SAM_RUNS' } });
    fireEvent.click(del);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'TAP AGAIN TO DELETE' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://tenant.example/v2/logout'));
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ confirmUsername: 'SAM_RUNS' });
  });

  it('recovery: shows tries left after a wrong code', async () => {
    mockApi((_m, path) =>
      path === '/api/me'
        ? { body: { state: 'signed-out' } }
        : { status: 400, body: { error: 'wrong-code', message: 'That username and recovery code don’t match.', triesLeft: 2 } },
    );
    render(<AccountMode onSwitchMode={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'USE MY RECOVERY CODE' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sam_runs' } });
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'AAAA-AAAA-AAAA-AAAA' } });
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That username and recovery code don’t match. 2 tries left today.');
    expect(assign).not.toHaveBeenCalled();
  });

  it('says so when accounts are not set up on this deployment', async () => {
    mockApi(() => ({ status: 503, body: { error: 'not-configured' } }));
    render(<AccountMode onSwitchMode={() => {}} />);
    expect(await screen.findByText('Accounts aren’t available right now.')).toBeTruthy();
  });

  it('shows the message the server sent back with', async () => {
    mockApi(() => ({ body: { state: 'signed-out' } }));
    render(<AccountMode onSwitchMode={() => {}} returnStatus="password-set" />);
    expect(await screen.findByText('Password changed. Sign in with your new password.')).toBeTruthy();
  });
});

describe('account links and rules', () => {
  it('reads and removes ?account', () => {
    expect(accountReturn('?account')).toBe('');
    expect(accountReturn('?account=signin-failed')).toBe('signin-failed');
    expect(accountReturn('?route=pi-day')).toBeNull();
    expect(withoutAccountParam('https://x.example/app/?account=disabled&a=1#h')).toBe('/app/?a=1#h');
  });

  it('username and display-name rules', () => {
    expect(usernameProblem('sam_runs')).toBeNull();
    expect(usernameProblem('Sam_Runs')).toBeNull();
    expect(usernameProblem('ab')).toMatch(/3 to 20/);
    expect(usernameProblem('1sam')).toMatch(/letter/);
    expect(usernameProblem('sam.runs')).toMatch(/only/);
    expect(usernameProblem('AnyoneCanPace')).toMatch(/reserved/);
    expect(displayNameProblem('  ')).toMatch(/Enter/);
    expect(displayNameProblem('Sam‮R')).toMatch(/hidden/);
    expect(displayNameProblem('Sam R')).toBeNull();
  });
});
