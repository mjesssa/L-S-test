import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Quote Acceleration Agent
          </Link>
          <nav className="flex items-center gap-3">
            <Button asChild size="sm">
              <Link href="/site-walk/new">+ New site walk</Link>
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
