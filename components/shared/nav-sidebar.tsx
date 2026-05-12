"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LayoutDashboard, ArrowLeftRight, Bell, LineChart, BookMarked, PlusCircle, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",     label: "Dashboard",    icon: LayoutDashboard },
  { href: "/playbook",      label: "Playbook",     icon: BookMarked },
  { href: "/transactions",  label: "Transactions", icon: ArrowLeftRight },
  { href: "/monitor",       label: "Monitor",      icon: Bell },
  { href: "/projection",    label: "Projection",   icon: LineChart },
];

export function NavSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { activePlaybook, holdings } = usePortfolioStore();

  const trimCount = holdings.filter((h) => h.needsTrim).length;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col border-r bg-card z-20">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-sm tracking-tight leading-tight">My Playbook<br/>Stock</span>
      </div>

      <Separator />

      {/* Active Playbook badge */}
      {activePlaybook && (
        <div className="px-4 py-2.5">
          <p className="text-xs text-muted-foreground mb-1">Active Playbook</p>
          <p className="text-xs font-semibold truncate text-primary">{activePlaybook.name}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          const showBadge = href === "/monitor" && trimCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </span>
              {showBadge && (
                <Badge variant="destructive" className="h-5 text-xs px-1.5">{trimCount}</Badge>
              )}
            </Link>
          );
        })}

        <Separator className="my-2" />

        <Link
          href="/playbook/new"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          New Playbook
        </Link>
      </nav>

      <Separator />

      {/* User */}
      <div className="px-4 py-3 flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarImage src={user?.photoURL ?? ""} />
          <AvatarFallback>{user?.displayName?.[0] ?? "U"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{user?.displayName}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
