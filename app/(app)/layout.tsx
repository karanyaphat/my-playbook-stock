import { AuthGuard } from "@/components/shared/auth-guard";
import { NavSidebar } from "@/components/shared/nav-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <NavSidebar />
        <main className="flex-1 ml-56 p-8 bg-background overflow-y-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
