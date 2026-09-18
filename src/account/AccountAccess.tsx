import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useAccount } from './AccountContext';
import './account.css';

export default function AccountAccess({ compact = false }: { compact?: boolean }) {
  const { loading, unavailable, login, register } = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    const entered = {
      name: String(fields.get('customer_name') || name),
      phone: String(fields.get('customer_phone') || phone),
      email: String(fields.get('customer_email') || email),
      password: String(fields.get('customer_password') || password),
    };
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') await register(entered);
      else await login({ email: entered.email, password: entered.password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <section className={`account-access ${compact ? 'account-access-compact' : ''}`}>
    <span className="account-access-kicker"><LockKeyhole size={15} /> SUA CONTA STREET</span>
    <h3>{mode === 'login' ? 'Entre no seu ritmo.' : 'Crie sua conta.'}</h3>
    <p>{mode === 'login' ? 'Seus pedidos ficam juntos aqui, mesmo quando você troca de celular.' : 'Conecte-se para comprar e acompanhar cada etapa do pedido.'}</p>
    <div className="account-tabs" role="group" aria-label="Acesso à conta">
      <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Entrar</button>
      <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Criar conta</button>
    </div>
    <form onSubmit={submit}>
      {mode === 'register' && <>
        <label htmlFor={`account-name-${compact}`}>Nome</label>
        <input id={`account-name-${compact}`} name="customer_name" autoComplete="section-customer name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required placeholder="Como podemos te chamar?" />
        <label htmlFor={`account-phone-${compact}`}>WhatsApp com DDD</label>
        <input id={`account-phone-${compact}`} name="customer_phone" autoComplete="section-customer tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="(31) 99999-9999" />
      </>}
      <label htmlFor={`account-email-${compact}`}>E-mail</label>
      <input id={`account-email-${compact}`} name="customer_email" type="email" autoComplete="section-customer email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="voce@exemplo.com" />
      <label htmlFor={`account-password-${compact}`}>Senha</label>
      <input id={`account-password-${compact}`} name="customer_password" type="password" autoComplete={mode === 'login' ? 'section-customer current-password' : 'section-customer new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 12 : undefined} maxLength={128} required placeholder={mode === 'register' ? 'Mínimo de 12 caracteres' : 'Sua senha'} />
      {error && <p className="account-error" role="alert">{error}</p>}
      {unavailable && <p className="account-error" role="alert">{unavailable}</p>}
      <button className="account-submit" type="submit" disabled={busy || loading || Boolean(unavailable)}>{busy ? 'Conectando…' : loading ? 'Verificando conta…' : mode === 'login' ? 'Entrar na conta' : 'Criar e entrar'} <ArrowRight size={17} /></button>
    </form>
  </section>;
}
