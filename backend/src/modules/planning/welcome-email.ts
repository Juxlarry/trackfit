import { addDaysIso, weekdayOf, type Projection, type Targets } from "./engine/index.js";
import type { OutgoingEmail } from "../../shared/email/mailer.js";

const DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${DAY[weekdayOf(iso)]} ${d} ${MONTH[m - 1]}`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * The start-date sentence from onboarding-flow.md, e.g.
 * "You start tomorrow, Tuesday 27 October, with Lower. We'll send a reminder tonight."
 */
export function startSentence(todayIso: string, startIso: string, sessions: { weekday: number; name: string }[]): string {
  let first = sessions[0];
  let offset = 0;
  for (let k = 0; k < 7; k++) {
    const hit = sessions.find((s) => s.weekday === weekdayOf(addDaysIso(startIso, k)));
    if (hit) { first = hit; offset = k; break; }
  }
  const firstDate = addDaysIso(startIso, offset);
  const when = offset === 0 ? "" : ` on ${longDate(firstDate)}`;
  if (startIso === todayIso) {
    return offset === 0
      ? `You start today. Your first session, ${first.name}, is ready when you are.`
      : `You start today. It's a rest day, so your first session is ${first.name}${when}.`;
  }
  if (startIso === addDaysIso(todayIso, 1)) return `You start tomorrow, ${longDate(startIso)}, with ${first.name}${when}. We'll send a reminder tonight.`;
  return `You start on ${longDate(startIso)} with ${first.name}${when}. We'll remind you the evening before.`;
}

export function welcomeEmail(p: {
  to: string;
  firstName: string;
  todayIso: string;
  startIso: string;
  sessions: { weekday: number; name: string }[];
  daysPerWeek: number;
  sessionMinutes: number;
  targets: Targets;
  projection: Projection | null;
  targetWeightKg: number | null;
  planUrl: string;
  needsVerification: boolean;
}): OutgoingEmail {
  const name = p.firstName || "there";
  const start = startSentence(p.todayIso, p.startIso, p.sessions);
  const goalLine = p.projection && p.targetWeightKg
    ? `${p.targetWeightKg} kg by ${p.projection.endDate.split("-").reverse().join("/")}`
    : "6-week cycle 1";
  const subject = `${p.firstName ? p.firstName + ", your" : "Your"} TrackFit plan is ready`;
  const cta = p.needsVerification ? "Confirm and open my plan" : "Open my plan";
  const text = [
    `Welcome to TrackFit, ${name}.`,
    "",
    start,
    "",
    `Your plan: ${p.daysPerWeek} days a week, ${p.sessionMinutes} min sessions. ${p.targets.kcal} kcal and ${p.targets.proteinG} g protein a day. Goal: ${goalLine}.`,
    "",
    p.needsVerification ? "First, confirm this is your email so we can keep your plan safe." : "",
    `${cta}: ${p.planUrl}`,
    "",
    "Your plan adapts every 6 weeks from your check-ins. Reply to this email any time, a real person reads it.",
    "",
    `You're getting this because you created a TrackFit account with ${p.to}.`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#F6F4EE;font-family:Arial,Helvetica,sans-serif;color:#12261E">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-weight:bold;font-size:18px;margin:0 0 20px">TrackFit</p>
<h1 style="font-size:24px;margin:0 0 12px">Welcome to TrackFit, ${esc(name)}.</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 18px">${esc(start)}</p>
<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 18px"><tr>
<td style="background:#E3EFD9;border-radius:12px;padding:10px 12px;font-size:12px"><b style="display:block;font-size:16px">${p.daysPerWeek} days</b>a week, ${p.sessionMinutes} min</td>
<td style="background:#E3EFD9;border-radius:12px;padding:10px 12px;font-size:12px"><b style="display:block;font-size:16px">${p.targets.kcal}</b>kcal a day</td>
<td style="background:#E3EFD9;border-radius:12px;padding:10px 12px;font-size:12px"><b style="display:block;font-size:16px">${esc(goalLine.split(" by ")[0])}</b>${p.projection ? "by " + esc(p.projection.endDate) : "cycle 1"}</td>
</tr></table>
${p.needsVerification ? '<p style="font-size:15px;margin:0 0 14px">First, confirm this is your email so we can keep your plan safe.</p>' : ""}
<p style="margin:0 0 22px"><a href="${esc(p.planUrl)}" style="display:inline-block;background:#C8F25A;color:#12261E;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">${cta}</a></p>
<p style="font-size:14px;line-height:1.5;color:#3D5047;margin:0 0 18px">Your plan adapts every 6 weeks from your check-ins. Reply to this email any time, a real person reads it.</p>
<p style="font-size:11px;color:#66766D;border-top:1px solid #D6DACB;padding-top:12px;margin:0">You're getting this because you created a TrackFit account with ${esc(p.to)}.</p>
</div></body></html>`;
  return { to: p.to, subject, text, html };
}
