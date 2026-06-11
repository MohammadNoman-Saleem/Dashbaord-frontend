"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { BeatIcon } from "@/components/ui/BeatIcon";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, FieldInput } from "@/components/ui/Field";
import { StatusDot } from "@/components/ui/StatusDot";

/* Sign in. Auth always posts to the live saleem-api; it is never served from
   fixtures, so this page calls fetch directly instead of fetchEnvelope. A
   first login with a temporary password returns must_reset, which swaps the
   card to a change-password step before routing home. While the API is not
   running (fixtures phase) a failed network fetch offers preview mode rather
   than a dead end. No red anywhere: problems read as plain ink text beside
   a warn dot. */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

const OFFLINE_MESSAGE =
  "Couldn't reach the server. The team dashboard still opens in preview mode.";
const SIGN_IN_FAILED = "That username and password didn't match. Check them and try again.";
const RESET_FAILED = "Couldn't update the password. Check the current one and try again.";

/* Interim local shape for the auth envelope. The auth endpoints are not in
   lib/api/contract.ts yet; when the generated OpenAPI types land this moves
   there like every other DTO. */
type AuthEnvelope = {
  data?: { must_reset?: boolean } | null;
  meta?: { error?: { message_plain?: string } };
};

type PostResult = { ok: boolean; body: AuthEnvelope | null };

async function postAuth(path: string, payload: Record<string, string>): Promise<PostResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as AuthEnvelope | null;
  return { ok: res.ok, body };
}

/* Plain-ink problem line with a warn dot, per the no-red rule. */
function ProblemNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-[13px] flex items-start gap-[7px] text-[13px] text-ink">
      <StatusDot variant="warn" className="mt-[6px]" />
      <span>{children}</span>
    </p>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<"signin" | "reset">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    setOffline(false);
    setSubmitting(true);
    try {
      const { ok, body } = await postAuth("/api/auth/login", { username, password });
      if (!ok) {
        setProblem(body?.meta?.error?.message_plain ?? SIGN_IN_FAILED);
        return;
      }
      if (body?.data?.must_reset) {
        setCurrentPassword(password);
        setStep("reset");
        return;
      }
      router.replace("/");
    } catch {
      setOffline(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    setOffline(false);
    setSubmitting(true);
    try {
      const { ok, body } = await postAuth("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (!ok) {
        setProblem(body?.meta?.error?.message_plain ?? RESET_FAILED);
        return;
      }
      router.replace("/");
    } catch {
      setOffline(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[380px] px-[26px] pt-[24px] pb-[26px]">
      {/* Brand block, mirroring .brand from the approved mockup. */}
      <div className="flex items-center gap-[10px]">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent">
          <BeatIcon size={24} />
        </span>
        <span className="flex flex-col leading-[1.15]">
          <b className="serif text-[17px] font-normal">
            <span className="ar">سليم</span> Saleem
          </b>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Command Center
          </span>
        </span>
      </div>

      {step === "signin" ? (
        <>
          <p className="mt-[14px] mb-[16px] text-[13px] text-ink-2">
            Sign in to the team dashboard.
          </p>
          <form onSubmit={handleSignIn} noValidate>
            <Field label="Username" htmlFor="login-username">
              <FieldInput
                id="login-username"
                name="username"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="login-password">
              <FieldInput
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {problem !== null ? <ProblemNote>{problem}</ProblemNote> : null}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full justify-center disabled:opacity-60"
            >
              Sign in
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-[14px] mb-[16px] text-[13px] text-ink-2">
            Your account uses a temporary password. Set a new one before you continue.
          </p>
          <form onSubmit={handleChangePassword} noValidate>
            <Field label="Current password" htmlFor="reset-current">
              <FieldInput
                id="reset-current"
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="New password" htmlFor="reset-new" hint="Pick one only you know.">
              <FieldInput
                id="reset-new"
                name="new_password"
                type="password"
                autoComplete="new-password"
                autoFocus
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            {problem !== null ? <ProblemNote>{problem}</ProblemNote> : null}
            <Button
              type="submit"
              disabled={submitting}
              className="w-full justify-center disabled:opacity-60"
            >
              Set new password
            </Button>
          </form>
        </>
      )}

      {offline ? (
        <div className="mt-[16px] border-t border-line-soft pt-[14px]">
          <ProblemNote>{OFFLINE_MESSAGE}</ProblemNote>
          <Button
            variant="ghost"
            className="w-full justify-center"
            onClick={() => router.replace("/")}
          >
            Continue in preview
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
