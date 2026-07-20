import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav />
      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
