import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { Activity, ArrowRight, Check, CircleAlert, Clock, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { DEV_AUTH_BYPASS, refreshEmailVerified, resendVerification } from "../firebase";
import { JOIN_CLUB, JOIN_PREVIEW, MY_CLUBS, MY_PLAN } from "../graphql/operations";
import type { JoinPreviewDto } from "../graphql/types";
import { usePlan } from "../hooks/usePlan";
import { clearPendingJoin, savePendingJoin } from "../lib/pendingJoin";
import { useToast } from "../components/ui/Toast";
import { PulseLoader } from "../components/ui/PulseLoader";

/** Same frame as the sign-in page. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="app is-plan">
      <main className="stage">
        <div className="top"><div className="brand" style={{ display: "flex" }}><span className="brand-mark"><Activity /></span>TrackFit</div></div>
        <div className="screen-wrap"><section id="screen"><div className="enter">{children}</div></section></div>
      </main>
    </div>
  );
}

/**
 * Where club invite emails and join links land (/join/:token). Works signed
 * out: it shows the club, then sends people to sign in or build their plan
 * first, and the app brings them back here afterwards.
 */
export function JoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { ready } = useAuth();
  const { signedIn, loading: planLoading, plan } = usePlan();
  const q = useQuery<{ joinPreview: JoinPreviewDto | null }>(JOIN_PREVIEW, { variables: { token }, fetchPolicy: "network-only", skip: !ready });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [join, { loading: joining }] = useMutation<{ joinClub: { clubId: string; status: string } }>(JOIN_CLUB, {
    refetchQueries: [{ query: MY_PLAN }, { query: MY_CLUBS }],
    awaitRefetchQueries: true,
  });

  if (!ready || q.loading || planLoading) return <PulseLoader full />;
  if (q.error) return <Frame><h1 className="qh">Couldn't open this link.</h1><p className="qs">Check your connection, then refresh. ({q.error.message})</p></Frame>;

  const p = q.data?.joinPreview;
  const later = (to: string) => { savePendingJoin(token); navigate(to); };

  if (!p) {
    return (
      <Frame>
        <h1 className="qh">This link doesn't work.</h1>
        <p className="qs">Check you copied all of it, or ask the club's Admins for a new one.</p>
        <div className="qb"><Link className="cta" to="/">Go to TrackFit<ArrowRight /></Link></div>
      </Frame>
    );
  }

  const heading = <h1 className="qh">{p.asAdmin ? <>Run <mark>{p.clubName}</mark></> : <>Join <mark>{p.clubName}</mark></>}</h1>;
  const about = p.description ? <p className="qs">{p.description}</p> : null;

  if (p.myStatus === "ACTIVE" && p.clubId) {
    return (
      <Frame>
        {heading}
        <p className="qs">You're already in this club.</p>
        <div className="qb"><button type="button" className="cta" onClick={() => { clearPendingJoin(); navigate(`/clubs/${p.clubId}`); }}>Open the club<ArrowRight /></button></div>
      </Frame>
    );
  }
  if (waiting || p.myStatus === "WAITING") {
    return (
      <Frame>
        {heading}
        <div className="tip" style={{ marginTop: 18 }}><span className="ic"><Clock /></span><div><b>Waiting for approval</b><p>The club's Admins have your request. You'll find the club under Clubs once they approve it.</p></div></div>
        <div className="qb"><Link className="cta" to="/clubs">Go to Clubs<ArrowRight /></Link></div>
      </Frame>
    );
  }
  if (p.problem) {
    return (
      <Frame>
        {heading}
        <div className="err" role="alert"><CircleAlert /><span>{p.problem}</span></div>
        <div className="qb"><Link className="cta" to="/" onClick={clearPendingJoin}>Go to TrackFit<ArrowRight /></Link></div>
      </Frame>
    );
  }

  const inviteNote = p.kind === "INVITE" && p.emailHint ? <p className="help">This invite was sent to <b>{p.emailHint}</b>. Use that address to accept it.</p> : null;

  if (!signedIn) {
    return (
      <Frame>
        {heading}
        {about}
        <div className="qb" style={{ display: "grid", gap: 14 }}>
          {inviteNote}
          <button type="button" className="cta" onClick={() => later("/start/welcome")}>I'm new: build my plan first<ArrowRight /></button>
          <button type="button" className="ghost" style={{ justifySelf: "start" }} onClick={() => later("/signin")}>I have an account: sign in</button>
          <p className="help">Building your plan takes about 6 minutes. You'll come back here when it's done.</p>
        </div>
      </Frame>
    );
  }

  if (!plan) {
    return (
      <Frame>
        {heading}
        {about}
        <p className="qs">Finish building your TrackFit plan first. It takes about 6 minutes, and you'll come back here when it's done.</p>
        <div className="qb"><button type="button" className="cta" onClick={() => later("/start/welcome")}>Build my plan<ArrowRight /></button></div>
      </Frame>
    );
  }

  const submit = async () => {
    setError(null);
    try {
      let res;
      try {
        res = await join({ variables: { token, consent } });
      } catch (e) {
        // Confirmed the email since this tab got its sign-in token: refresh it and try once more.
        if (DEV_AUTH_BYPASS || !(e instanceof Error) || !/Confirm your email/.test(e.message) || !(await refreshEmailVerified())) throw e;
        res = await join({ variables: { token, consent } });
      }
      clearPendingJoin();
      const r = res.data?.joinClub;
      if (r?.status === "ACTIVE") {
        toast(`You're in ${p.clubName}.`);
        navigate(`/clubs/${r.clubId}`, { replace: true });
      } else setWaiting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join. Try again.");
    }
  };
  const unverified = !!error && /Confirm your email/.test(error);

  return (
    <Frame>
      {heading}
      {about}
      <div className="qb" style={{ display: "grid", gap: 16 }}>
        {inviteNote}
        <button type="button" className={`opt noico${consent ? " on" : ""}`} role="checkbox" aria-checked={consent} onClick={() => setConsent(!consent)}>
          <span>
            <span className="t">The club's coaches will see the workouts and activities I log</span>
            <span className="d" style={{ display: "block" }}>From today. Your food, water, weight and photos stay private unless you post them. Leaving the club ends this at once.</span>
          </span>
          <span className="tick"><Check /></span>
        </button>
        <button type="button" className="cta" disabled={!consent || joining} onClick={() => void submit()}>
          {p.kind === "INVITE" ? (p.asAdmin ? "Accept and run the club" : "Join the club") : "Ask to join"}<Users />
        </button>
        {p.kind === "LINK" && <p className="help">An Admin approves each request made with a join link.</p>}
        {error && <div className="err" role="alert"><CircleAlert /><span>{error}</span></div>}
        {unverified && !DEV_AUTH_BYPASS && (
          <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => {
            resendVerification().then(() => toast("Confirmation email sent. Open it, then come back and try again."), () => toast("Couldn't send it. Try again in a minute."));
          }}>Send the confirmation email again</button>
        )}
        <Link className="help" to="/today" onClick={clearPendingJoin}>Not now</Link>
      </div>
    </Frame>
  );
}
