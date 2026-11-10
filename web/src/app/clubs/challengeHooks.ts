import { useMutation, useQuery } from "@apollo/client/react";
import { MY_CLUB_CHALLENGES, RESPOND_TO_CLUB_CHALLENGE } from "../../graphql/operations";
import type { ClubChallengeDto, MyClubChallengeDto } from "../../graphql/types";
import { usePlan } from "../../hooks/usePlan";
import { REFETCH_CHALLENGES } from "../../lib/challengeKinds";
import { useToast } from "../../components/ui/Toast";

/** Hooks for club challenges. */

/** Challenges you've taken on that run on a date. Empty for anyone not in a club. */
export function useMyChallenges(date: string): MyClubChallengeDto[] {
  const { me } = usePlan();
  const q = useQuery<{ myClubChallenges: MyClubChallengeDto[] }>(MY_CLUB_CHALLENGES, { variables: { date }, skip: !me?.showClubs, fetchPolicy: "cache-and-network" });
  return q.data?.myClubChallenges ?? [];
}

/** "Take on challenge" or "Not for me". Returns whether it saved. */
export function useRespond() {
  const toast = useToast();
  const [respond, { loading }] = useMutation(RESPOND_TO_CLUB_CHALLENGE, { refetchQueries: REFETCH_CHALLENGES });
  const answer = async (c: ClubChallengeDto, join: boolean) => {
    try {
      await respond({ variables: { id: c.id, join } });
      toast(join ? `You're in. ${c.title} is on Today.` : "Got it. We won't offer that one again.");
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that. Try again."); return false; }
  };
  return { answer, loading };
}
