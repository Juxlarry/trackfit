export const identityTypeDefs = /* GraphQL */ `
  enum UnitsPreference {
    METRIC
    IMPERIAL
  }

  "App-wide roles for the admin console. They never grant a club role."
  enum AppRole {
    OWNER
    ADMIN
  }

  type User {
    id: ID!
    displayName: String!
    phoneNumber: String
    email: String
    units: UnitsPreference!
    createdAt: String!
    "OWNER or ADMIN for the console, otherwise null."
    appRole: AppRole
  }

  type AppStaff {
    userId: ID!
    displayName: String!
    email: String
    role: AppRole!
    grantedAt: String!
  }

  input UpdateProfileInput {
    displayName: String
    units: UnitsPreference
  }

  type Query {
    """The currently authenticated user, or null if not signed in."""
    me: User
    "The App Owner and App Admins. Console only."
    appStaff: [AppStaff!]!
  }

  type Mutation {
    """
    Dev-only helper (DEV_AUTH_BYPASS=true): creates a fresh dev user and
    returns it so you have an id to put in the x-dev-user-id header. Not
    present in production builds (guarded in the resolver).
    """
    devCreateUser(displayName: String!): User!

    updateProfile(input: UpdateProfileInput!): User!

    "App Owner only. The person must have signed in to TrackFit once."
    addAppAdmin(email: String!): [AppStaff!]!
    "App Owner only."
    removeAppAdmin(userId: ID!): [AppStaff!]!
  }
`;
