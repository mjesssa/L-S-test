import { Badge } from "@/components/ui/badge";

export function ConfidenceBadge({
  confidence,
}: {
  confidence: number | null;
}) {
  if (confidence == null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        —
      </Badge>
    );
  }
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.85
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : confidence >= 0.7
      ? "bg-amber-100 text-amber-900 border-amber-200"
      : "bg-rose-100 text-rose-900 border-rose-200";
  return (
    <Badge variant="outline" className={`${tone} text-xs`}>
      {pct}%
    </Badge>
  );
}
