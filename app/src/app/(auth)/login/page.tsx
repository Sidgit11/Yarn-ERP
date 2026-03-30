"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SYT ERP</h1>
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
            disabled={loading}
            className="w-full min-h-[48px] bg-gray-900 text-white py-3 rounded-xl text-[15px] font-semibold hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
