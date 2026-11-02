import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApolloProvider } from "@apollo/client/react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/onest";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/global.css";
import "./styles/legacy.css";
import App from "./App.tsx";
import { apolloClient } from "./apolloClient";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { OnboardingProvider } from "./onboarding/OnboardingProvider";
import { registerServiceWorker } from "./lib/pwa";

registerServiceWorker();

// Screens load on first open. After a deploy, a tab that's been open a while
// asks for files that no longer exist, so reload once to pick up the new build.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("trackfit.reloadedForDeploy")) return;
    sessionStorage.setItem("trackfit.reloadedForDeploy", "1");
  } catch {
    // ignore storage errors; reloading is still the right fix
  }
  e.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => { try { sessionStorage.removeItem("trackfit.reloadedForDeploy"); } catch { /* ignore */ } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <AuthProvider>
        <BrowserRouter>
          <ToastProvider>
            <OnboardingProvider>
              <App />
            </OnboardingProvider>
          </ToastProvider>
        </BrowserRouter>
      </AuthProvider>
    </ApolloProvider>
  </StrictMode>,
);
