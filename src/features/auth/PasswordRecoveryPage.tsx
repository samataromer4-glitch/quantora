import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../../lib/apiClient';
import { clearAuthSession } from '../../lib/authStorage';

type RecoveryStatus = 'idle' | 'loading' | 'invalid' | 'success';

interface PasswordRecoveryPageProps {
  mode: 'request' | 'reset';
  email: string;
  onChangeEmail: (value: string) => void;
  onBackToLogin: () => void;
}

export const PasswordRecoveryPage: React.FC<PasswordRecoveryPageProps> = ({
  mode,
  email,
  onChangeEmail,
  onBackToLogin
}) => {
  const [status, setStatus] = useState<RecoveryStatus>(mode === 'reset' ? 'loading' : 'idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== 'reset') return;

    const recoveryToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    setToken(recoveryToken);
    if (!recoveryToken) {
      setStatus('invalid');
      setMessage('Link-ga dib-u-dejintu ma shaqaynayo ama wuu dhacay. Codso link cusub.');
      return;
    }

    let cancelled = false;
    apiFetch('/api/auth/password-recovery/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: recoveryToken })
    }).then(async (response) => {
      const payload = await response.json();
      if (cancelled) return;
      if (!response.ok || payload.valid !== true) {
        setStatus('invalid');
        setMessage(payload.error || 'Link-ga dib-u-dejintu ma shaqaynayo ama wuu dhacay. Codso link cusub.');
        return;
      }
      setStatus('idle');
    }).catch(() => {
      if (cancelled) return;
      setStatus('invalid');
      setMessage('Link-ga dib-u-dejinta hadda lama xaqiijin karo. Fadlan mar kale isku day.');
    });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const handleRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/auth/password-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!response.ok && response.status !== 429) {
        setMessage('Codsiga hadda lama fulin karo. Fadlan mar kale isku day.');
        return;
      }
      setStatus('success');
      setMessage('Haddii cinwaanka email-ku ku xiran yahay akoon firfircoon, tilmaamaha dib-u-dejinta ayaa laguugu soo diri doonaa email-ka. Haddii aadan helin, hubi galka spam-ka ama mar kale isku day.');
    } catch {
      setMessage('Codsiga hadda lama fulin karo. Fadlan mar kale isku day.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || 'Erayga sirta ah lama cusboonaysiin. Fadlan mar kale isku day.');
        return;
      }
      await clearAuthSession();
      setPassword('');
      setConfirmPassword('');
      setStatus('success');
      setMessage('Eraygaaga sirta ah waa la cusboonaysiiyey. Fadlan ku gal eraygaaga cusub.');
    } catch {
      setMessage('Erayga sirta ah lama cusboonaysiin. Fadlan mar kale isku day.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSuccess = status === 'success';
  const isError = Boolean(message) && !isSuccess &&
    (status === 'invalid' || message.includes('lama') || message.includes('ma shaqayn'));

  return (
    <div className="min-h-screen w-full bg-[var(--color-bg)] text-[var(--color-text-primary)] flex flex-col font-sans">
      <header className="h-16 px-6 sm:px-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/brand-mark.svg" alt="" className="w-8 h-8 rounded-[var(--radius-sm)] object-contain" />
          <div>
            <span className="text-sm font-bold tracking-tight block">QUANTORA</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] block">DUGSI PRO</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onBackToLogin}
          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-brand)]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Ku noqo gelitaanka
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
        <section className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            {isSuccess ? <CheckCircle2 className="h-6 w-6" /> : mode === 'request' ? <Mail className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <h1 className="text-xl font-bold">
            {mode === 'request' ? 'Dib u hel eraygaaga sirta ah' : 'Samee eray sir ah oo cusub'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {mode === 'request'
              ? 'Geli email-ka akoonkaaga. Haddii akoonku firfircoon yahay, waxaan kuu soo diri doonnaa tilmaamaha dib-u-dejinta.'
              : 'Dooro eray sir ah oo cusub si aad mar kale ugu gasho akoonkaaga.'}
          </p>

          {message && (
            <div
              className={`mt-5 flex items-start gap-2 rounded-lg border p-3 text-sm ${
                isError
                  ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                  : 'border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] text-[var(--color-text-primary)]'
              }`}
              role={isError ? 'alert' : 'status'}
            >
              {isError && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{message}</span>
            </div>
          )}

          {mode === 'request' && !isSuccess && (
            <form onSubmit={handleRequestSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="recovery-email" className="block text-xs font-semibold text-[var(--color-text-secondary)]">Cinwaanka email-ka</label>
                <input
                  id="recovery-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => onChangeEmail(event.target.value)}
                  className="ds-input w-full py-2.5"
                  placeholder="magac@dugsi.edu"
                />
              </div>
              <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? 'Waa la dirayaa…' : 'Ii soo dir tilmaamaha'}
              </button>
            </form>
          )}

          {mode === 'reset' && status === 'idle' && (
            <form onSubmit={handleResetSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-xs font-semibold text-[var(--color-text-secondary)]">Erayga sirta ah ee cusub</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                  <input id="new-password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="ds-input w-full py-2.5 pl-9" />
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">Ugu yaraan 10 xaraf; kama badnaan karo 128 xaraf.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-[var(--color-text-secondary)]">Xaqiiji erayga sirta ah</label>
                <input id="confirm-password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="ds-input w-full py-2.5" />
              </div>
              <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? 'Waa la cusboonaysiinayaa…' : 'Cusboonaysii erayga sirta ah'}
              </button>
            </form>
          )}

          {(isSuccess || status === 'invalid') && (
            <button type="button" onClick={onBackToLogin} className="mt-6 w-full rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)]">
              Ku noqo gelitaanka
            </button>
          )}

          {mode === 'reset' && status === 'loading' && (
            <p className="mt-6 text-sm text-[var(--color-text-muted)]" role="status">Link-ga dib-u-dejinta ayaa la xaqiijinayaa…</p>
          )}
        </section>
      </main>
    </div>
  );
};
