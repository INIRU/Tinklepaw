import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login, isAuthenticating, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <div className="relative w-full h-full overflow-hidden launcher-bg stars-layer flex items-center justify-center">

      {/* Card */}
      <div
        className="glass-strong relative z-10 animate-fade-in-up"
        style={{
          width: "360px",
          borderRadius: "20px",
          padding: "40px 36px 36px",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {/* Logo */}
        <div className="text-center" style={{ marginBottom: "32px" }}>
          {/* Sparkle line */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="w-10 h-px bg-gradient-to-r from-transparent to-pink/40" />
            <span className="text-[9px] text-pink/55 tracking-[0.35em] uppercase font-semibold">방울냥 서버</span>
            <span className="w-10 h-px bg-gradient-to-l from-transparent to-pink/40" />
          </div>

          <h1
            className="gradient-text animate-logo-glow select-none"
            style={{
              fontSize: "64px",
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            방울냥
          </h1>

          <p className="text-[12px] text-text-muted mt-3 leading-relaxed">
            마인크래프트와 Discord를 연결하세요
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center"
            style={{ marginBottom: "16px" }}
          >
            {error}
          </div>
        )}

        {/* Microsoft login button */}
        <button
          onClick={handleLogin}
          disabled={isAuthenticating}
          className={`
            w-full flex items-center justify-center gap-3
            bg-white text-[#1a1a1a] font-semibold text-[14px]
            rounded-2xl transition-all duration-200
            ${isAuthenticating
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-black/30"
            }
          `}
          style={{ height: "48px" }}
        >
          {/* Microsoft logo */}
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
            <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          {isAuthenticating ? "로그인 창 열는 중..." : "Microsoft 계정으로 로그인"}
        </button>

        {/* Footer */}
        <p className="text-[10px] text-text-dim text-center mt-6 tracking-wide">
          Minecraft 1.21.11 · meow.minecraft.skyline23.com
        </p>
      </div>

      {/* Subtle vignette at edges */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(10,10,20,0.6) 100%)",
        }}
      />
    </div>
  );
}
