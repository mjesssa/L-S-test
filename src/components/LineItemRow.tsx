"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Badge } from "@/components/ui/badge";
import { updateLineItem } from "@/app/dashboard/proposals/[id]/actions";

export interface LineItem {
  id: string;
  scope_description: string;
  matched_name: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  confidence: number | null;
  needs_review: boolean;
  position: number;
}

interface Props {
  line: LineItem;
  locked?: boolean;
}

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function LineItemRow({ line, locked = false }: Props) {
  const [scope, setScope] = useState(line.scope_description);
  const [matched, setMatched] = useState(line.matched_name ?? "");
  const [qty, setQty] = useState(String(line.quantity));
  const [price, setPrice] = useState(String(line.unit_price));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const qtyNum = Number(qty);
  const priceNum = Number(price);
  const localTotal =
    Number.isFinite(qtyNum) && Number.isFinite(priceNum)
      ? Number((qtyNum * priceNum).toFixed(2))
      : 0;

  const dirty =
    scope.trim() !== line.scope_description ||
    (matched.trim() || null) !== (line.matched_name ?? null) ||
    qtyNum !== line.quantity ||
    priceNum !== line.unit_price;

  function save() {
    if (!Number.isFinite(qtyNum) || !Number.isFinite(priceNum)) {
      setError("Quantity and unit price must be numbers");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateLineItem({
        line_item_id: line.id,
        scope_description: scope.trim(),
        matched_name: matched.trim() || null,
        quantity: qtyNum,
        unit_price: priceNum,
      });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={line.confidence} />
          {line.needs_review ? (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-100 text-xs text-amber-900"
            >
              Needs review
            </Badge>
          ) : null}
        </div>
        <span className="text-sm font-semibold">{money(localTotal)}</span>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Scope</label>
        <Textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={2}
          disabled={locked || pending}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">Matched item</label>
          <Input
            value={matched}
            onChange={(e) => setMatched(e.target.value)}
            placeholder="Not matched"
            disabled={locked || pending}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Qty ({line.unit ?? "?"})
          </label>
          <Input
            type="number"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            disabled={locked || pending}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Unit price</label>
          <Input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={locked || pending}
          />
        </div>
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!locked && dirty ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
