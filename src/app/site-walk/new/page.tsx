import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { SiteWalkForm } from "./site-walk-form";

export const metadata = {
  title: "New site walk · Quote Acceleration Agent",
};

export default async function NewSiteWalkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            New site walk
          </h1>
          <p className="text-muted-foreground">
            Record once. We&rsquo;ll transcribe, match pricing, and draft a
            proposal for your review.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">Cancel</Link>
        </Button>
      </header>
      <SiteWalkForm />
    </main>
  );
}
