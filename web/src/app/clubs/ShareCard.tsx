import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Pencil, Send, Users } from "lucide-react";
import { CLUB_SHARE_DRAFT, CREATE_CLUB_POST } from "../../graphql/operations";
import type { ClubShareDraftDto } from "../../graphql/types";
import { usePlan } from "../../hooks/usePlan";
import { useToast } from "../../components/ui/Toast";
import { Composer, type ShareLink } from "./Composer";

const names = (cs: { name: string }[]) => (cs.length <= 2 ? cs.map((c) => c.name).join(" and ") : `${cs.slice(0, -1).map((c) => c.name).join(", ")} and ${cs[cs.length - 1].name}`);

/**
 * "Share with <club>?" after a workout or activity (README "Sharing after a
 * workout or activity"). Shows nothing unless the member is in a club that
 * wants to be asked. Nothing posts until they tap Post.
 */
export function ShareCard({ link, onEditing }: { link: ShareLink; onEditing?: (editing: boolean) => void }) {
  const toast = useToast();
  const { me } = usePlan();
  const [state, setState] = useState<"ask" | "edit" | "done" | "dismissed">("ask");
  const q = useQuery<{ clubShareDraft: ClubShareDraftDto }>(CLUB_SHARE_DRAFT, { variables: link, skip: !me?.showClubs, fetchPolicy: "network-only" });
  const [create, { loading }] = useMutation(CREATE_CLUB_POST, { refetchQueries: ["ClubFeed"] });
  const draft = q.data?.clubShareDraft;
  if (!draft || !draft.clubs.length || state === "dismissed") return null;

  if (state === "done") return <div className="share-card done"><Users /><span>Shared with {names(draft.clubs)}.</span></div>;
  if (state === "edit") {
    return (
      <div className="share-card editing">
        {/* Coach-only options are left out here: this is the member's own log. */}
        <Composer clubs={draft.clubs} isCoach={false} link={link} draft={draft.text} onDone={() => { setState("done"); onEditing?.(false); }} />
        <button type="button" className="linkbtn" style={{ marginTop: 10 }} onClick={() => { setState("ask"); onEditing?.(false); }}>Back</button>
      </div>
    );
  }
  const post = async () => {
    try {
      await create({ variables: { input: { clubIds: draft.clubs.map((c) => c.id), body: draft.text, ...link } } });
      setState("done");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't post that. Try again."); }
  };
  return (
    <section className="share-card" aria-label="Share with your club">
      <div className="t"><Users />Share with {names(draft.clubs)}?</div>
      <p className="draft">{draft.text}</p>
      <div className="btnrow">
        <button type="button" className="cta small-cta" disabled={loading} onClick={() => void post()}>Post<Send /></button>
        <button type="button" className="ghost" onClick={() => { setState("edit"); onEditing?.(true); }}><Pencil />Edit</button>
        <button type="button" className="linkbtn" onClick={() => setState("dismissed")}>Not now</button>
      </div>
      <p className="help">Turn this off for a club on its page, under Club.</p>
    </section>
  );
}
