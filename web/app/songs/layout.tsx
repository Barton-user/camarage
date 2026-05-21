import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase-server";

export default async function SongsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <div className="min-h-screen flex">
      <Nav userEmail={user?.email} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
