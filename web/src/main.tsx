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
