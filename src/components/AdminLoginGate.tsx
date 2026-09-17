import React, { useState } from "react";
import { Lock, Eye, EyeOff, AlertCircle, RefreshCw, KeyRound, ShieldAlert } from "lucide-react";
// @ts-ignore
import adminSecShieldImg from "../assets/images/admin_sec_shield_1781288198153.jpg";

interface AdminLoginGateProps {
  onLoginSuccess: (token: string) => void;
  theme: "light" | "dark";
}

export default function AdminLoginGate({ onLoginSuccess, theme }: AdminLoginGateProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please input your verification passphrase.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Please verify credentials.");
      }

      if (data.success && data.token) {
        onLoginSuccess(data.token);
      } else {
        throw new Error("Invalid response format received from system security.");
      }
    } catch (err: any) {
      setError(err.message || "Unable to complete secure authentication.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-12 animate-in fade-in duration-300">
      <div
        className={`rounded-3xl border shadow-xl overflow-hidden backdrop-blur-md transition-colors duration-300 ${
          theme === "dark"
            ? "bg-[#061e33]/95 border-indigo-500/10 text-white shadow-[#010810]/50"
            : "bg-white border-[#00A859]/10 text-slate-800 shadow-emerald-950/5"
        }`}
      >
        {/* Superior Header accent lines */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${theme === "dark" ? "from-[#00609C] to-indigo-500" : "from-[#00A859] to-emerald-400"}`} />

        <div className="p-8">
          <div className="flex flex-col items-center text-center space-y-4 mb-6">
            <div className="relative mb-1 shrink-0">
              <div className={`absolute inset-0 rounded-full blur-lg opacity-40 transition-all ${
                theme === "dark" ? "bg-sky-500/40" : "bg-emerald-500/25"
              }`} />
              <img
                src={adminSecShieldImg}
                alt="Secure Admin Verification Shield"
                referrerPolicy="no-referrer"
                className={`relative w-28 h-28 rounded-full border-2 object-cover shadow-xl transition-transform hover:scale-[1.03] duration-500 ${
                  theme === "dark" 
                    ? "border-sky-500/20 shadow-[#010810]/80" 
                    : "border-[#00a859]/20 shadow-emerald-950/10"
                }`}
              />
            </div>
            
            <h2 className="text-xl font-bold tracking-tight">
              Secure Authorization
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${theme === "dark" ? "text-slate-300" : "text-slate-600"}`}>
                Enter Administrator PIN / Passphrase:
              </label>
              
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••"
                  className={`w-full pl-10 pr-10 py-3 rounded-2xl text-sm font-semibold border shadow-sm outline-none transition-all leading-none ${
                    theme === "dark"
                      ? "bg-[#081a29]/90 border-white/10 text-white focus:border-[#00609C] placeholder-slate-600"
                      : "bg-white border-slate-200 text-slate-800 focus:border-[#00A859] placeholder-slate-400"
                  }`}
                  id="admin-passphrase-input"
                  disabled={isSubmitting}
                />
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-450 pointer-events-none" />
                
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors cursor-pointer ${
                    theme === "dark" ? "hover:bg-white/10 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                  }`}
                  aria-label={showPassword ? "Hide passphrase" : "Show passphrase"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-start space-x-2.5 animate-in shake duration-200 ${
                  theme === "dark"
                    ? "bg-rose-950/20 border-rose-500/20 text-rose-350"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
                isSubmitting ? "opacity-75 cursor-not-allowed" : ""
              } ${
                theme === "dark"
                  ? "bg-[#00609C] hover:bg-sky-600 text-white shadow-sky-950/20"
                  : "bg-[#00A859] hover:bg-[#018546] text-white shadow-emerald-800/10"
              }`}
              id="admin-submit-auth-btn"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Configuring Session...</span>
                </>
              ) : (
                <span>Access Protected Console</span>
              )}
            </button>
          </form>

          {/* Secure developer assistance helper to let users test instantly */}
          <div
            className={`mt-6 p-4 rounded-2xl border text-[11px] leading-relaxed flex items-start space-x-2.5 transition-colors ${
              theme === "dark"
                ? "bg-[#071725] border-white/5 text-slate-405"
                : "bg-slate-50 border-slate-200 text-slate-500"
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500/80 mt-0.5" />
            <div>
              <strong className={theme === "dark" ? "text-slate-300" : "text-slate-700"}>Testing Credentials:</strong> Use <code className="font-mono bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-bold text-amber-400">ABROKenya@2026</code> to authorize your current session. You can customize this passphrase in the environment secrets.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
