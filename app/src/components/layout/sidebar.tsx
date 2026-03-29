"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, TrendingUp, CreditCard,
  Landmark, BookOpen, Users, Package, Settings, FileCheck
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
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Recon", href: "/recon", icon: FileCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[240px] flex-col border-r border-gray-200 bg-white h-screen fixed left-0 top-0">
      <div className="px-5 py-4 border-b border-gray-200" style={{ backgroundColor: 'var(--color-header-bg)' }}>
        <h1 className="text-xl font-bold text-white">SYT</h1>
        <p className="text-xs text-blue-200">Sarthak Yarn Trading</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-100 text-[#1B4F72] font-semibold border-l-4 border-[#1B4F72]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
