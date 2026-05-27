// Sanity-check the seeded data: total count + presence of demo-script SKUs.
// Run with: npx tsx scripts/verify-seed.ts
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { count } = await s
    .from("pricing_items")
    .select("*", { count: "exact", head: true });
  console.log("Total pricing_items:", count);

  const skus = [
    "HSC-PAV-002",
    "HSC-FPT-001",
    "LND-TRE-003",
    "IRR-DRP-001",
    "IRR-CTR-001",
    "LGT-PTH-001",
    "LGT-TRF-001",
    "LAB-PRM-002",
  ];
  const { data } = await s
    .from("pricing_items")
    .select("sku,name,unit,unit_price")
    .in("sku", skus);
  console.log(`Demo SKUs found: ${data?.length ?? 0} of ${skus.length}`);
  if (data) {
    console.table(data);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
