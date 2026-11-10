import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import cors from "cors";
import express from "express";
import { typeDefs, resolvers } from "./graphql/schema.js";
import { buildContext, type GraphQLContext } from "./shared/auth/context.js";
import { runReminderJob } from "./modules/notifications/reminders.js";
import { LocalStore, getMediaStore } from "./shared/media/store.js";
import { cleanUpStaleUploads } from "./modules/clubs/feed.service.js";

const server = new ApolloServer<GraphQLContext>({ typeDefs, resolvers });
await server.start();

const app = express();
app.use(cors());

app.get("/healthz", (_req, res) => { res.send("ok"); });

/**
 * Reminder job trigger for an external cron (cron-job.org, every 5-10 min).
 * Render's free plan sleeps when idle, and this request is what wakes it so
 * reminders still go out. Needs `Authorization: Bearer <CRON_SECRET>`.
 */
app.post("/jobs/reminders", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!secret || given.length !== Buffer.byteLength(secret) || !timingSafeEqual(given, Buffer.from(secret))) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.json(await runReminderJob());
  cleanUpStaleUploads().catch((err) => console.error("Club upload clean-up failed:", err));
});

/**
 * Club photos and videos in dev and tests (MEDIA_STORE=local): the API stands
 * in for Firebase Storage. Each link is signed and short-lived, like the real ones.
 */
const media = getMediaStore();
if (media instanceof LocalStore) {
  app.put("/media-local/:token", express.raw({ type: () => true, limit: "110mb" }), async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.sendStatus(await media.put(req.params.token, req.get("content-type") ?? "", body));
  });
  app.get("/media-local/:token", async (req, res) => {
    const file = await media.read(req.params.token);
    if (!file) { res.sendStatus(404); return; }
    res.type(file.contentType).set("cache-control", "private, max-age=3000").send(file.body);
  });
}

app.use(
  "/",
  express.json({ limit: "2mb" }),
  expressMiddleware(server, {
    context: async ({ req }) => ({ ...(await buildContext(req.headers)), userAgent: req.get("user-agent") ?? null }),
  }),
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 TrackFit API ready at http://localhost:${port}/`);
});

// While the server is awake, check reminders every 5 minutes too. Both paths
// are safe to overlap: each reminder is logged and sent once.
if (process.env.REMINDER_TIMER !== "off") {
  setInterval(() => { runReminderJob().catch((err) => console.error("Reminder job failed:", err)); }, 5 * 60 * 1000).unref();
}
// Club uploads that were started but never attached to a post, older than a day.
setInterval(() => { cleanUpStaleUploads().catch((err) => console.error("Club upload clean-up failed:", err)); }, 60 * 60 * 1000).unref();

if (process.env.DEV_AUTH_BYPASS === "true") {
  // eslint-disable-next-line no-console
  console.log(
    "⚠️  DEV_AUTH_BYPASS is on — requests authenticate via the x-dev-user-id header, not Firebase. Never enable this in production.",
  );
}
