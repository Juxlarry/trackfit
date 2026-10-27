import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useApolloClient } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { COMPLETE_ONBOARDING, MY_PLAN, SET_TRAINING_DAYS, UPDATE_UNITS } from "../graphql/operations";
import { writeJson } from "../lib/storage";
import { clearDraft, emptyDraft, loadDraft, saveDraft, toOnboardingInput, type Draft } from "./draft";

interface OnboardingState {
  draft: Draft;
  /** Synchronously updated copy, for handlers that run right after set(). */
  latest: () => Draft;
  set: (patch: Partial<Draft>) => void;
  replace: (d: Draft) => void;
  reset: () => void;
}

const Ctx = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const ref = useRef(draft);
  const replace = useCallback((d: Draft) => { ref.current = d; setDraft(d); saveDraft(d); }, []);
  const set = useCallback((patch: Partial<Draft>) => replace({ ...ref.current, ...patch }), [replace]);
  const reset = useCallback(() => { clearDraft(); ref.current = emptyDraft(); setDraft(ref.current); }, []);
  const value = useMemo(() => ({ draft, latest: () => ref.current, set, replace, reset }), [draft, set, replace, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}

/**
 * Submits the finished draft once the user has an account: health gate +
 * generation in one call, then applies the ±1 days picked on the reveal and
 * the unit preference, refreshes the plan and opens the welcome screen.
 */
/** What the welcome screen needs after the draft is cleared. */
export const WELCOME_KEY = "trackfit.welcome";

export function useSubmitPlan() {
  const client = useApolloClient();
  const navigate = useNavigate();
  const { latest } = useOnboarding();
  return useCallback(async (email: string | null, method: "google" | "email" | "existing" = "existing") => {
    const d = latest();
    const res = await client.mutate<{ completeOnboarding: { screenedOut: boolean; message: string | null } }>({
      mutation: COMPLETE_ONBOARDING,
      variables: { input: toOnboardingInput(d, email) },
    });
    if (res.data?.completeOnboarding.screenedOut) {
      navigate("/start/screened", { replace: true });
      return;
    }
    if (d.revealDays && d.revealDays !== d.daysPerWeek) {
      await client.mutate({ mutation: SET_TRAINING_DAYS, variables: { days: d.revealDays } });
    }
    if (d.weightUnit === "lb") await client.mutate({ mutation: UPDATE_UNITS, variables: { units: "IMPERIAL" } });
    // ActivePlan has no id, so refresh the root query explicitly rather than relying on cache normalisation.
    await client.query({ query: MY_PLAN, fetchPolicy: "network-only" });
    writeJson(WELCOME_KEY, { method, email });
    // The welcome screen clears the draft once it mounts; clearing it here
    // would bounce the still-mounted quiz back to its first step.
    navigate("/welcome", { replace: true });
  }, [client, latest, navigate]);
}
