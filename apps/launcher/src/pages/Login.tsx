import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login, loginWithCode, isAuthenticating, error } = useAuth();
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState("");
  const [port, setPort] = useState(0);

  const handleLogin = async () => {
    await login();
    // After opening the browser, show the code input
    // The user will paste the code from the redirect URL
    setShowCodeInput(true);
  };

  const handleCodeSubmit = async () => {
    if (!code.trim()) return;
    // Get the port from the store
    const { getSetting } = await import("../lib/store");
    const storedPort = await getSetting<number>("auth_port");
    if (storedPort) {
      await loginWithCode(code.trim(), storedPort);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-bg bg-gradient-subtle">
      <div className="glass p-8 w-[360px] space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-brand bg-clip-text text-transparent">
            방울냥
          </h1>
          <p className="text-sm text-text-muted">마인크래프트 런처</p>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded-lg p-3 text-center">
            {error}
          </div>
        )}

        {!showCodeInput ? (
          /* Login button */
          <button
            onClick={handleLogin}
            disabled={isAuthenticating}
            className={`
              w-full py-3 rounded-xl font-semibold text-white
              bg-gradient-brand transition-all duration-200
              ${isAuthenticating ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02] active:scale-[0.98] cursor-pointer"}
            `}
          >
            {isAuthenticating ? "브라우저 열는 중..." : "Microsoft 계정으로 로그인"}
          </button>
        ) : (
          /* Code input */
          <div className="space-y-3">
            <p className="text-xs text-text-muted text-center leading-relaxed">
              브라우저에서 로그인 후 리다이렉트된 URL의
              <br />
              <span className="text-lavender font-mono">code=</span> 뒤의 값을
              붙여넣으세요
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="인증 코드 입력..."
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border
                text-sm text-text placeholder:text-text-dim
                focus:outline-none focus:border-pink/40 transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCodeInput(false);
                  setCode("");
                }}
                className="flex-1 py-2 rounded-lg text-sm text-text-muted
                  bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleCodeSubmit}
                disabled={!code.trim() || isAuthenticating}
                className={`
                  flex-1 py-2 rounded-lg text-sm font-semibold text-white
                  bg-gradient-brand transition-all duration-200
                  ${!code.trim() || isAuthenticating ? "opacity-50 cursor-not-allowed" : "hover:scale-[1.02] cursor-pointer"}
                `}
              >
                {isAuthenticating ? "인증 중..." : "확인"}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-[10px] text-text-dim text-center">
          Minecraft 1.21.4 | meow.minecraft.skyline23.com
        </p>
      </div>
    </div>
  );
}
