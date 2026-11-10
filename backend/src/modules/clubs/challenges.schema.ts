export const challengesTypeDefs = /* GraphQL */ `
  enum ClubChallengeKind {
    "Exercises with sets and reps, optionally against the clock. Result: time taken or reps."
    WORKOUT
    "A type with a distance or time. Result: from the logged activity."
    ACTIVITY
    "A food and an amount, ticked while logging food."
    FOOD
    "A daily amount: the day's total logged water must reach it."
    WATER
  }
  enum ClubChallengeCadence {
    "Proof every day it runs."
    DAILY
    "Proof once in each Monday-to-Sunday week it runs."
    WEEKLY
  }
  enum ClubChallengeState { UPCOMING RUNNING FINISHED ENDED }
  enum ClubChallengeAnswer { JOINED DECLINED }

  extend enum ClubUploadPurpose {
    "Coaches: a video explaining a challenge, up to 60 seconds."
    CHALLENGE
    "A challenge entry's photo or video."
    PROOF
  }

  type ClubChallengeExercise { exerciseId: ID! name: String! sets: Int! reps: Int! }

  type ClubChallenge {
    id: ID!
    clubId: ID!
    clubName: String!
    coach: ClubPerson!
    title: String!
    description: String
    cadence: ClubChallengeCadence!
    kind: ClubChallengeKind!
    "YYYY-MM-DD, inclusive."
    startsOn: String!
    endsOn: String!
    "In the club's time zone."
    state: ClubChallengeState!
    video: ClubMedia
    exercises: [ClubChallengeExercise!]!
    timeLimitMinutes: Int
    activityType: String
    activityLabel: String
    minDistanceKm: Float
    minMinutes: Int
    foodKey: String
    foodName: String
    "FOOD: the amount, in foodUnit."
    foodGrams: Int
    "g, or ml for drinks."
    foodUnit: String
    waterMl: Int
    createdAt: String!
    "Days (DAILY) or weeks (WEEKLY) that need proof."
    totalPeriods: Int!
    joinedCount: Int!
    "Your answer to the pop-up. Null: not answered yet."
    myAnswer: ClubChallengeAnswer
    "The coach who set it, or an Admin, while it isn't over."
    canEnd: Boolean!
  }

  type ClubChallengeEntry {
    id: ID!
    "The day it's for."
    onDate: String!
    "The day, or the first day of the week, it counts for."
    periodStart: String!
    resultSeconds: Int
    resultReps: Int
    distanceKm: Float
    minutes: Int
    waterMl: Int
    note: String
    proof: ClubMedia
    createdAt: String!
  }

  type ClubChallengeParticipant {
    person: ClubPerson!
    done: Int!
    total: Int!
    completed: Boolean!
    "Oldest first."
    entries: [ClubChallengeEntry!]!
  }

  type ClubChallengeComment {
    id: ID!
    body: String!
    createdAt: String!
    author: ClubPerson!
    canDelete: Boolean!
  }

  "A challenge you've taken on."
  type MyClubChallenge {
    challenge: ClubChallenge!
    "Proof is in for the day (or week) the date falls in."
    doneForPeriod: Boolean!
    done: Int!
    total: Int!
    completed: Boolean!
    "Drafted text for the win post, once complete and until it's posted."
    winDraft: String
  }

  type ClubChallengePage {
    challenge: ClubChallenge!
    "Null unless you've taken it on."
    mine: MyClubChallenge
    "Everyone who took it on, most progress first."
    participants: [ClubChallengeParticipant!]!
    "Oldest first."
    comments: [ClubChallengeComment!]!
  }

  "Coaches: challenges set this week (Monday to Sunday, the club's time zone)."
  type ClubChallengeQuota { limit: Int! usedThisWeek: Int! }

  "What submitting proof did."
  type ClubChallengeEntryResult {
    "This entry finished the challenge: offer the win post."
    completed: Boolean!
    mine: MyClubChallenge!
  }

  extend type Club {
    "Newest first, up to 100."
    challenges: [ClubChallenge!]!
    "Null unless you're a Coach here."
    challengeQuota: ClubChallengeQuota
  }

  extend type ClubMemberOverview {
    challengesTaken: Int!
    challengesCompleted: Int!
  }

  extend type ClubPost {
    "Challenge wins: the challenge finished."
    challenge: ClubChallenge
  }

  input ClubChallengeExerciseInput { exerciseId: ID! sets: Int! reps: Int! }

  input ClubChallengeInput {
    title: String!
    description: String
    cadence: ClubChallengeCadence!
    kind: ClubChallengeKind!
    "Default today, in the club's time zone."
    startsOn: String
    "Default the Sunday of the start's week. Up to 4 weeks."
    endsOn: String
    "From requestClubUpload with purpose CHALLENGE."
    videoMediaId: ID
    exercises: [ClubChallengeExerciseInput!]
    timeLimitMinutes: Int
    activityType: String
    minDistanceKm: Float
    minMinutes: Int
    "A food from the list, or foodName for one typed in."
    foodKey: String
    foodName: String
    foodGrams: Int
    waterMl: Int
  }

  input ClubChallengeWeightInput { exerciseId: ID! weightKg: Float }

  input ClubChallengeEntryInput {
    "Your date."
    date: String!
    "Proof: from requestClubUpload with purpose PROOF."
    mediaId: ID!
    note: String
    "WORKOUT: time taken or reps, at least one."
    resultSeconds: Int
    resultReps: Int
    "WORKOUT: optional weights for the session it logs."
    weights: [ClubChallengeWeightInput!]
    "ACTIVITY: the logged activity."
    activityId: ID
  }

  extend type Query {
    "Null unless you're an active member of its club."
    clubChallenge(id: ID!): ClubChallengePage
    "The daily pop-up: challenges in your clubs you haven't answered. date: your date."
    pendingClubChallenges(date: String!): [ClubChallenge!]!
    "Challenges you've taken on that run on this date."
    myClubChallenges(date: String!): [MyClubChallenge!]!
  }

  extend type Mutation {
    "Coaches. At most 3 a week each."
    createClubChallenge(clubId: ID!, input: ClubChallengeInput!): ClubChallenge!
    "The coach who set it, or an Admin."
    endClubChallenge(id: ID!): Boolean!
    "join: Take on challenge. false: Not for me."
    respondToClubChallenge(id: ID!, join: Boolean!): ClubChallenge!
    "Submit result: proof, and the result where the log doesn't have it. WORKOUT challenges also log a session."
    submitClubChallengeEntry(challengeId: ID!, input: ClubChallengeEntryInput!): ClubChallengeEntryResult!
    "Once complete. body: the edited draft, or null for the draft as it is."
    postClubChallengeWin(challengeId: ID!, body: String): ClubPost!
    commentOnClubChallenge(id: ID!, body: String!): ClubChallengePage!
    "Your own, or any if you're an Admin."
    deleteClubChallengeComment(id: ID!): ClubChallengePage!
  }
`;
