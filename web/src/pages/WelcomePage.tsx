import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Camera, CircleAlert, Image, Lock, Pencil, RefreshCw, Video } from "lucide-react";
import { startSentence } from "@engine";
import { DEV_AUTH_BYPASS, resendVerification } from "../firebase";
import { usePlan, useUnits } from "../hooks/usePlan";
import { useToast } from "../components/ui/Toast";
import { WELCOME_KEY, useOnboarding } from "../onboarding/OnboardingProvider";
import { readJson } from "../lib/storage";
import { checkMediaFile, listMedia, saveMedia, type MediaLabel, type StoredMedia } from "../lib/media";
import { dayShort, localToday } from "../lib/dates";

function Frame({ children, cta, onCta, ctaDisabled }: { children: React.ReactNode; cta: string; onCta: () => void; ctaDisabled?: boolean }) {
  return (
    <div className="app is-plan">
      <main className="stage">
        <div className="top"><div className="brand" style={{ display: "flex" }}><span className="brand-mark"><Activity /></span>TrackFit</div></div>
        <div className="screen-wrap"><section id="screen"><div className="enter">{children}</div></section></div>
        <div className="actions">
          <button className="cta" type="button" onClick={onCta} disabled={ctaDisabled}><span>{cta}</span><ArrowRight /></button>
        </div>
      </main>
    </div>
  );
}

