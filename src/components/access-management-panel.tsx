"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ACCESS_CATEGORY_STORAGE_KEY,
  categoryPrivileges,
  getPrivilegeMatrix,
  hasPrivilege,
  normalizeUserCategory,
  persistAccessCategory,
  privilegeLabels,
  resetPrivilegeMatrix,
  savePrivilegeMatrix,
  userCategories,
  type PrivilegeKey,
  type UserCategory,
} from "@/lib/access-control";
import {
  INITIAL_PASSWORD,
  getStoredSession,
  loadAuthUsersFromSharedStore,
  persistAuthUsers,
  persistSession,
  requestPasswordReset,
  type AppUser,
  type AuthSession,
} from "@/lib/auth-users";
import { cn } from "@/lib/utils";

const privilegeGroups: Array<{ title: string; privileges: PrivilegeKey[] }> = [
  {
    title: "Módulos",
    privileges: [
      "nav.home",
      "nav.campaigns",
      "nav.results",
      "nav.data",
      "nav.documents",
      "nav.requests",
      "nav.settings",
      "nav.help",
    ],
  },
  {
    title: "Ações internas",
    privileges: (Object.keys(privilegeLabels) as PrivilegeKey[]).filter(
      (privilege) => !privilege.startsWith("nav."),
    ),
  },
];
const PRIMARY_ADMIN_ID = "usr-antonio-ostrensky";
const PRIMARY_ADMIN_EMAIL = "ostrensky@ufpr.br";

const roleToneClasses: Record<UserCategory, string> = {
  Admin: "border-purple-200 bg-purple-100 text-purple-800",
  Sanepar: "border-amber-200 bg-amber-100 text-amber-800",
  UFPR: "border-emerald-200 bg-emerald-100 text-emerald-800",
  ATGC: "border-cyan-200 bg-cyan-100 text-cyan-800",
};

type AccessManagementSection = "stats" | "privileges" | "people" | "audit";

type AccessManagementPanelProps = {
  sections?: AccessManagementSection[];
};

