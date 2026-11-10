import type { OutgoingEmail } from "../../shared/email/mailer.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Same shell as the welcome email: TrackFit header, one message, one button. */
function layout(p: { heading: string; paragraphs: string[]; cta: string; url: string; footer: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F4EE;font-family:Arial,Helvetica,sans-serif;color:#12261E">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-weight:bold;font-size:18px;margin:0 0 20px">TrackFit</p>
<h1 style="font-size:24px;margin:0 0 12px">${esc(p.heading)}</h1>
${p.paragraphs.map((t) => `<p style="font-size:15px;line-height:1.5;margin:0 0 14px">${esc(t)}</p>`).join("\n")}
<p style="margin:8px 0 22px"><a href="${esc(p.url)}" style="display:inline-block;background:#C8F25A;color:#12261E;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(p.cta)}</a></p>
<p style="font-size:11px;color:#66766D;border-top:1px solid #D6DACB;padding-top:12px;margin:0">${esc(p.footer)}</p>
</div></body></html>`;
}

export function inviteEmail(p: { to: string; clubName: string; inviterName: string; asAdmin: boolean; url: string }): OutgoingEmail {
  const subject = p.asAdmin ? `You're running ${p.clubName} on TrackFit` : `${p.inviterName} invited you to ${p.clubName} on TrackFit`;
  const heading = p.asAdmin ? `${p.clubName} is ready for you to run` : `Join ${p.clubName}`;
  const paragraphs = [
    p.asAdmin
      ? `${p.inviterName} set up ${p.clubName} on TrackFit and named you its Admin. You'll invite members and choose the club's coaches.`
      : `${p.inviterName} invited you to ${p.clubName}, a TrackFit club for training together and keeping each other on track.`,
    "In a club, the coaches see the workouts and activities you log. Food, water, weight and photos stay private unless you post them.",
    `Sign in with ${p.to} to accept. New to TrackFit? You'll build your plan first; it takes about 6 minutes.`,
  ];
  const cta = p.asAdmin ? "Set up my club" : "Accept the invite";
  const footer = `You're getting this because someone invited ${p.to} to a TrackFit club. If you weren't expecting it, you can ignore this email.`;
  const text = [heading, "", ...paragraphs.flatMap((t) => [t, ""]), `${cta}: ${p.url}`, "", footer].join("\n");
  return { to: p.to, subject, text, html: layout({ heading, paragraphs, cta, url: p.url, footer }) };
}

export function joinRequestEmail(p: { to: string; clubName: string; requesterName: string; url: string }): OutgoingEmail {
  const subject = `${p.requesterName} wants to join ${p.clubName}`;
  const heading = `${p.requesterName} wants to join`;
  const paragraphs = [`${p.requesterName} opened a join link for ${p.clubName}. As an Admin, you can approve or decline them in the club's members list.`];
  const cta = "Review the request";
  const footer = `You're getting this because you're an Admin of ${p.clubName} on TrackFit.`;
  const text = [heading, "", ...paragraphs, "", `${cta}: ${p.url}`, "", footer].join("\n");
  return { to: p.to, subject, text, html: layout({ heading, paragraphs, cta, url: p.url, footer }) };
}