/** "Check your inbox": a preview of the welcome email the backend just sent. */
export function WelcomePage() {
  const { plan, me, loading } = usePlan();
  const units = useUnits();
  const navigate = useNavigate();
  const toast = useToast();
  const info = useMemo(() => readJson<{ method: string; email: string | null }>(WELCOME_KEY, { method: "existing", email: null }), []);
  const today = useMemo(() => localToday(), []);
  const { reset } = useOnboarding();
  useEffect(() => { if (plan) reset(); }, [plan, reset]);
  if (loading) return null;
  if (!plan) return <Navigate to="/start/welcome" replace />;
  const email = info.email ?? me?.email ?? "your inbox";
  const fn = (me?.displayName ?? "").split(/\s+/)[0];
  const verify = info.method === "email";
  const line = startSentence(today, plan.startDate, plan.sessions);
  const resend = async () => {
    try { if (!DEV_AUTH_BYPASS) await resendVerification(); toast("Sent again. It can take a minute to arrive."); }
    catch { toast("Couldn't resend just now. Try again in a minute."); }
  };
  return (
    <Frame cta="Open my plan" onCta={() => navigate("/welcome/photo")}>
      <h1 className="qh">{verify ? <>Check your <mark>inbox</mark>.</> : <>You're in. <mark>Welcome</mark> aboard.</>}</h1>
      <p className="qs">
        {verify ? <>We sent a confirmation link to <b>{email}</b>. Tap it to verify your account. This is what's waiting for you:</>
          : <>We've sent a welcome email to {email} with a link back to your plan.</>}
      </p>
      <div className="qb">
        <div className="mail fadein" style={{ "--d": ".15s" } as CSSProperties}>
          <div className="mail-h">
            <span>From <b>TrackFit</b></span><span>To <b>{email}</b></span>
            <span>Subject <b>{fn ? `${fn}, your` : "Your"} TrackFit plan is ready</b></span>
          </div>
          <div className="mail-b">
            <h2>Welcome to TrackFit{fn ? `, ${fn}` : ""}.</h2>
            <p>{line}</p>
            <div className="mail-sum">
              <div><b>{plan.daysPerWeek} days</b>a week, {plan.profile.sessionMinutes} min</div>
              <div><b>{plan.targets.kcal.toLocaleString("en-GB")}</b>kcal a day</div>
              <div>
                <b>{plan.projection && plan.profile.targetWeightKg ? units.fmt(plan.profile.targetWeightKg) : "6 wks"}</b>
                {plan.projection ? `by ${new Date(plan.projection.endDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "cycle 1"}
              </div>
            </div>
            {verify ? <><p>First, confirm this is your email so we can keep your plan safe.</p><span className="mail-btn">Confirm and open my plan</span></> : <span className="mail-btn">Open my plan</span>}
            <p>Your plan adapts every 6 weeks from your check-ins. Reply to this email any time, a real person reads it.</p>
            <div className="mail-foot">You're getting this because you created a TrackFit account with {email}.</div>
          </div>
        </div>
        {verify && (
          <>
            <div className="btnrow" style={{ marginTop: 16 }}>
              <button type="button" className="linkbtn" onClick={resend}><RefreshCw />Resend email</button>
              <button type="button" className="linkbtn" onClick={() => toast("To use a different email, sign out from your profile and create the account again.")}><Pencil />Wrong email?</button>
            </div>
            <p className="help" style={{ marginTop: 10, maxWidth: "56ch" }}>You can start training now. We'll keep reminding you to confirm for 7 days so your plan stays safe.</p>
          </>
        )}
        {DEV_AUTH_BYPASS && <p className="help" style={{ marginTop: 12 }}>Dev mode: the real email is printed in the backend console (MAIL_PROVIDER=console).</p>}
      </div>
    </Frame>
  );
}

/** Upload box with the 10 MB photo / 30 s, 50 MB video limits. Media stays on this device for now. */
export function MediaUpload({ label, onSaved }: { label: MediaLabel; onSaved?: (m: StoredMedia) => void }) {
  const [current, setCurrent] = useState<StoredMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void listMedia().then((all) => setCurrent(all.find((m) => m.label === label) ?? null)); }, [label]);
  useEffect(() => {
    if (!current) { setUrl(null); return; }
    const u = URL.createObjectURL(current.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [current]);
  const id = `f-media-${label.replace(/\s/g, "")}`;
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const res = await checkMediaFile(f);
    if ("error" in res) { setError(res.error); return; }
    const m: StoredMedia = { label, kind: res.kind, blob: f, savedAt: Date.now() };
    try { await saveMedia(m); } catch { setError("Couldn't save on this device. Check your browser storage settings."); return; }
    setError(null);
    setCurrent(m);
    toast(`${label} ${res.kind === "video" ? "video" : "photo"} saved.`);
    onSaved?.(m);
    if (input.current) input.current.value = "";
  };
  return (
    <>
      <label className="drop" htmlFor={id}>
        <span className="big-ico"><Camera /></span>
        <b>{current ? "Replace" : "Add"} a photo or short video</b>
        <span className="help">Front-facing, good light, same spot each time. Wear what you train in.</span>
        <span className="limits"><span><Image />Photos up to 10 MB</span><span><Video />Videos up to 30 s and 50 MB</span></span>
      </label>
      <input ref={input} type="file" id={id} accept="image/*,video/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      {error && <div className="err" role="alert"><CircleAlert /><span>{error}</span></div>}
      {current && url && (
        <div className="media-prev">
          {current.kind === "video" ? <video src={url} controls muted playsInline /> : <img src={url} alt={`${label} progress photo`} />}
          <span className="cap">{label}, {dayShort(new Date(current.savedAt).toISOString().slice(0, 10))}</span>
        </div>
      )}
      <div className="note"><Lock /><span>Private to you and kept on this device for now. Never shared to clubs or anyone else, and you can replace it any time.</span></div>
    </>
  );
}

export function WelcomePhotoPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  useEffect(() => { void listMedia().then((all) => setSaved(all.some((m) => m.label === "Day 1"))); }, []);
  return (
    <Frame cta={saved ? "Save and go to my plan" : "Skip for now"} onCta={() => navigate("/today", { replace: true })}>
      <h1 className="qh">Capture your <mark>starting point</mark>?</h1>
      <p className="qs">Progress you can see beats any number on a scale. Add a photo or a short video now, and we'll ask again at week 3 and week 6.</p>
      <div className="qb"><MediaUpload label="Day 1" onSaved={() => setSaved(true)} /></div>
    </Frame>
  );
}
