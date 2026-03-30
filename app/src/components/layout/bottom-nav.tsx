"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, PackagePlus, IndianRupee, CreditCard,
  Menu, Landmark, BookOpen, Users, Package, Settings, FileCheck, Upload, X, LogOut
} from "lucide-react";

const mainTabs = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Buy", href: "/purchases", icon: PackagePlus },
  { label: "Sell", href: "/sales", icon: IndianRupee },
  { label: "Pay", href: "/payments", icon: CreditCard },
];

const moreItems = [
  { label: "CC Ledger", href: "/cc-ledger", icon: Landmark },
  { label: "Ledger", href: "/ledger", icon: BookOpen },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Recon", href: "/recon", icon: FileCheck },
];

export function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href)
  );

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl p-5 animate-slide-up"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">More</h3>
              <button onClick={() => setShowMore(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.5} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
              >
                <LogOut size={18} strokeWidth={1.5} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 backdrop-blur-md border-t border-gray-100 safe-area-bottom" data-tour="tour-nav">
        <div className="flex items-center justify-around h-16">
          {mainTabs.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
                  isActive ? "text-gray-900" : "text-gray-400"
                }`}
              >
                <div className={`p-1 rounded-lg transition-colors ${isActive ? "bg-gray-900 text-white" : ""}`}>
                  <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                </div>
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
              isMoreActive ? "text-gray-900" : "text-gray-400"
            }`}
          >
            <div className={`p-1 rounded-lg transition-colors ${isMoreActive ? "bg-gray-900 text-white" : ""}`}>
              <Menu size={20} strokeWidth={isMoreActive ? 2 : 1.5} />
            </div>
            More
          </button>
        </div>
      </nav>
    </>
  );
}
