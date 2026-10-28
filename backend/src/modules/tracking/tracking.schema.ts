export const trackingTypeDefs = /* GraphQL */ `
  enum MuscleGroup {
    CHEST
    BACK
    SHOULDERS
    BICEPS
    TRICEPS
    LEGS
    GLUTES
    CORE
    FULL_BODY
    CARDIO
    OTHER
  }

  enum MilestoneType {
    HEAVIEST_SET
    ESTIMATED_1RM
    MOST_REPS_AT_WEIGHT
  }

  type WeightEntry {
    id: ID!
    recordedAt: String!
    weightKg: Float!
    bodyFatPercent: Float
  }

  type Exercise {
    id: ID!
    name: String!
    muscleGroup: MuscleGroup!
    equipment: String
    isCustom: Boolean!
  }

  type WorkoutTemplateExercise {
    order: Int!
    targetSets: Int!
    targetReps: Int!
    exercise: Exercise!
  }

  type WorkoutTemplate {
    id: ID!
    name: String!
    createdAt: String!
    exercises: [WorkoutTemplateExercise!]!
  }

  type SetLog {
    id: ID!
    setNumber: Int!
    reps: Int!
    weightKg: Float!
    rpe: Float
    exercise: Exercise!
  }

  type Milestone {
    id: ID!
    type: MilestoneType!
    value: Float!
    achievedAt: String!
    exercise: Exercise!
  }

  type WorkoutSession {
    id: ID!
    "The template (manual or generated) this session was done from."
    templateId: ID
    templateName: String
    setCount: Int!
    "Sum of weight x reps across all sets, in kg."
    volumeKg: Float!
    startedAt: String!
    durationMinutes: Int
    notes: String
    shareToClubs: Boolean!
    sets: [SetLog!]!
    milestones: [Milestone!]!
  }

  type Dashboard {
    latestWeight: WeightEntry
    weightTrend: [WeightEntry!]!
    recentSessions: [WorkoutSession!]!
    sessionsThisWeek: Int!
  }

  input LogWeightInput {
    weightKg: Float!
    bodyFatPercent: Float
    recordedAt: String
  }

  input WorkoutTemplateExerciseInput {
    exerciseId: ID!
    order: Int!
    targetSets: Int!
    targetReps: Int!
  }

  input CreateWorkoutTemplateInput {
    name: String!
    exercises: [WorkoutTemplateExerciseInput!]!
  }

  input SetLogInput {
    exerciseId: ID!
    setNumber: Int!
    reps: Int!
    weightKg: Float!
    rpe: Float
  }

  input LogWorkoutSessionInput {
    templateId: ID
    durationMinutes: Int
    notes: String
    shareToClubs: Boolean
    "ISO date-time. Lets a missed planned session be logged on its own day. Defaults to now."
    startedAt: String
    sets: [SetLogInput!]!
  }

  enum ActivityKind { CARDIO SPORT WARMUP MOBILITY ABS }
  enum Effort { EASY MODERATE HARD }

  type ActivityLog {
    id: ID!
    "YYYY-MM-DD"
    performedOn: String!
    kind: ActivityKind!
    "WALK, RUN, CYCLE, SWIM, HIKE, ROW, SKIP, FOOTBALL, BASKETBALL, DANCE, WARMUP, MOBILITY, ABS"
    activityType: String!
    durationMinutes: Int!
    distanceKm: Float
    kcal: Int
    "True when calories were estimated from MET x weight x time x effort rather than entered."
    kcalEstimated: Boolean!
    avgHeartRate: Int
    effort: Effort
  }

  input LogActivityInput {
    performedOn: String!
    activityType: String!
    durationMinutes: Int!
    distanceKm: Float
    "From a watch. Leave empty to estimate."
    kcal: Int
    avgHeartRate: Int
    effort: Effort
  }

  extend type Query {
    weightHistory(limit: Int = 90): [WeightEntry!]!
    exercises(search: String): [Exercise!]!
    workoutTemplates: [WorkoutTemplate!]!
    workoutHistory(limit: Int = 20): [WorkoutSession!]!
    dashboard: Dashboard!
    "Sessions started between two dates (YYYY-MM-DD, inclusive)."
    workoutSessionsBetween(from: String!, to: String!): [WorkoutSession!]!
    activityLogs(from: String!, to: String!): [ActivityLog!]!
  }

  extend type Mutation {
    logWeight(input: LogWeightInput!): WeightEntry!
    createWorkoutTemplate(input: CreateWorkoutTemplateInput!): WorkoutTemplate!
    logWorkoutSession(input: LogWorkoutSessionInput!): WorkoutSession!
    logActivity(input: LogActivityInput!): ActivityLog!
    deleteActivity(id: ID!): Boolean!
  }
`;
