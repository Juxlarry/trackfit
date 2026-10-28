import { useQuery } from "@apollo/client/react";
import { MY_PLAN } from "../graphql/operations";
import type { MyPlanData } from "../graphql/types";
import { useIsSignedIn } from "../auth/AuthContext";

/** The signed-in user's profile + active plan (null plan = not onboarded yet). */
export function usePlan() {
  const signedIn = useIsSignedIn();
  const q = useQuery<MyPlanData>(MY_PLAN, { skip: !signedIn, fetchPolicy: "cache-first" });
  return {
    signedIn,
    loading: signedIn && q.loading && !q.data,
    error: q.error,
    me: q.data?.me ?? null,
    plan: q.data?.myPlan ?? null,
    refetch: q.refetch,
  };
}

/** Weight display in the user's unit. */
export function useUnits() {
  const { me } = usePlan();
  const imperial = me?.units === "IMPERIAL";
  return {
    unit: imperial ? "lb" : "kg",
    toDisplay: (kg: number) => (imperial ? Math.round(kg * 2.20462 * 2) / 2 : Math.round(kg * 10) / 10),
    fromDisplay: (v: number) => (imperial ? v / 2.20462 : v),
    fmt: (kg: number) => (imperial ? `${Math.round(kg * 2.20462)} lb` : `${Math.round(kg * 10) / 10} kg`),
  };
}
