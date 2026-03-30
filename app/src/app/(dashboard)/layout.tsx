import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GuidedTour } from "@/components/shared/guided-tour";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";

function MobileHeader() {
  return (
    <div className="md:hidden sticky top-0 z-20 px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100">
      <div>
        <h1 className="text-base font-bold text-gray-900 tracking-tight">TradeTexPro</h1>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[11px] text-gray-400 font-medium">Online</span>
      </div>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Sidebar />
      <MobileHeader />
      <main className="md:ml-[220px] pb-20 md:pb-0">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomNav />
      <GuidedTour />
    </div>
  );
}
