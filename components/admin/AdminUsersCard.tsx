"use client";

// The accounts table plus the add-user and reset-password flows (spec 02
// section 8.7). Every write goes through the admin API, which evaluates the
// real viewer and refuses the service key; this component only renders the
// controls. A temporary password comes back once and is shown once: the
// modal makes it copyable and warns that it cannot be retrieved again.

import { useState } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Check, CircleAlert, Copy, KeyRound, UserPlus } from "lucide-react";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { AdminUserCreated, AdminUserRow, PasswordReset } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

const WRITE_FAILED =
  "Couldn't save. Nothing changed. Try again, or tell Al Saeed if it repeats.";

const ROLE_LABEL: Record<AdminUserRow["role"], string> = {
  admin: "Admin",
  dept_head: "Department head",
  member: "Member",
};

const ROLE_CHIP: Record<AdminUserRow["role"], ChipVariant> = {
  admin: "info",
  dept_head: "good",
  member: "mut",
};

function lastLogin(iso: string | null): string {
  if (!iso) return "Never signed in";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "·";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    {Array.from({ length: 6 }, (_, i) => (
      <Skeleton key={i} height={18} />
    ))}
  </div>
);

type AdminUsersCardProps = {
  query: UseQueryResult<Envelope<AdminUserRow[]>>;
};

export function AdminUsersCard({ query }: AdminUsersCardProps) {
  const [resetting, setResetting] = useState<AdminUserRow | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: DataTableColumn<AdminUserRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (row) => (
        <span className="flex flex-col">
          <b className="font-semibold text-title">{row.name}</b>
          <span className="font-mono text-[11px] text-ink-3">{row.key}</span>
        </span>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (row) => <Chip variant={ROLE_CHIP[row.role]}>{ROLE_LABEL[row.role]}</Chip>,
    },
    {
      key: "department",
      label: "Department",
      render: (row) => row.department ?? "·",
    },
    {
      key: "last_login",
      label: "Last sign-in",
      render: (row) => lastLogin(row.last_login),
    },
    {
      key: "must_reset",
      label: "Status",
      render: (row) =>
        row.must_reset ? <Chip variant="warn">Reset pending</Chip> : <Chip variant="good">Active</Chip>,
    },
    {
      key: "actions",
      label: "",
      numeric: true,
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setResetting(row)}>
          <KeyRound strokeWidth={1.8} aria-hidden="true" />
          Reset password
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Accounts"
        subtitle="Everyone who can sign in, with their role and last visit."
        right={
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus strokeWidth={1.8} aria-hidden="true" />
            Add user
          </Button>
        }
      />
      <div className="px-[18px] pb-2 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(rows) => rows.length === 0}
          emptyCopy="No accounts yet."
        >
          {(rows) => <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} />}
        </QueryPanel>
      </div>
      <CardFooter note="A reset issues a one-time temporary password. It shows once; hand it over directly and the person sets their own on first sign-in." />

      {resetting ? (
        <ResetPasswordModal row={resetting} onClose={() => setResetting(null)} />
      ) : null}
      {adding ? <AddUserModal onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}

/* ── Shared: the one-time secret reveal ── */

function SecretReveal({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy. Select the text and copy it by hand.", CircleAlert);
    }
  }

  return (
    <div className="mb-[14px] rounded-inner border border-line bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="select-all break-all font-mono text-[14px] text-title">{password}</code>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? (
            <Check strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Copy strokeWidth={1.8} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Shown once. It is not stored anywhere, so copy it now and hand it over directly.
      </p>
    </div>
  );
}

/* ── Reset password ── */

