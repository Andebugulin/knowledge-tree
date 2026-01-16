"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      router.push("/login?registered=true");
    } catch (err) {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-[#12121A] border border-[#1A1A24] rounded-lg shadow-2xl p-8 space-y-8">
          <div>
            <h2 className="text-3xl font-light text-white mb-2 tracking-wide">
              Create Account
            </h2>
            <p className="text-sm text-gray-500 font-light">
              Start building your knowledge tree
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-[#FF204E]/20 border border-[#FF204E]/30 text-gray-300 p-3 rounded-md text-sm font-light">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-base placeholder-gray-600 focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none font-light transition-all duration-200"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-base placeholder-gray-600 focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none font-light transition-all duration-200"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5D0E41] hover:bg-[#A0153E] text-white px-5 py-3 rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg"
            >
              {loading ? "Creating account..." : "Register"}
            </button>

            <p className="text-center text-sm text-gray-500 font-light">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-[#A0153E] hover:text-[#FF204E] font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