export function AccessManagementPanel({
  sections = ["stats", "privileges", "people", "audit"],
}: AccessManagementPanelProps) {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeCategory, setActiveCategory] = useState<UserCategory>("Admin");
  const [privilegeMatrix, setPrivilegeMatrix] = useState(categoryPrivileges);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "ATGC" as UserCategory,
  });
  const [editingUser, setEditingUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: UserCategory;
  } | null>(null);
  const [auditTrail, setAuditTrail] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [savingAction, setSavingAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const loadedUsers = await loadAuthUsersFromSharedStore();

      if (cancelled) {
        return;
      }

      setUsers(loadedUsers);
      setSession(getStoredSession());
      setActiveCategory(normalizeUserCategory(window.localStorage.getItem(ACCESS_CATEGORY_STORAGE_KEY)));
      setPrivilegeMatrix(getPrivilegeMatrix());
    }

    const handleSync = () => {
      void sync();
    };

    handleSync();
    window.addEventListener("yvae:auth-users-updated", handleSync);
    window.addEventListener("yvae:auth-session-updated", handleSync);
    window.addEventListener("yvae:access-category-updated", handleSync);
    window.addEventListener("yvae:access-privileges-updated", handleSync);

    return () => {
      cancelled = true;
      window.removeEventListener("yvae:auth-users-updated", handleSync);
      window.removeEventListener("yvae:auth-session-updated", handleSync);
      window.removeEventListener("yvae:access-category-updated", handleSync);
      window.removeEventListener("yvae:access-privileges-updated", handleSync);
    };
  }, []);

  const canManageAdminAuthority = isPrimaryAdminSession(session);
  const visibleCategories = useMemo(
    () =>
      canManageAdminAuthority
        ? userCategories
        : userCategories.filter((category) => category !== "Admin"),
    [canManageAdminAuthority],
  );
  const visibleUsers = useMemo(
    () =>
      canManageAdminAuthority
        ? users
        : users.filter((user) => user.role !== "Admin"),
    [canManageAdminAuthority, users],
  );
  const activeUsers = useMemo(
    () => visibleUsers.filter((user) => user.status === "ativo").length,
    [visibleUsers],
  );
  const firstAccessCount = useMemo(
    () => visibleUsers.filter((user) => user.mustChangePassword).length,
    [visibleUsers],
  );
  const sortedUsers = useMemo(
    () =>
      [...visibleUsers].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [visibleUsers],
  );
  const canManageUsers = hasPrivilege(activeCategory, "users.manage");
  const canManagePermissions = hasPrivilege(activeCategory, "permissions.manage");
  const isSaving = savingAction !== null;

  async function persistUsers(nextUsers: AppUser[], message: string, actionId = "users") {
    setSavingAction(actionId);
    setNotice(null);
    setUsers(nextUsers);

    try {
      const saved = await persistAuthUsers(nextUsers);

      if (!saved) {
        const errorMessage = "Falha ao salvar na nuvem. A lista foi recarregada.";
        setAuditTrail((current) => [errorMessage, ...current].slice(0, 5));
        setNotice({ kind: "error", text: errorMessage });
        setUsers(await loadAuthUsersFromSharedStore());
        return false;
      }

      setAuditTrail((current) => [message, ...current].slice(0, 5));
      setNotice({ kind: "success", text: message });
      return true;
    } finally {
      setSavingAction(null);
    }
  }

  function syncSessionForUser(user: AppUser) {
    if (session?.userId !== user.id) {
      return;
    }

    const nextSession = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    setSession(nextSession);
    persistSession(nextSession);
    setActiveCategory(user.role);
    persistAccessCategory(user.role);
    router.refresh();
  }

  async function updateUser(userId: string, patch: Partial<AppUser>) {
    const target = users.find((user) => user.id === userId);

    if (
      isSaving ||
      !target ||
      !canManageUsers ||
      touchesAdminAuthority(target, patch, canManageAdminAuthority)
    ) {
      return;
    }

    const nextTarget = { ...target, ...patch };
    const nextUsers = users.map((user) => (user.id === userId ? nextTarget : user));

    const saved = await persistUsers(
      nextUsers,
      `Cadastro de ${nextTarget.name} atualizado.`,
      `update-${userId}`,
    );

    if (saved) {
      syncSessionForUser(nextTarget);
    }
  }

  function startEditingUser(user: AppUser) {
    if (user.role === "Admin" && !canManageAdminAuthority) {
      return;
    }

    setEditingUser({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  async function saveEditingUser() {
    if (!editingUser) {
      return;
    }

    const name = editingUser.name.trim();
    const email = editingUser.email.trim().toLowerCase();
    const duplicatedEmail = users.some(
      (user) => user.id !== editingUser.id && user.email.toLowerCase() === email,
    );

    if (!name || !email) {
      setNotice({ kind: "error", text: "Informe nome e email para salvar o cadastro." });
      return;
    }

    if (duplicatedEmail) {
      setNotice({ kind: "error", text: "Ja existe uma pessoa autorizada com este email." });
      return;
    }

    await updateUser(editingUser.id, {
      name,
      email,
      role: editingUser.role,
      institution: editingUser.role === "Admin" ? "Admin" : editingUser.role,
    });
    setEditingUser(null);
  }

  async function resetPassword(userId: string) {
    const target = users.find((user) => user.id === userId);

    if (isSaving || !target || !canManageUsers || isPasswordResetProtected(target, canManageAdminAuthority)) {
      return;
    }

    setSavingAction(`reset-${userId}`);
    setNotice(null);
    const reset = await requestPasswordReset(userId);

    if (!reset) {
      const errorMessage = `Falha ao redefinir a senha de ${target.name}.`;
      setAuditTrail((current) => [errorMessage, ...current].slice(0, 5));
      setNotice({ kind: "error", text: errorMessage });
      setSavingAction(null);
      return;
    }
    setSavingAction(null);

    const nextUsers = users.map((user) =>
      user.id === userId
        ? { ...user, mustChangePassword: true, lastAccess: "Primeiro acesso pendente" }
        : user,
    );
    await persistUsers(
      nextUsers,
      `Senha provisoria ${INITIAL_PASSWORD} aplicada para ${target.name}.`,
      `reset-${userId}`,
    );
  }

  function removeUser(userId: string) {
    const target = users.find((user) => user.id === userId);

    if (isSaving || !target || !canManageUsers || isProtectedUser(target, canManageAdminAuthority)) {
      return;
    }

    if (!window.confirm(`Remover ${target.name} da lista de pessoas autorizadas?`)) {
      return;
    }

    void persistUsers(
      users.filter((user) => user.id !== userId),
      `${target.name} removido da lista de entrada.`,
      `remove-${userId}`,
    );
  }

  async function addUser() {
    const email = newUser.email.trim().toLowerCase();
    const name = newUser.name.trim();

    if (isSaving || !canManageUsers || (newUser.role === "Admin" && !canManageAdminAuthority)) {
      return;
    }

    if (!name || !email) {
      setNotice({ kind: "error", text: "Informe nome e email para adicionar uma pessoa." });
      return;
    }

    if (users.some((user) => user.email.toLowerCase() === email)) {
      setNotice({ kind: "error", text: "Ja existe uma pessoa autorizada com este email." });
      return;
    }

    const saved = await persistUsers(
      [
        {
          id: `usr-${Date.now()}`,
          name,
          email,
          institution: newUser.role === "Admin" ? "Admin" : newUser.role,
          role: newUser.role,
          status: "ativo",
          password: INITIAL_PASSWORD,
          mustChangePassword: true,
          createdAt: new Date().toISOString().slice(0, 10),
          lastAccess: "Primeiro acesso pendente",
        },
        ...users,
      ],
      `Cadastro criado para ${name} com senha provisoria ${INITIAL_PASSWORD}.`,
      "add-user",
    );

    if (saved) {
      setNewUser({ name: "", email: "", role: "ATGC" });
    }
  }

  function togglePrivilege(category: UserCategory, privilege: PrivilegeKey) {
    if (!canManagePermissions || category === "Admin") {
      return;
    }

    const currentPrivileges = privilegeMatrix[category];
    const nextPrivileges = currentPrivileges.includes(privilege)
      ? currentPrivileges.filter((item) => item !== privilege)
      : [...currentPrivileges, privilege];
    const nextMatrix = { ...privilegeMatrix, [category]: nextPrivileges };

    setPrivilegeMatrix(nextMatrix);
    savePrivilegeMatrix(nextMatrix);
    router.refresh();
    setAuditTrail((current) => [`Matriz de ${category} atualizada.`, ...current].slice(0, 5));
  }

  function applyRecommendedMatrix() {
    if (!canManagePermissions) {
      return;
    }

    resetPrivilegeMatrix();
    setPrivilegeMatrix(categoryPrivileges);
    router.refresh();
    setAuditTrail((current) => ["Matriz recomendada restaurada.", ...current].slice(0, 5));
  }

  const showSection = (section: AccessManagementSection) => sections.includes(section);

  return (
    <div className="space-y-4">
      {showSection("stats") ? (
      <div className="grid gap-3 lg:grid-cols-3">
        <AccessStat label="Usuários ativos" value={`${activeUsers}/${visibleUsers.length}`} icon={ShieldCheck} />
        <AccessStat label="Primeiro acesso" value={String(firstAccessCount)} icon={KeyRound} />
        <div className="rounded-xl border border-[var(--line-ghost)] bg-white/76 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Categoria da sessão
          </p>
          <select
            value={visibleCategories.includes(activeCategory) ? activeCategory : visibleCategories[0]}
            onChange={(event) => {
              const role = event.target.value as UserCategory;
              setActiveCategory(role);
              persistAccessCategory(role);
              router.refresh();
            }}
            className="mt-2 h-10 w-full rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-bold text-[var(--brand-navy-strong)]"
          >
            {visibleCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>
      ) : null}

      {showSection("privileges") ? (
      <section className="overflow-hidden rounded-xl border border-[var(--line-ghost)] bg-white/84">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line-ghost)] p-4">
          <div>
            <h3 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              Painel de Permissões por Categoria
            </h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Controle quais módulos e ações aparecem para cada tipo de usuário.
            </p>
          </div>
          <button
            type="button"
            onClick={applyRecommendedMatrix}
            disabled={!canManagePermissions}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Aplicar matriz recomendada
          </button>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-ghost)] bg-[var(--surface-soft)]/70 text-left text-[11px] font-black uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                <th className="w-[34%] px-4 py-3">Privilegio</th>
                {visibleCategories.map((category) => (
                  <th key={category} className="px-3 py-3 text-center">
                    {category}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-ghost)]">
              {privilegeGroups.map((group) => (
                group.privileges.map((privilege, index) => (
                  <tr key={privilege}>
                    <td className="px-4 py-3">
                      {index === 0 ? (
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--brand-teal)]">
                          {group.title}
                        </p>
                      ) : null}
                      <p className="text-sm font-black text-[var(--brand-navy-strong)]">{privilegeLabels[privilege]}</p>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">{privilege}</p>
                    </td>
                    {visibleCategories.map((category) => {
                      const enabled = privilegeMatrix[category].includes(privilege);
                      const locked = category === "Admin" || !canManagePermissions;

                      return (
                        <td key={`${category}-${privilege}`} className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => togglePrivilege(category, privilege)}
                            disabled={locked}
                            className={cn(
                              "relative inline-flex h-7 w-12 items-center rounded-full transition disabled:cursor-not-allowed",
                              enabled ? "bg-[var(--brand-teal)]" : "bg-slate-200",
                              locked && "opacity-70",
                            )}
                            aria-label={`${enabled ? "Remover" : "Adicionar"} ${privilegeLabels[privilege]} para ${category}`}
                            title={locked ? "Bloqueado para este perfil" : "Alternar permissão"}
                          >
                            <span
                              className={cn(
                                "ml-1 h-5 w-5 rounded-full bg-white shadow transition",
                                enabled && "translate-x-5",
                              )}
                            />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {showSection("people") ? (
      <section className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              Pessoas autorizadas
            </h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Novos cadastros entram ativos com senha provisoria ATGC26.
            </p>
          </div>
          <span className="rounded-full border border-[rgba(0,142,156,0.24)] bg-[rgba(0,142,156,0.1)] px-2.5 py-1 text-[11px] font-black text-[var(--brand-teal)]">
            {canManageUsers ? "cadastro liberado" : "somente leitura"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_0.8fr_auto]">
          <input
            value={newUser.name}
            onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nome"
            className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-blue)]"
            disabled={!canManageUsers || isSaving}
          />
          <input
            value={newUser.email}
            onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
            placeholder="email@instituicao.com.br"
            className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-blue)]"
            disabled={!canManageUsers || isSaving}
          />
          <select
            value={visibleCategories.includes(newUser.role) ? newUser.role : "ATGC"}
            onChange={(event) => {
              const role = event.target.value as UserCategory;
              setNewUser((current) => ({ ...current, role }));
            }}
            className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-bold text-[var(--brand-navy-strong)]"
            disabled={!canManageUsers || isSaving}
          >
            {visibleCategories.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addUser}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white disabled:opacity-40"
            disabled={!canManageUsers || isSaving || !newUser.email.trim() || !newUser.name.trim()}
          >
            <Plus className="h-4 w-4" />
            {savingAction === "add-user" ? "Salvando" : "Adicionar"}
          </button>
        </div>

        {notice ? (
          <div
            className={cn(
              "mt-4 rounded-xl border px-4 py-3 text-sm font-bold",
              notice.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800",
            )}
          >
            {notice.text}
          </div>
        ) : null}

        {editingUser ? (
          <div className="mt-4 rounded-xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--brand-teal)]">
                  Editar pessoa autorizada
                </p>
                <h3 className="heading-font mt-1 text-lg font-black text-[var(--brand-navy-strong)]">
                  {editingUser.name || "Cadastro selecionado"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                disabled={isSaving}
                className="h-9 rounded-xl border border-[var(--line-strong)] bg-white px-4 text-xs font-bold text-[var(--brand-navy-strong)] disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_auto]">
              <label className="grid gap-2 text-xs font-bold text-[var(--brand-navy-strong)]">
                Nome
                <input
                  value={editingUser.name}
                  onChange={(event) => setEditingUser((current) => current ? { ...current, name: event.target.value } : current)}
                  disabled={isSaving}
                  className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-blue)] disabled:opacity-60"
                />
              </label>
              <label className="grid gap-2 text-xs font-bold text-[var(--brand-navy-strong)]">
                Email
                <input
                  value={editingUser.email}
                  onChange={(event) => setEditingUser((current) => current ? { ...current, email: event.target.value } : current)}
                  type="email"
                  disabled={isSaving}
                  className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-blue)] disabled:opacity-60"
                />
              </label>
              <label className="grid gap-2 text-xs font-bold text-[var(--brand-navy-strong)]">
                Categoria
                <select
                  value={visibleCategories.includes(editingUser.role) ? editingUser.role : "ATGC"}
                  onChange={(event) => setEditingUser((current) =>
                    current ? { ...current, role: event.target.value as UserCategory } : current
                  )}
                  disabled={isSaving || isProtectedUser(users.find((user) => user.id === editingUser.id), canManageAdminAuthority)}
                  className="h-10 rounded-xl border border-[var(--line-strong)] bg-white px-3 text-sm font-bold text-[var(--brand-navy-strong)] disabled:opacity-70"
                >
                  {visibleCategories.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void saveEditingUser()}
                  disabled={isSaving || !editingUser.name.trim() || !editingUser.email.trim()}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--brand-navy-strong)] px-4 text-sm font-black text-white disabled:opacity-40 lg:w-auto"
                >
                  {savingAction === `update-${editingUser.id}` ? "Salvando" : "Salvar alterações"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line-ghost)]">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-ghost)] bg-[var(--surface-soft)]/70 text-left text-[11px] font-black uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-ghost)]">
              {sortedUsers.map((user) => (
                <tr key={user.id}>
                  <td className="max-w-52 px-4 py-3 font-bold leading-snug text-[var(--brand-navy-strong)]">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--ink)]">{user.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(event) => {
                        const role = event.target.value as UserCategory;
                        void updateUser(user.id, {
                          role,
                          institution: role === "Admin" ? "Admin" : role,
                        });
                      }}
                      disabled={isSaving || !canManageUsers || isProtectedUser(user, canManageAdminAuthority)}
                      className={cn(
                        "h-9 min-w-36 rounded-full border px-3 text-xs font-black disabled:opacity-70",
                        roleToneClasses[user.role],
                      )}
                    >
                      {visibleCategories.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-full px-3 py-1 text-xs font-black",
                      user.mustChangePassword
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800",
                    )}>
                      {user.mustChangePassword ? "Senha inicial" : "Cadastrado"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void updateUser(user.id, { status: user.status === "ativo" ? "inativo" : "ativo" })}
                      disabled={isSaving || !canManageUsers || isProtectedUser(user, canManageAdminAuthority)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black disabled:opacity-50",
                        user.status === "ativo"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800",
                      )}
                    >
                      <ToggleLeft className="h-4 w-4" />
                      {user.status}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <ActionButton
                        label="Editar cadastro"
                        disabled={isSaving || !canManageUsers}
                        onClick={() => startEditingUser(user)}
                        icon={Pencil}
                      />
                      <ActionButton
                        label="Redefinir senha"
                        disabled={isSaving || !canManageUsers || isPasswordResetProtected(user, canManageAdminAuthority)}
                        onClick={() => resetPassword(user.id)}
                        icon={KeyRound}
                      />
                      <ActionButton
                        label="Excluir"
                        disabled={isSaving || !canManageUsers || isProtectedUser(user, canManageAdminAuthority)}
                        onClick={() => removeUser(user.id)}
                        icon={Trash2}
                        danger
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {showSection("audit") ? (
      <section className="rounded-xl border border-[var(--line-ghost)] bg-[var(--surface-soft)] p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
          Registro de acessos
        </p>
        <div className="mt-3 grid gap-2">
          {(auditTrail.length ? auditTrail : [
            session ? `${session.name} conectado como ${session.role}.` : "Sessão aguardando autenticação.",
            "As alterações de acesso entram em vigor imediatamente.",
          ]).map((entry, index) => (
            <p key={`${entry}-${index}`} className="text-xs text-[var(--ink-soft)]">
              {entry}
            </p>
          ))}
        </div>
      </section>
      ) : null}
    </div>
  );
}

function AccessStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-[var(--line-ghost)] bg-white/76 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {label}
          </p>
          <p className="mt-1 text-xl font-black text-[var(--brand-navy-strong)]">{value}</p>
        </div>
        <div className="rounded-xl bg-[var(--brand-blue-soft)] p-2.5 text-[var(--brand-navy)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  onClick,
  danger = false,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white disabled:cursor-not-allowed disabled:opacity-35",
        danger
          ? "border-red-200 text-[var(--brand-danger)]"
          : "border-[var(--line-ghost)] text-[var(--brand-navy)]",
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function isProtectedUser(user: AppUser | undefined, canManageAdminAuthority: boolean) {
  if (!user) {
    return false;
  }

  if (user.id === PRIMARY_ADMIN_ID || user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
    return true;
  }

  return user.role === "Admin" && !canManageAdminAuthority;
}

function isPasswordResetProtected(user: AppUser | undefined, canManageAdminAuthority: boolean) {
  if (!user) {
    return false;
  }

  return user.role === "Admin" && !canManageAdminAuthority;
}

function isPrimaryAdminSession(session: AuthSession | null) {
  return session?.userId === PRIMARY_ADMIN_ID || session?.email.toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

function touchesAdminAuthority(
  target: AppUser,
  patch: Partial<AppUser>,
  canManageAdminAuthority: boolean,
) {
  if (target.id === PRIMARY_ADMIN_ID || target.email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
    return patch.role !== undefined && patch.role !== "Admin";
  }

  const nextRole = patch.role ?? target.role;
  const touchesAdminRole = target.role === "Admin" || nextRole === "Admin";

  return touchesAdminRole && !canManageAdminAuthority;
}
