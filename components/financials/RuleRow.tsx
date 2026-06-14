"use client";

import { useState } from "react";
import { Split } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { ListRow } from "@/components/ui/ListRow";
import { mutateEnvelope } from "@/lib/api/fetcher";
import type { PayoutRuleItem } from "@/lib/api/contract";

/* One payout rule in the cascade. Permitted viewers (can_edit_payout_rules:
   Khalid, Isa) get an inline Edit that opens the rule's editable numeric
   params, replacing the old disabled placeholder. Everyone else sees the rule
   read-only. Saving PATCHes /api/payouts/rules/:id (audited, gated server
   side) and calls onSaved so the parent refetches rules, bookings, and the
   summary so the new split shows at once. */

const PARAM_LABELS: Record<string, string> = {
  service_charge_bhd: "Service charge, BHD",
  commission_bhd: "Commission, BHD",
  commission_pct: "Commission percent",
};

type RuleRowProps = {
  rule: PayoutRuleItem;
  onSaved: () => void;
};

export function RuleRow({ rule, onSaved }: RuleRowProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rule.editable_keys.map((key) => [key, String(rule.params[key] ?? 0)]),
    ),
  );

  function reset() {
    setDraft(
      Object.fromEntries(
        rule.editable_keys.map((key) => [key, String(rule.params[key] ?? 0)]),
      ),
    );
    setError(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, number> = {};
    for (const key of rule.editable_keys) {
      const n = Number(draft[key]);
      if (!Number.isFinite(n) || n < 0) {
        setError("Each amount must be a number, zero or more.");
        setSaving(false);
        return;
      }
      body[key] = n;
    }
    try {
      await mutateEnvelope(
        "payouts_rule_patch",
        "PATCH",
        `/payouts/rules/${rule.id}`,
        body,
      );
      setEditing(false);
      onSaved();
    } catch {
      setError("That did not save. Try again, or tell Al Saeed if it keeps happening.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <ListRow
        icon={Split}
        title={`${rule.priority} · ${rule.label}`}
        subtitle={rule.params_display}
        right={
          rule.can_edit ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="border-b border-line-soft py-3 last:border-b-0">
      <b className="block text-[13px] font-semibold text-title">
        {rule.priority} · {rule.label}
      </b>
      <div className="mt-2 grid grid-cols-2 gap-x-3">
        {rule.editable_keys.map((key) => (
          <Field key={key} label={PARAM_LABELS[key] ?? key} htmlFor={`rule-${rule.id}-${key}`}>
            <FieldInput
              id={`rule-${rule.id}-${key}`}
              inputMode="decimal"
              value={draft[key]}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [key]: e.target.value }))
              }
            />
          </Field>
        ))}
      </div>
      {error ? <p className="mb-2 text-xs text-trust-ink">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