function ResetPasswordModal({ row, onClose }: { row: AdminUserRow; onClose: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<PasswordReset>(
        "admin_users",
        "POST",
        `/admin/users/${row.key}/reset-password`,
      ),
    onSuccess: (payload) => {
      setSecret(payload?.data?.temp_password ?? null);
      void qc.invalidateQueries({ queryKey: qk.adminUsers() });
    },
    onError: (err) => {
      toast(err instanceof ApiError && err.messagePlain ? err.messagePlain : WRITE_FAILED, CircleAlert);
    },
  });

  return (
    <Modal open onClose={onClose} aria-label={`Reset password for ${row.name}`}>
      <ModalTitle>{secret ? "Temporary password" : "Reset this password?"}</ModalTitle>
      {secret ? (
        <>
          <ModalText>
            {row.name} can sign in with this once, then must set their own.
          </ModalText>
          <SecretReveal password={secret} />
          <ModalRow>
            <Button onClick={onClose}>Done</Button>
          </ModalRow>
        </>
      ) : (
        <>
          <ModalText>
            This issues a new one-time password for {row.name} and ends their current one. They
            will be asked to set a new password on their next sign-in.
          </ModalText>
          <ModalRow>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="navy" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Resetting" : "Reset password"}
            </Button>
          </ModalRow>
        </>
      )}
    </Modal>
  );
}

/* ── Add user ── */

type Role = AdminUserRow["role"];

function AddUserModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [department, setDepartment] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminUserCreated | null>(null);

  const toast = useToast();
  const qc = useQueryClient();

  const trimmedKey = key.trim().toLowerCase();
  const trimmedName = name.trim();
  const keyValid = /^[a-z][a-z0-9_]{1,30}$/.test(trimmedKey);
  const canSave = keyValid && trimmedName.length >= 2;

  const mutation = useMutation({
    mutationFn: (body: {
      key: string;
      name: string;
      email?: string;
      role: Role;
      department?: string;
    }) => mutateEnvelope<AdminUserCreated>("admin_users", "POST", "/admin/users", body),
    onSuccess: (payload) => {
      if (payload?.data) {
        setCreated(payload.data);
        toast(`Added ${payload.data.user.name}.`);
      }
      void qc.invalidateQueries({ queryKey: qk.adminUsers() });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.messagePlain) {
        setServerError(err.messagePlain);
      } else {
        toast(WRITE_FAILED, CircleAlert);
      }
    },
  });

  function save() {
    if (!canSave || mutation.isPending) return;
    setServerError(null);
    mutation.mutate({
      key: trimmedKey,
      name: trimmedName,
      email: email.trim() || undefined,
      role,
      department: department.trim() || undefined,
    });
  }

  if (created) {
    return (
      <Modal open onClose={onClose} aria-label="User added">
        <ModalTitle>{created.user.name} is set up</ModalTitle>
        <ModalText>
          Their first sign-in uses this temporary password, then they set their own.
        </ModalText>
        <SecretReveal password={created.temp_password} />
        <ModalRow>
          <Button onClick={onClose}>Done</Button>
        </ModalRow>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} aria-label="Add user">
      <ModalTitle>Add user</ModalTitle>
      <ModalText>A temporary password is generated for the first sign-in.</ModalText>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Sign-in key"
          htmlFor="add-user-key"
          hint="Lowercase, starts with a letter, for example aziz."
        >
          <FieldInput
            id="add-user-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label="Full name" htmlFor="add-user-name">
          <FieldInput id="add-user-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <Field label="Email (optional)" htmlFor="add-user-email">
        <FieldInput
          id="add-user-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" htmlFor="add-user-role">
          <FieldSelect
            id="add-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="member">Member</option>
            <option value="dept_head">Department head</option>
            <option value="admin">Admin</option>
          </FieldSelect>
        </Field>
        <Field label="Department (optional)" htmlFor="add-user-department">
          <FieldInput
            id="add-user-department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </Field>
      </div>

      {serverError ? (
        <p className="mb-[6px] flex items-start gap-[7px] text-[12.5px] text-ink-2">
          <CircleAlert strokeWidth={1.8} className="mt-[2px] h-[14px] w-[14px] shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </p>
      ) : null}

      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!canSave || mutation.isPending}>
          {mutation.isPending ? "Adding" : "Add user"}
        </Button>
      </ModalRow>
    </Modal>
  );
}
