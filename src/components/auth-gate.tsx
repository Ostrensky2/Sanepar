"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { YvaeMasthead } from "@/components/brand-signature";
import { recordActivity } from "@/lib/activity-log";
import {
  persistAccessCategory,
  syncPrivilegeMatrixCookie,
  type UserCategory,
} from "@/lib/access-control";
import {
  INITIAL_PASSWORD,
  clearSession,
  getStoredSession,
  isInitialPassword,
  loadAuthUsersFromSharedStore,
  persistAuthUsers,
  persistAuthUsersToSharedStore,
  persistSession,
  type AppUser,
  type AuthSession,
} from "@/lib/auth-users";
import { cn } from "@/lib/utils";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function loadInitialAuthState() {
      const loadedUsers = await loadAuthUsersFromSharedStore();
      const storedSession = getStoredSession();
      setUsers(loadedUsers);
      syncPrivilegeMatrixCookie();

      if (storedSession && loadedUsers.some((user) => user.id === storedSession.userId && user.status === "ativo")) {
        setSession(storedSession);
        syncActiveRole(storedSession.role);
      } else {
        clearSession();
      }

      setReady(true);
    }

    const timer = window.setTimeout(() => {
      void loadInitialAuthState();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const activeCount = useMemo(
    () => users.filter((user) => user.status === "ativo").length,
    [users],
  );

  function signIn() {
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

    if (!user || user.password !== password) {
      setError("Email ou senha incorretos.");
      return;
    }

    if (user.status !== "ativo") {
      setError("Este acesso esta inativo. Solicite reativacao a um administrador.");
      return;
    }

    if (user.mustChangePassword || isInitialPassword(user.password)) {
      setPendingUser(user);
      setError("");
      return;
    }

    completeSignIn(user, users);
  }

  async function changePassword() {
    if (!pendingUser) {
      return;
    }

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword === INITIAL_PASSWORD) {
      setError("Escolha uma senha diferente da senha provisoria GIA26.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmacao da senha nao confere.");
      return;
    }

    const updatedUsers = users.map((user) =>
      user.id === pendingUser.id
        ? {
            ...user,
            password: newPassword,
            mustChangePassword: false,
            lastAccess: formatAccessDate(),
          }
        : user,
    );
    const updatedUser = updatedUsers.find((user) => user.id === pendingUser.id) ?? pendingUser;
    const savedInSharedStore = await persistAuthUsersToSharedStore(updatedUsers);

    if (!savedInSharedStore) {
      setError("Nao foi possivel confirmar a senha na nuvem. Tente novamente antes de entrar.");
      return;
    }

    persistAuthUsers(updatedUsers);
    setUsers(updatedUsers);
    setPendingUser(null);
    setNewPassword("");
    setConfirmPassword("");
    completeSignIn(updatedUser, updatedUsers);
  }

  function completeSignIn(user: AppUser, currentUsers: AppUser[]) {
    const updatedUsers = currentUsers.map((item) =>
      item.id === user.id ? { ...item, lastAccess: formatAccessDate() } : item,
    );
    const sessionPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    persistAuthUsers(updatedUsers);
    persistSession(sessionPayload);
    recordActivity(sessionPayload, "login", "Entrada no sistema", "Login confirmado");
    syncActiveRole(user.role);
    setUsers(updatedUsers);
    setSession(sessionPayload);
    setPassword("");
    setError("");
    router.refresh();
  }

  if (!ready) {
    return null;
  }

  if (session) {
    return <>{children}</>;
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[var(--line-ghost)] bg-white shadow-[0_34px_100px_-60px_rgba(0,66,98,0.55)] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hero-gradient relative flex min-h-[420px] flex-col justify-between p-8 text-white">
          <YvaeMasthead />
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/24 bg-white/12 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em]">
              <ShieldCheck className="h-4 w-4" />
              Acesso por email
            </div>
            <h1 className="heading-font text-3xl font-black tracking-tight sm:text-4xl">
              Entrada controlada do Yva&apos;e
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/78">
              Use o email cadastrado em Configuracoes. Senhas provisórias entram com GIA26 e pedem troca no primeiro acesso.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatusStat label="Pessoas" value={String(users.length)} />
            <StatusStat label="Ativos" value={String(activeCount)} />
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-teal)]">
              Painel de entrada
            </p>
            <h2 className="heading-font mt-2 text-2xl font-black text-[var(--brand-navy-strong)]">
              {pendingUser ? "Cadastre sua nova senha" : "Entrar no sistema"}
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {pendingUser
                ? `${pendingUser.name}, sua senha inicial precisa ser substituida.`
                : "Informe seu email e senha para liberar o painel operacional."}
            </p>
          </div>

          {pendingUser ? (
            <div className="grid gap-4">
              <PasswordField
                label="Nova senha"
                value={newPassword}
                onChange={setNewPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((current) => !current)}
              />
              <PasswordField
                label="Confirmar senha"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((current) => !current)}
              />
              {error ? <p className="text-sm font-semibold text-[var(--brand-danger)]">{error}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={changePassword}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white shadow-sm"
                >
                  <LockKeyhole className="h-4 w-4" />
                  Salvar senha e entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingUser(null);
                    setPassword("");
                    setError("");
                  }}
                  className="h-12 rounded-xl border border-[var(--line-strong)] bg-white px-5 text-sm font-bold text-[var(--brand-navy-strong)]"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                signIn();
              }}
            >
              <label className="grid gap-2 text-sm font-bold text-[var(--brand-navy-strong)]">
                Email
                <span className="flex h-12 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-4">
                  <Mail className="h-4 w-4 text-[var(--ink-soft)]" />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                    placeholder="nome@instituicao.com.br"
                  />
                </span>
              </label>
              <PasswordField
                label="Senha"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((current) => !current)}
              />
              {error ? <p className="text-sm font-semibold text-[var(--brand-danger)]">{error}</p> : null}
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-black text-white shadow-sm disabled:opacity-50"
                disabled={!email.trim() || !password}
              >
                <LockKeyhole className="h-4 w-4" />
                Entrar
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/16 bg-white/10 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/62">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-[var(--brand-navy-strong)]">
      {label}
      <span className="flex h-12 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-4">
        <LockKeyhole className="h-4 w-4 text-[var(--ink-soft)]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={show ? "text" : "password"}
          autoComplete="current-password"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          placeholder="Digite a senha"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className={cn("rounded-full p-1.5 text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]")}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          title={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function syncActiveRole(role: UserCategory) {
  persistAccessCategory(role);
}

function formatAccessDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}
