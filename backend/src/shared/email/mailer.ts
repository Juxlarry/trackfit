/**
 * Transactional email (architecture.md §5, §8). The provider is still an open
 * item (§12), so everything sends through this small interface; swapping in a
 * real provider means adding one implementation and selecting it in getMailer().
 *
 * MAIL_PROVIDER=console (default) logs the message instead of sending it, and
 * keeps the last few in memory so tests and local dev can inspect them.
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

let mailer: Mailer | null = null;
export function getMailer(): Mailer {
  if (mailer) return mailer;
  const provider = (process.env.MAIL_PROVIDER ?? "console").toLowerCase();
  if (provider !== "console") {
    throw new Error(`MAIL_PROVIDER "${provider}" is not implemented yet. Use "console" until a provider is chosen (architecture.md §12).`);
  }
  mailer = new ConsoleMailer();
  return mailer;
}

/** Test hook. */
export function setMailer(m: Mailer): void {
  mailer = m;
}
