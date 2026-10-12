export const identityTypeDefs = /* GraphQL */ `
  enum UnitsPreference {
    METRIC
    IMPERIAL
  }

  type User {
    id: ID!
    displayName: String!
    phoneNumber: String
    email: String
    units: UnitsPreference!
    createdAt: String!
  }

  input UpdateProfileInput {
    displayName: String
    units: UnitsPreference
  }

  type Query {
    """The currently authenticated user, or null if not signed in."""
    me: User
  }

  type Mutation {
    """
    Dev-only helper (DEV_AUTH_BYPASS=true): creates a fresh dev user and
    returns it so you have an id to put in the x-dev-user-id header. Not
    present in production builds (guarded in the resolver).
    """
    devCreateUser(displayName: String!): User!

    updateProfile(input: UpdateProfileInput!): User!
  }
`;
