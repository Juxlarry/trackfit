/**
 * Transactional email (architecture.md §5, §8). Everything sends through this
 * small interface, and getMailer() picks the provider:
 *
 * - MAIL_PROVIDER=console (default) logs the message instead of sending it, and
 *   keeps the last few in memory so tests and local dev can inspect them.
 * - MAIL_PROVIDER=resend sends through Resend's API. Needs RESEND_API_KEY and
 *   MAIL_FROM (an address on a domain verified in Resend). MAIL_REPLY_TO is
 *   optional: where replies go, since MAIL_FROM usually has no inbox.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  async send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
    if (this.sent.length > 20) this.sent.shift();
    // eslint-disable-next-line no-console
    console.log(`[mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
  }
}

export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly replyTo?: string) {}
  async send(email: OutgoingEmail): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

let mailer: Mailer | null = null;
export function getMailer(): Mailer {
  if (mailer) return mailer;
  const provider = (process.env.MAIL_PROVIDER ?? "console").toLowerCase();
  if (provider === "console") {
    mailer = new ConsoleMailer();
  } else if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;
    if (!key || !from) throw new Error("MAIL_PROVIDER=resend needs RESEND_API_KEY and MAIL_FROM.");
    mailer = new ResendMailer(key, from, process.env.MAIL_REPLY_TO || undefined);
  } else {
    throw new Error(`Unknown MAIL_PROVIDER "${provider}". Use "console" or "resend".`);
  }
  return mailer;
}

/** Test hook. */
export function setMailer(m: Mailer): void {
  mailer = m;
}
