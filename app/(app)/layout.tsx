import Nav from "@/components/Nav";
import { getRealRole, resolveRole } from "@/lib/auth/access";
import { RoleProvider } from "@/lib/auth/RoleProvider";
import { neonConfigured } from "@/lib/db/neonClient";
import { ViewAsSwitcher } from "@/components/ViewAsSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, realRole] = await Promise.all([resolveRole(), getRealRole()]);
  // Alleen tonen als er ook echt een login-sessie bestaat (lokale modus heeft geen login).
  const loginActive = neonConfigured();
  return (
    <div className="flex min-h-screen flex-col">
      <ViewAsSwitcher realRole={realRole} effectiveRole={role} />
      <div className="flex flex-1 flex-col md:flex-row">
        <Nav role={role} loginActive={loginActive} />
        <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
          <RoleProvider role={role}>{children}</RoleProvider>
        </main>
      </div>
    </div>
  );
}
