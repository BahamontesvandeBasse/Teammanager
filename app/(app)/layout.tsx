import Nav from "@/components/Nav";
import { resolveRole } from "@/lib/auth/access";
import { RoleProvider } from "@/lib/auth/RoleProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await resolveRole();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav role={role} />
      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
        <RoleProvider role={role}>{children}</RoleProvider>
      </main>
    </div>
  );
}
