"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { mutateEnvelope } from "@/lib/api/fetcher";

/* Free appointment entry, for can_edit_payout_rules viewers (Khalid, Isa).
   The patient pays nothing; the team records what Saleem covers or earns.
   "Covers" is the cost-to-Saleem case (sent as a negative saleem_share, never
   shown with a minus); "Earns" is the positive case. POSTs (add) or PATCHes
   (edit) /api/payouts/manual, both audited and gated server side. On success
   the parent refetches so the row joins the ledger and the totals at once. */

type FreeAppointmentFormProps = {
  /* Present for edit, absent for add. */
  entry?: {
    id: string;
    product: string;
    provider: string;
    /** Positive = Saleem earns, present covers means a cover amount. */
    saleem_revenue_bhd: number;
    covers_bhd?: number;
  };
  onSaved: () => void;
  onCancel?: () => void;
};

export function FreeAppointmentForm({ entry, onSaved, onCancel }: FreeAppointmentFormProps) {
  const isEdit = entry != null;
  const initialDirection = entry?.covers_bhd != null ? "covers" : "earns";
  const initialAmount = entry
    ? entry.covers_bhd != null
      ? entry.covers_bhd
      : entry.saleem_revenue_bhd
    : 0;

  const [product, setProduct] = useState(entry?.product ?? "");
  const [provider, setProvider] = useState(entry?.provider ?? "");
  const [direction, setDirection] = useState<"covers" | "earns">(initialDirection);
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!product.trim()) {
      setError("Add a short product name.");
      return;
    }
    const magnitude = Number(amount);
    if (!Number.isFinite(magnitude) || magnitude < 0) {
      setError("The amount must be a number, zero or more.");
      return;
    }
    const saleemShare = direction === "covers" ? -magnitude : magnitude;
    setSaving(true);
    try {
      const path = isEdit ? `/payouts/manual/${entry.id}` : "/payouts/manual";
      await mutateEnvelope("payouts_manual", isEdit ? "PATCH" : "POST", path, {
        product: product.trim(),
        provider_label: provider.trim() || undefined,
        saleem_share: saleemShare,
      });
      onSaved();
    } catch {
      setError("That did not save. Try again, or tell Al Saeed if it keeps happening.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Field label="Product" htmlFor="free-product">
        <FieldInput
          id="free-product"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="Screening campaign"
        />
      </Field>
      <Field label="Provider (optional)" htmlFor="free-provider">
        <FieldInput
          id="free-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="Dr. Aysha A."
        />
      </Field>
      <Field label="Saleem economics" htmlFor="free-direction">
        <FieldSelect
          id="free-direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value === "covers" ? "covers" : "earns")}
        >
          <option value="covers">Saleem covers a cost</option>
          <option value="earns">Saleem earns</option>
        </FieldSelect>
      </Field>
      <Field
        label="Amount, BHD"
        htmlFor="free-amount"
        hint={direction === "covers" ? "Shown as Covers BHD on the ledger" : "Shown as Saleem revenue"}
      >
        <FieldInput
          id="free-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="8"
        />
      </Field>
      {error ? <p className="mb-2 text-xs text-trust-ink">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving" : isEdit ? "Save changes" : "Add free appointment"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
