import { useMutation } from "@apollo/client/react";
import { MY_PLAN, RESET_PLAN_EXERCISE } from "../graphql/operations";
import { useToast } from "../components/ui/Toast";

/** "Back to …" for a cycle swap. */
export function useResetSwap() {
  const toast = useToast();
  const [reset, { loading }] = useMutation(RESET_PLAN_EXERCISE, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  return {
    loading,
    reset: async (templateId: string, exerciseId: string, original: string) => {
      try { await reset({ variables: { templateId, exerciseId } }); toast(`Back to ${original}.`); }
      catch (e) { toast(e instanceof Error ? e.message : "Couldn't undo that. Try again."); }
    },
  };
}
