"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  categoryDescriptions,
  categoryPrivileges,
  hasPrivilege,
  normalizeUserCategory,
  privilegeLabels,
  userCategories,
  type PrivilegeKey,
  type UserCategory,
} from "@/lib/access-control";
import { cn } from "@/lib/utils";

type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: UserCategory;
  status: "ativo" | "pausado";
  lastAccess: string;
};

const initialUsers: AccessUser[] = [
  {
    id: "usr-master",
    name: "Administrador",
    email: "admin@sanepar.local",
    role: "Administradores",
    status: "ativo",
    lastAccess: "Hoje, 09:12",
  },
  {
    id: "usr-sanepar",
    name: "Equipe Sanepar",
    email: "sanepar@sanepar.local",
    role: "Sanepar",
    status: "ativo",
    lastAccess: "Ontem, 17:40",
  },
  {
    id: "usr-usuarios",
    name: "Usuário de consulta",
    email: "usuario@sanepar.local",
    role: "Usuários",
    status: "pausado",
    lastAccess: "Sem acesso recente",
  },
];

export function AccessManagementPanel() {
  const [users, setUsers] = useState(initialUsers);
  const [selectedRole, setSelectedRole] = useState<UserCategory>("Sanepar");
  const [activeCategory, setActiveCategory] = useState<UserCategory>("Administradores");
  const [newEmail, setNewEmail] = useState("");
  const [auditTrail, setAuditTrail] = useState([
    "Administradores revisaram permissões da categoria Sanepar.",
    "Usuários permanecem em modo consulta.",
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCESS_CATEGORY_STORAGE_KEY, activeCategory);
    window.dispatchEvent(new Event("yvae:access-category-updated"));
  }, [activeCategory]);

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === "ativo").length,
    [users],
  );

  function updateRole(userId: string, role: UserCategory) {
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, role } : user)),
    );
    setAuditTrail((current) => [`Perfil alterado para ${role}.`, ...current].slice(0, 5));
  }

  function toggleStatus(userId: string) {
    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? { ...user, status: user.status === "ativo" ? "pausado" : "ativo" }
          : user,
      ),
    );
    setAuditTrail((current) => ["Status de acesso atualizado.", ...current].slice(0, 5));
  }

  function removeUser(userId: string) {
    setUsers((current) => current.filter((user) => user.id !== userId));
    setAuditTrail((current) => ["Usuário removido da lista permitida.", ...current].slice(0, 5));
  }

  function addUser() {
    const email = newEmail.trim().toLowerCase();

    if (!email || users.some((user) => user.email === email)) {
      return;
    }

    setUsers((current) => [
      {
        id: `usr-${Date.now()}`,
        name: email.split("@")[0] ?? "Novo usuário",
        email,
        role: selectedRole,
        status: "ativo",
        lastAccess: "Convite pendente",
      },
      ...current,
    ]);
    setNewEmail("");
    setAuditTrail((current) => [`Convite criado para ${email}.`, ...current].slice(0, 5));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(360px,1.2fr)]">
        <div className="rounded-2xl border border-[var(--line-ghost)] bg-white/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                Acesso ativo
              </p>
              <p className="heading-font mt-2 text-4xl font-black text-[var(--brand-navy-strong)]">
                {activeUsers}/{users.length}
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--brand-blue-soft)] p-3 text-[var(--brand-navy)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {userCategories.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold transition",
                  selectedRole === role
                    ? "border-[var(--brand-blue)] bg-[var(--brand-blue-soft)] text-[var(--brand-navy-strong)]"
                    : "border-[var(--line-ghost)] bg-white text-[var(--ink-soft)]",
                )}
              >
                {role}
                <span>{categoryPrivileges[role].length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line-ghost)] bg-white/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
                Categoria {selectedRole}
              </p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                {categoryDescriptions[selectedRole]}
              </p>
            </div>
            <StatusChip label="editável" tone="primary" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(Object.keys(privilegeLabels) as PrivilegeKey[]).map((permission) => {
              const enabled = hasPrivilege(selectedRole, permission);

              return (
                <div
                  key={permission}
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    enabled
                      ? "border-[rgba(0,142,156,0.28)] bg-[rgba(0,142,156,0.08)]"
                      : "border-[var(--line-ghost)] bg-white",
                  )}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                    {privilegeLabels[permission]}
                  </p>
                  <p className="mt-2 font-bold text-[var(--brand-navy-strong)]">
                    {enabled ? "Permitido" : "Bloqueado"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="usuario@sanepar.local"
              className="h-11 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-sm outline-none focus:border-[var(--brand-blue)]"
            />
            <button
              type="button"
              onClick={addUser}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-5 text-sm font-bold text-white disabled:opacity-50"
              disabled={!newEmail.trim()}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--line-ghost)] bg-white/80">
        <div className="grid grid-cols-[1.2fr_0.85fr_0.7fr_0.75fr_auto] gap-3 border-b border-[var(--line-ghost)] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)] max-lg:hidden">
          <span>Usuário</span>
          <span>Perfil</span>
          <span>Status</span>
          <span>Último acesso</span>
          <span>Ação</span>
        </div>
        <div className="divide-y divide-[var(--line-ghost)]">
          {users.map((user) => (
            <div
              key={user.id}
              className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_0.85fr_0.7fr_0.75fr_auto] lg:items-center"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(23,53,76,0.08)] text-[var(--brand-navy)]">
                  <UserCog className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-bold text-[var(--brand-navy-strong)]">{user.name}</p>
                  <p className="text-sm text-[var(--ink-soft)]">{user.email}</p>
                </div>
              </div>
              <select
              value={user.role}
                onChange={(event) => updateRole(user.id, event.target.value as UserCategory)}
                className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold text-[var(--brand-navy-strong)]"
              >
                {userCategories.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => toggleStatus(user.id)}
                className={cn(
                  "h-10 rounded-xl px-3 text-sm font-bold",
                  user.status === "ativo"
                    ? "bg-[var(--brand-green-soft)] text-[var(--brand-teal)]"
                    : "bg-[rgba(186,26,26,0.08)] text-[var(--brand-danger)]",
                )}
              >
                {user.status}
              </button>
              <p className="text-sm text-[var(--ink-soft)]">{user.lastAccess}</p>
              <button
                type="button"
                onClick={() => removeUser(user.id)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(186,26,26,0.08)] text-[var(--brand-danger)]"
                aria-label={`Remover ${user.name}`}
                title="Remover usuário"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line-ghost)] bg-white/80 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
              Categoria ativa nesta sessão
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Esta seleção simula os privilégios do usuário logado e controla ações como excluir planilhas.
            </p>
          </div>
          <select
            value={activeCategory}
            onChange={(event) => setActiveCategory(event.target.value as UserCategory)}
            className="h-11 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-bold text-[var(--brand-navy-strong)]"
          >
            {userCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
          Registro de acessos
        </p>
        <div className="mt-3 grid gap-2">
          {auditTrail.map((entry, index) => (
            <p key={`${entry}-${index}`} className="text-sm text-[var(--ink-soft)]">
              {entry}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
