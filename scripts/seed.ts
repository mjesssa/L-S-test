// Seed the pricing_items table from seed/pricing_items.csv.
// Run with: npx tsx scripts/seed.ts
// Requires SUPABASE_SERVICE_ROLE_KEY in .env (bypasses RLS).

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { Database, PricingCategory } from "../src/types/db";

type PricingItemInsert = Database["public"]["Tables"]["pricing_items"]["Insert"];

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env",
  );
  process.exit(1);
}

const VALID_CATEGORIES: PricingCategory[] = [
  "hardscape",
  "landscape",
  "irrigation",
  "lighting",
  "water_feature",
  "turf",
  "labor",
];

interface CsvRow {
  sku: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  unit_price: string;
  keywords: string;
}

async function main() {
  const supabase = createClient<Database>(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const csvPath = resolve(process.cwd(), "seed/pricing_items.csv");
  const csv = readFileSync(csvPath, "utf-8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const items: PricingItemInsert[] = rows.map((r, idx) => {
    if (!VALID_CATEGORIES.includes(r.category as PricingCategory)) {
      throw new Error(
        `Row ${idx + 2}: invalid category "${r.category}" (sku ${r.sku})`,
      );
    }
    const unitPrice = Number.parseFloat(r.unit_price);
    if (Number.isNaN(unitPrice)) {
      throw new Error(`Row ${idx + 2}: invalid unit_price "${r.unit_price}"`);
    }
    return {
      sku: r.sku,
      name: r.name,
      description: r.description || null,
      category: r.category as PricingCategory,
      unit: r.unit,
      unit_price: unitPrice,
      keywords: r.keywords.split("|").map((k) => k.trim()).filter(Boolean),
      active: true,
    };
  });

  console.log(`Parsed ${items.length} pricing items. Upserting in chunks of 100…`);

  let inserted = 0;
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const { error } = await supabase
      .from("pricing_items")
      .upsert(chunk as never, { onConflict: "sku" });
    if (error) {
      console.error(`Chunk ${i}-${i + chunk.length} failed:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    process.stdout.write(`\r  ${inserted}/${items.length}`);
  }
  process.stdout.write("\n");
  console.log(`✅ Seeded ${inserted} pricing items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
