export const routinesTypeDefs = /* GraphQL */ `
  enum ClubRoutineKind {
    "Ticked automatically when a matching activity is logged that day."
    ACTIVITY
    "Logged as a session from the routine's exercises."
    WORKOUT
  }

  type ClubRoutineExercise { exerciseId: ID! name: String! sets: Int! reps: Int! }

  type ClubRoutine {
    id: ID!
    clubId: ID!
    clubName: String!
    title: String!
    description: String
    kind: ClubRoutineKind!
    "0 = Monday … 6 = Sunday. All seven means every day."
    weekdays: [Int!]!
    activityType: String
    activityLabel: String
    minDistanceKm: Float
    minMinutes: Int
    exercises: [ClubRoutineExercise!]!
    createdAt: String!
  }

  type ClubRoutineWeek {
    "Monday, YYYY-MM-DD."
    weekStart: String!
    done: Int!
    "Days it's on that week, from when the routine started or the member joined."
    scheduled: Int!
  }

  type ClubRoutineMemberProgress {
    userId: ID!
    displayName: String!
    isMe: Boolean!
    "Oldest first, matching weekStarts."
    weeks: [ClubRoutineWeek!]!
    "Scheduled days in a row done. Today counts once it's done."
    streak: Int!
    doneToday: Boolean!
  }

  type ClubRoutineProgress {
    routine: ClubRoutine!
    weekStarts: [String!]!
    "Longest streak first."
    members: [ClubRoutineMemberProgress!]!
  }

  type MyClubRoutine {
    routine: ClubRoutine!
    done: Boolean!
  }

  input ClubRoutineExerciseInput { exerciseId: ID! sets: Int! reps: Int! }

  input ClubRoutineInput {
    title: String!
    description: String
    kind: ClubRoutineKind!
    weekdays: [Int!]!
    "ACTIVITY: e.g. RUN."
    activityType: String
    minDistanceKm: Float
    minMinutes: Int
    "WORKOUT: catalogue exercises, in order."
    exercises: [ClubRoutineExerciseInput!]
  }

  input ClubRoutineWeightInput { exerciseId: ID! weightKg: Float }

  extend type Club {
    "Active routines, oldest first."
    routines: [ClubRoutine!]!
    routineLimit: Int!
  }

  extend type Query {
    "Null unless the caller is an active member of the routine's club. today: the caller's date."
    clubRoutineProgress(id: ID!, today: String!, weeks: Int = 6): ClubRoutineProgress
    "Routines on this date across the caller's clubs."
    myClubRoutines(date: String!): [MyClubRoutine!]!
  }

  extend type Mutation {
    "Club Admins. Up to 5 active routines per club."
    createClubRoutine(clubId: ID!, input: ClubRoutineInput!): ClubRoutine!
    "Club Admins. The kind can't change."
    updateClubRoutine(id: ID!, input: ClubRoutineInput!): ClubRoutine!
    "Club Admins: end a routine."
    archiveClubRoutine(id: ID!): Boolean!
    "Workout routines: logs a session from the routine (today or yesterday) and ticks it."
    logClubRoutineWorkout(routineId: ID!, date: String!, durationMinutes: Int, weights: [ClubRoutineWeightInput!]): MyClubRoutine!
  }
`;
