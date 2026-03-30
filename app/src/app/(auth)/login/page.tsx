"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email/phone or password");
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setError("");

    const result = await signIn("credentials", {
      login: "demo@syt.app",
      password: "demo123",
      redirect: false,
    });

    if (result?.error) {
      setError("Demo account not available. Please contact support.");
      setDemoLoading(false);
    } else {
      router.push("/?tour=1");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SYT</h1>
          <p className="text-gray-400 text-sm mt-1">Sarthak Yarn Trading</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-2xl border border-gray-100 space-y-5"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
              Email or Phone
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="you@example.com or 9876543210"
              className="w-full min-h-[48px] px-3.5 py-3 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full min-h-[48px] px-3.5 py-3 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 px-3 py-2.5 rounded-xl border border-red-100">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || demoLoading}
            className="w-full min-h-[48px] bg-gray-900 text-white py-3 rounded-xl text-[15px] font-semibold hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Demo Login */}
        <div className="mt-4">
          <div className="relative flex items-center justify-center mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <span className="relative bg-[var(--color-bg)] px-3 text-xs text-gray-400">or</span>
          </div>
          <button
            onClick={handleDemoLogin}
            disabled={loading || demoLoading}
            className="w-full min-h-[48px] bg-blue-50 text-blue-700 border border-blue-200 py-3 rounded-xl text-[15px] font-semibold hover:bg-blue-100 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Play size={16} fill="currentColor" />
            {demoLoading ? "Loading demo..." : "Try Demo"}
          </button>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            Pre-loaded with sample yarn trading data
          </p>
        </div>
      </div>
    </div>
  );
}
