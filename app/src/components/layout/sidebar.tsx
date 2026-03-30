"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, ShoppingCart, TrendingUp, CreditCard,
  Landmark, BookOpen, Users, Package, Settings, FileCheck, Upload, LogOut
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart },
  { label: "Sales", href: "/sales", icon: TrendingUp },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "CC Ledger", href: "/cc-ledger", icon: Landmark },
  { label: "Ledger", href: "/ledger", icon: BookOpen },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Recon", href: "/recon", icon: FileCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="hidden md:flex w-[220px] flex-col border-r border-gray-100 bg-white h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">SYT</h1>
        <p className="text-[11px] text-gray-400 font-medium">Sarthak Yarn Trading</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 mb-0.5 ${
                isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-gray-100 px-3 py-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
            {session?.user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-gray-700 truncate">{session?.user?.name || "User"}</p>
            <p className="text-[11px] text-gray-400 truncate">{session?.user?.email || session?.user?.phone}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150 w-full"
        >
          <LogOut size={16} strokeWidth={1.5} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
