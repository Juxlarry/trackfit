export const clubsTypeDefs = /* GraphQL */ `
  enum ClubMemberStatus {
    WAITING
    ACTIVE
    DECLINED
    LEFT
    REMOVED
  }

  enum ClubJoinKind {
    "An email invite: joins straight away, for the address it was sent to."
    INVITE
    "A join link: whoever opens it asks to join, and an Admin approves."
    LINK
  }

  type ClubMember {
    userId: ID!
    displayName: String!
    status: ClubMemberStatus!
    isAdmin: Boolean!
    isCoach: Boolean!
    requestedAt: String!
    joinedAt: String
    isMe: Boolean!
  }

  type ClubInvite {
    id: ID!
    email: String!
    asAdmin: Boolean!
    createdAt: String!
  }

  type ClubJoinLink {
    id: ID!
    url: String!
    expiresAt: String!
    maxUses: Int!
    uses: Int!
  }

  type ClubLimits {
    maxAdmins: Int!
    maxMembers: Int!
    maxLinkUses: Int!
    linkDays: Int!
  }

  "A club the caller is an active member of."
  type Club {
    id: ID!
    name: String!
    description: String
    timeZone: String!
    createdAt: String!
    "The caller's own membership."
    me: ClubMember!
    "Active members: Admins first, then Coaches, then by name."
    members: [ClubMember!]!
    "People waiting for approval. Empty unless the caller is an Admin."
    joinRequests: [ClubMember!]!
    "Open email invites. Empty unless the caller is an Admin."
    invites: [ClubInvite!]!
    "Join links that can still be used. Empty unless the caller is an Admin."
    joinLinks: [ClubJoinLink!]!
    limits: ClubLimits!
  }

  "The caller's clubs, including ones still waiting for approval."
  type MyClub {
    id: ID!
    name: String!
    description: String
    status: ClubMemberStatus!
  }

  "An open invite sent to the caller's verified email."
  type ClubInviteForMe {
    id: ID!
    clubName: String!
    asAdmin: Boolean!
    token: String!
  }

  "What a join page shows before anyone signs in."
  type JoinPreview {
    clubName: String!
    description: String
    kind: ClubJoinKind!
    asAdmin: Boolean!
    "Why the link or invite can't be used, or null when it can."
    problem: String
    "For invites: the address it was sent to, masked."
    emailHint: String
    "The caller's status in this club, when signed in."
    myStatus: ClubMemberStatus
    "Set when the caller is an active member, to open the club page."
    clubId: ID
  }

  type JoinResult {
    clubId: ID!
    status: ClubMemberStatus!
  }

  "A club as the console sees it: no members' data."
  type ConsoleClub {
    id: ID!
    name: String!
    description: String
    createdAt: String!
    closedAt: String
    memberCount: Int!
    adminCount: Int!
    "Admin invites not yet accepted (the named first Admin, until they join)."
    pendingAdminEmails: [String!]!
  }

  input CreateClubInput {
    name: String!
    description: String
    "The person who'll run it. They become its first Admin when they join."
    firstAdminEmail: String!
  }

  extend type User {
    "Whether Clubs appears in the menu: a club member, someone with an invite, or App staff."
    showClubs: Boolean!
  }

  extend type Query {
    myClubs: [MyClub!]!
    myClubInvites: [ClubInviteForMe!]!
    "Null unless the caller is an active member."
    club(id: ID!): Club
    "Works without signing in. Null for a token that doesn't exist."
    joinPreview(token: String!): JoinPreview
    "Console: App Owner and App Admins."
    consoleClubs: [ConsoleClub!]!
  }

  extend type Mutation {
    "Console. Emails an Admin invite to firstAdminEmail."
    createClub(input: CreateClubInput!): ConsoleClub!
    "Console."
    closeClub(id: ID!): ConsoleClub!
    "Console, for a stuck club: makes a member an Admin, or invites the email as Admin."
    addClubAdminFromConsole(clubId: ID!, email: String!): ConsoleClub!

    "Club Admins. Emails each new address; existing members are skipped."
    inviteToClub(clubId: ID!, emails: [String!]!): Club!
    revokeClubInvite(id: ID!): Club!
    "Club Admins. Expires after 7 days."
    createJoinLink(clubId: ID!, maxUses: Int): Club!
    turnOffJoinLink(id: ID!): Club!
    respondToJoinRequest(clubId: ID!, userId: ID!, approve: Boolean!): Club!
    "Club Admins. At most 3 Admins, and never none."
    setClubMemberRoles(clubId: ID!, userId: ID!, isAdmin: Boolean!, isCoach: Boolean!): Club!
    removeClubMember(clubId: ID!, userId: ID!): Club!

    "Accept an invite or use a join link. consent must be true: coaches will see the workouts and activities you log."
    joinClub(token: String!, consent: Boolean!): JoinResult!
    declineClubInvite(id: ID!): Boolean!
    "Leave, or withdraw a request that's still waiting. The last Admin can't leave."
    leaveClub(clubId: ID!): Boolean!
  }
`;
