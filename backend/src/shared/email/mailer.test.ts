import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ResendMailer } from "./mailer.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function capture(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 200 ? "{}" : "domain is not verified", { status });
  }) as typeof fetch;
  return calls;
}
const email = { to: "ama@example.com", subject: "Hi", text: "t", html: "<p>t</p>" };

test("Resend gets the sender, key and message", async () => {
  const calls = capture();
  await new ResendMailer("re_key", "TrackFit <hello@mail.example.com>").send(email);
  assert.equal(calls[0]!.url, "https://api.resend.com/emails");
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, "Bearer re_key");
  const body = JSON.parse(calls[0]!.init.body as string);
  assert.deepEqual(body.to, ["ama@example.com"]);
  assert.equal(body.from, "TrackFit <hello@mail.example.com>");
  assert.equal("reply_to" in body, false);
});

test("MAIL_REPLY_TO becomes reply_to", async () => {
  const calls = capture();
  await new ResendMailer("re_key", "TrackFit <hello@mail.example.com>", "me@example.com").send(email);
  assert.equal(JSON.parse(calls[0]!.init.body as string).reply_to, "me@example.com");
});

test("a refused send throws with Resend's reason", async () => {
  capture(403);
  await assert.rejects(new ResendMailer("re_key", "x@y.z").send(email), /403.*domain is not verified/);
});
