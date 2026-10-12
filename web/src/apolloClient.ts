import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { DEV_AUTH_BYPASS, getFirebaseAuth } from "./firebase";

const DEV_USER_ID_KEY = "trackfit.devUserId";

// Apollo Client v4: header injection goes through SetContextLink (the
// `operation.setContext` middleware pattern from v2/v3 no longer reaches
// HttpLink's request headers).
const authLink = new SetContextLink(async (prevContext) => {
  if (DEV_AUTH_BYPASS) {
    let devUserId: string | null = null;
    try {
      devUserId = localStorage.getItem(DEV_USER_ID_KEY);
    } catch {
      // ignore
    }
    return {
      headers: {
        ...prevContext.headers,
        ...(devUserId ? { "x-dev-user-id": devUserId } : {}),
      },
    };
  }

  const user = getFirebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  return {
    headers: {
      ...prevContext.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const httpLink = new HttpLink({ uri: import.meta.env.VITE_API_URL });

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([authLink, httpLink]),
  cache: new InMemoryCache(),
});
