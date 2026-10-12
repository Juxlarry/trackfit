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
    sets: [SetLogInput!]!
  }

  extend type Query {
    weightHistory(limit: Int = 90): [WeightEntry!]!
    exercises(search: String): [Exercise!]!
    workoutTemplates: [WorkoutTemplate!]!
    workoutHistory(limit: Int = 20): [WorkoutSession!]!
    dashboard: Dashboard!
  }

  extend type Mutation {
    logWeight(input: LogWeightInput!): WeightEntry!
    createWorkoutTemplate(input: CreateWorkoutTemplateInput!): WorkoutTemplate!
    logWorkoutSession(input: LogWorkoutSessionInput!): WorkoutSession!
  }
`;
