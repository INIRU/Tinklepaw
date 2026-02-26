import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

type Page = "home" | "settings";

export default function App() {
  const { isLoggedIn, isLoading, loadStoredAuth } = useAuth();
  const [page, setPage] = useState<Page>("home");

  useEffect(() => {
    loadStoredAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="text-3xl font-bold bg-gradient-brand bg-clip-text text-transparent">
            방울냥
          </div>
          <div className="text-text-muted text-sm">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login />;
  }

  return (
    <div className="w-full h-full">
      {page === "home" && <Home onNavigate={setPage} />}
      {page === "settings" && <Settings onNavigate={setPage} />}
    </div>
  );
}
