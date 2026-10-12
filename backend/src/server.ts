import "dotenv/config";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { typeDefs, resolvers } from "./graphql/schema.js";
import { buildContext, type GraphQLContext } from "./shared/auth/context.js";

const server = new ApolloServer<GraphQLContext>({ typeDefs, resolvers });

const port = Number(process.env.PORT ?? 4000);

const { url } = await startStandaloneServer(server, {
  listen: { port },
  context: async ({ req }) => buildContext(req.headers),
});

// eslint-disable-next-line no-console
console.log(`🚀 TrackFit API ready at ${url}`);
if (process.env.DEV_AUTH_BYPASS === "true") {
  // eslint-disable-next-line no-console
  console.log(
    "⚠️  DEV_AUTH_BYPASS is on — requests authenticate via the x-dev-user-id header, not Firebase. Never enable this in production.",
  );
}
