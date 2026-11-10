export const feedTypeDefs = /* GraphQL */ `
  enum ClubPostKind {
    WORKOUT
    RUN
    CYCLE
    "Any other logged activity: walk, swim, football and so on."
    ACTIVITY
    "Progress or gains: text and a photo, optionally the weight change since Day 1."
    PROGRESS
    MEAL
    "Coming with challenges (build step 4)."
    CHALLENGE_WIN
    "Coaches only: a video and caption on any topic."
    COACH_VIDEO
  }

  enum ClubReaction { FIRE STRONG CLAP HEART }

  enum ClubFeedFilter {
    ALL
    "Posts with a PR, progress posts and challenge wins."
    WINS
    COACH_VIDEOS
    CHALLENGES
  }

  enum ClubMediaKind { IMAGE VIDEO }

  enum ClubUploadPurpose {
    POST
    "A coach's video reply to a post."
    COMMENT
    CLUB_PHOTO
  }

  "Someone as the club sees them now."
  type ClubPerson {
    userId: ID!
    displayName: String!
    isAdmin: Boolean!
    isCoach: Boolean!
    "False once they've left the club or been removed."
    inClub: Boolean!
    isMe: Boolean!
  }

  type ClubMedia {
    id: ID!
    kind: ClubMediaKind!
    "A short-lived link (about an hour). Fetch the post again for a fresh one."
    url: String!
    durationSeconds: Float
  }

  type HttpHeader { name: String! value: String! }

  "Where to PUT the file. Send exactly these headers."
  type ClubUpload {
    mediaId: ID!
    url: String!
    method: String!
    headers: [HttpHeader!]!
    expiresAt: String!
    maxBytes: Int!
  }

  type ClubSet { reps: Int! weightKg: Float! }
  type ClubWorkoutExercise { name: String! sets: [ClubSet!]! }

  type ClubPr {
    exerciseName: String!
    type: MilestoneType!
    "The set behind the record."
    weightKg: Float!
    reps: Int!
    "The record itself: the weight, or the estimated 1RM."
    value: Float!
  }

  type ClubWorkout {
    id: ID!
    name: String!
    startedAt: String!
    durationMinutes: Int
    setCount: Int!
    volumeKg: Float!
    exercises: [ClubWorkoutExercise!]!
    "PRs set in this workout. Headline ones (heaviest set, estimated 1RM) first."
    prs: [ClubPr!]!
  }

  type ClubActivity {
    id: ID!
    activityType: String!
    label: String!
    performedOn: String!
    durationMinutes: Int!
    distanceKm: Float
    avgHeartRate: Int
    effort: Effort
    kcal: Int
  }

  type ClubReactionCount { reaction: ClubReaction! count: Int! }

  type ClubComment {
    id: ID!
    body: String!
    createdAt: String!
    author: ClubPerson!
    "A coach's video reply."
    media: ClubMedia
    canDelete: Boolean!
  }

  type ClubPost {
    id: ID!
    clubId: ID!
    kind: ClubPostKind!
    body: String!
    createdAt: String!
    editedAt: String
    author: ClubPerson!
    media: ClubMedia
    "The shared workout, in full. Null if it has since been deleted."
    workout: ClubWorkout
    activity: ClubActivity
    weightChangeKg: Float
    hasPr: Boolean!
    reactions: [ClubReactionCount!]!
    myReaction: ClubReaction
    commentCount: Int!
    "Oldest first."
    comments: [ClubComment!]!
    canEdit: Boolean!
    canDelete: Boolean!
  }

  type ClubFeedPage {
    posts: [ClubPost!]!
    "Pass as after: for the next page. Null on the last page."
    nextCursor: String
  }

  type ClubShareTarget { id: ID! name: String! }

  "What the share prompt offers after a workout or activity."
  type ClubShareDraft {
    text: String!
    "Clubs that want to be asked and don't have this log yet. Empty means don't ask."
    clubs: [ClubShareTarget!]!
  }

  "One member on the coaches' Members page: the last four weeks, since they joined."
  type ClubMemberOverview {
    member: ClubMember!
    sessionsPerWeek: Float!
    workouts: Int!
    activities: Int!
    prs: Int!
    lastWorkoutAt: String
    lastActivityOn: String
  }

  "Coaches: a member's workouts and activities since they joined, newest first."
  type ClubMemberLog {
    member: ClubMember!
    workouts: [ClubWorkout!]!
    activities: [ClubActivity!]!
  }

  type ClubFeedLimits {
    imageMb: Int!
    videoMb: Int!
    videoSeconds: Int!
    coachVideoMb: Int!
    coachVideoSeconds: Int!
    postChars: Int!
    commentChars: Int!
  }

  "Console: a reported post or comment."
  type ClubReportItem {
    postId: ID!
    commentId: ID
    kind: ClubPostKind!
    authorName: String!
    body: String!
    media: ClubMedia
    createdAt: String!
    "Already deleted by its author or an Admin."
    deleted: Boolean!
  }

  type ConsoleClubReport {
    id: ID!
    clubName: String!
    reason: String!
    createdAt: String!
    reporterName: String!
    "Open reports on the same post or comment, this one included."
    reportCount: Int!
    item: ClubReportItem!
  }

  extend type Club {
    photoUrl: String
    feed(filter: ClubFeedFilter = ALL, after: String, limit: Int = 20): ClubFeedPage!
    "Empty unless the caller is a Coach."
    coachOverview: [ClubMemberOverview!]!
    feedLimits: ClubFeedLimits!
  }

  extend type ClubMember {
    "Ask me to share after workouts. Only on your own membership."
    askToShare: Boolean
  }

  input CreateClubPostInput {
    "One post in each. The photo or video is copied to every club."
    clubIds: [ID!]!
    body: String
    sessionId: ID
    activityId: ID
    "Only for posts not linked to a log: PROGRESS, MEAL or COACH_VIDEO."
    kind: ClubPostKind
    "From requestClubUpload, after the file is uploaded."
    mediaId: ID
    "Progress posts: add the change since Day 1 from your weigh-ins."
    includeWeightChange: Boolean
  }

  extend type Query {
    "Null unless the caller is an active member of the post's club."
    clubPost(id: ID!): ClubPost
    "Coaches only."
    clubMemberLog(clubId: ID!, userId: ID!): ClubMemberLog!
    "Pass one of sessionId or activityId: your own log."
    clubShareDraft(sessionId: ID, activityId: ID): ClubShareDraft!
    "Console: open reports, oldest first."
    consoleReports: [ConsoleClubReport!]!
  }

  extend type Mutation {
    "Step 1 of adding a photo or video. Then PUT the file, then pass mediaId to the post, comment or club photo."
    requestClubUpload(clubId: ID!, purpose: ClubUploadPurpose!, contentType: String!, sizeBytes: Int!, durationSeconds: Float): ClubUpload!
    createClubPost(input: CreateClubPostInput!): [ClubPost!]!
    "Your own posts. Changes the text."
    editClubPost(id: ID!, body: String!): ClubPost!
    "Your own, or any post if you're an Admin."
    deleteClubPost(id: ID!): Boolean!
    "Null removes your reaction."
    reactToClubPost(postId: ID!, reaction: ClubReaction): ClubPost!
    "mediaId: coaches can reply with a video of up to 30 seconds."
    commentOnClubPost(postId: ID!, body: String, mediaId: ID): ClubPost!
    deleteClubComment(id: ID!): ClubPost!
    "Sends it to the App Owner and App Admins."
    reportClubPost(postId: ID!, commentId: ID, reason: String!): Boolean!
    setClubShareSetting(clubId: ID!, askToShare: Boolean!): Club!
    "Admins. Null removes the photo."
    setClubPhoto(clubId: ID!, mediaId: ID): Club!
    "Console. remove: delete the post or comment; otherwise leave it up."
    resolveClubReport(id: ID!, remove: Boolean!): Boolean!
  }
`;
