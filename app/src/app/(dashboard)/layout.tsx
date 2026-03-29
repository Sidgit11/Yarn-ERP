import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";

function MobileHeader() {
  return (
    <div
      className="md:hidden sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-gray-200"
      style={{ backgroundColor: 'var(--color-header-bg)' }}
    >
      <h1 className="text-lg font-bold text-white">SYT</h1>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-xs text-blue-200">Online</span>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <MobileHeader />
      <main className="md:ml-[240px] pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
