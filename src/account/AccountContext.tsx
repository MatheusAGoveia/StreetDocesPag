import { createContext, useContext, useEffect, useState } from 'react';

export type Customer = { id: string; name: string; email: string; phone: string };
type Credentials = { email: string; password: string };
type Registration = Credentials & { name: string; phone: string };
type AccountContextValue = {
  customer: Customer | null;
  loading: boolean;
  unavailable: string;
  login: (credentials: Credentials) => Promise<void>;
  register: (registration: Registration) => Promise<void>;
  logout: () => Promise<void>;
  expire: () => void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

async function accountRequest(path: string, body: unknown) {
  const response = await fetch(`/api/account/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: 'Resposta inválida do servidor.' }));
  if (!response.ok) throw new Error(result.error || 'Não foi possível acessar sua conta.');
  return result as { customer: Customer };
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/account/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) return null;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível acessar sua conta.');
        return result.customer as Customer;
      })
      .then((current) => { if (active) setCustomer(current); })
      .catch((cause) => { if (active) setUnavailable(cause instanceof Error ? cause.message : 'Conta indisponível no momento.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function login(credentials: Credentials) {
    const result = await accountRequest('login', credentials);
    setCustomer(result.customer);
    setUnavailable('');
  }
  async function register(registration: Registration) {
    const result = await accountRequest('register', registration);
    setCustomer(result.customer);
    setUnavailable('');
  }
  async function logout() {
    await accountRequest('logout', {});
    setCustomer(null);
  }

  return <AccountContext.Provider value={{ customer, loading, unavailable, login, register, logout, expire: () => setCustomer(null) }}>
    {children}
  </AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('AccountProvider ausente.');
  return context;
}
