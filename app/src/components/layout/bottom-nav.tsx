"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, PackagePlus, IndianRupee, CreditCard,
  Menu, Landmark, BookOpen, Users, Package, Settings, FileCheck, X
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
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">More</h3>
              <button onClick={() => setShowMore(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs ${
                      isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={22} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {mainTabs.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs ${
                  isActive ? "text-blue-600 font-medium" : "text-gray-500"
                }`}
              >
                <Icon size={22} />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs ${
              isMoreActive ? "text-blue-600 font-medium" : "text-gray-500"
            }`}
          >
            <Menu size={22} />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
