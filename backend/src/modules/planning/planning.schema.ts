export const planningTypeDefs = /* GraphQL */ `
  # Enum values match src/modules/planning/engine/types.ts exactly.
  enum Sex { MALE FEMALE }
  enum GoalType { LOSE_FAT BUILD_MUSCLE RECOMP FITNESS MAINTAIN }
  enum Pace { STEADY MODERATE AMBITIOUS }
  enum Experience { NEW SOME EXPERIENCED }
  enum LiftComfort { NEVER LEARNING SOLID AVOID }
  enum Equipment { FULL_GYM SMALL_GYM HOME_GYM DUMBBELLS BANDS BODYWEIGHT }
  enum SplitPreference { AUTO FULL_BODY UPPER_LOWER MUSCLE_FOCUS }
  enum ActivityLevel { DESK LIGHT ACTIVE VERY_ACTIVE }
  enum Injury { SHOULDER ELBOW WRIST LOWER_BACK KNEE HIP }
  enum PriorityMuscle { CHEST BACK SHOULDERS ARMS GLUTES LEGS CORE }
  enum TrainTime { EARLY MIDDAY EVENING VARIES }
  enum SleepQuality { RESTED VARIES TIRED }
  enum Busyness { PACKED BUSY FLEXIBLE }
  enum DietPattern { OMNIVORE HALAL PESCATARIAN VEGETARIAN VEGAN OTHER }
  enum Allergen { DAIRY GLUTEN PEANUTS SHELLFISH EGGS SOY FISH }
  enum MealPattern { TWO TWO_PLUS_SNACK THREE THREE_PLUS_SNACK THREE_PLUS_TWO_SNACKS }
  enum MealSlot { BREAKFAST LUNCH DINNER SNACK }
  enum Fasting { YES CURIOUS NO }
  enum PrepStyle { DAILY BATCH_FEW_DAYS BATCH_WEEK BUY }

  input HealthScreeningInput {
    heartCondition: Boolean!
    highBloodPressure: Boolean!
    diabetes: Boolean!
    pregnant: Boolean!
    recentSurgeryOrInjury: Boolean!
    chestPainOrDizziness: Boolean!
    under18: Boolean!
  }

  input TrainingIntakeInput {
    sex: Sex!
    age: Int!
    heightCm: Float!
    weightKg: Float!
    "0 (leanest) to 4, or null for 'not sure'."
    bodyFatLevel: Int
    goal: GoalType!
    targetWeightKg: Float
    pace: Pace
    experience: Experience!
    liftComfort: LiftComfort!
    equipment: Equipment!
    "Weekday indexes, 0 = Monday."
    availableDays: [Int!]!
    daysPerWeek: Int!
    sessionMinutes: Int!
    split: SplitPreference!
    fullBodyDay: Boolean!
    priorityMuscles: [PriorityMuscle!]!
    "Muscles not to prioritise (kept at maintenance). Up to 2, never CORE or a priority muscle."
    lowPriorityMuscles: [PriorityMuscle!]
    injuries: [Injury!]!
    activityLevel: ActivityLevel!
    sleepHours: Float!
    sleepQuality: SleepQuality
    trainTime: TrainTime
    busyness: Busyness
    warmup: Boolean!
    cardioLikes: [String!]!
    blockers: [String!]!
    # Stored but not used by the generator
    motivations: [String!]
    injuryNote: String
    cardioFrequency: String
    energy: String
  }

  input DietIntakeInput {
    pattern: DietPattern!
    allergies: [Allergen!]!
    dislikes: String
    favouriteDishes: [String!]!
    mealPattern: MealPattern!
    prep: PrepStyle
    fasting: Fasting!
    struggles: [String!]!
    calorieAwareness: String
    proteinAwareness: String
  }

  input MindsetInput {
    likertConsistency: Int
    likertGuidance: Int
    tried: [String!]
    tracker: String
    motivator: String
    support: String
  }

  input OnboardingInput {
    displayName: String
    "Used for the welcome email when the sign-in method didn't supply one (dev mode)."
    email: String
    screening: HealthScreeningInput!
    training: TrainingIntakeInput!
    diet: DietIntakeInput!
    mindset: MindsetInput
    "YYYY-MM-DD, today up to 4 weeks ahead."
    startDate: String!
  }

  type PlanTargets { bmr: Int! tdee: Int! kcal: Int! proteinG: Int! carbsG: Int! fatG: Int! }
  type PlanProjection { weeks: Int! weeklyRateKg: Float! endDate: String! }
  type WarmupItem { name: String! dose: String! }
  type PlannedExercise {
    "Library exercise id (present on saved plans, null in previews)."
    exerciseId: ID
    name: String!
    "Movement pattern for the form illustration, e.g. squat, rdl, bench."
    pattern: String
    sets: Int!
    reps: String!
    isCore: Boolean!
    swapped: Boolean!
    replaces: String
    suggestedLoadKg: Float
  }
  type PlannedSession {
    "Generated workout template id (present on saved plans, null in previews)."
    templateId: ID
    weekday: Int!
    type: String!
    name: String!
    warmup: [WarmupItem!]!
    exercises: [PlannedExercise!]!
  }
  type RestDay { weekday: Int! suggestion: String! }
  type Adaptation { icon: String! text: String! }
  type DayRange { min: Int! max: Int! }
  "Sessions on weekdays dayA and dayB trade places for the week starting weekStart (a Monday)."
  type ScheduleSwap { weekStart: String! dayA: Int! dayB: Int! }

  type MenuItem {
    slotIndex: Int!
    slot: MealSlot!
    recipeKey: String!
    name: String!
    portionGuide: String!
    portionFactor: Float!
    kcal: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
    eaten: Boolean!
  }
  type DayMenu {
    date: String!
    items: [MenuItem!]!
    proteinShortfallG: Int!
    targets: PlanTargets
  }

  type PlanPreview {
    targets: PlanTargets!
    projection: PlanProjection
    splitLabel: String!
    daysPerWeek: Int!
    sessions: [PlannedSession!]!
    restDays: [RestDay!]!
    sampleMenu: DayMenu!
    adaptations: [Adaptation!]!
    dayRange: DayRange!
  }

  type PlanProfile {
    goal: GoalType!
    targetWeightKg: Float
    startWeightKg: Float!
    heightCm: Float!
    sessionMinutes: Int!
    sleepHours: Float!
    equipment: Equipment!
    experience: Experience!
    warmup: Boolean!
    cardioLikes: [String!]!
    priorityMuscles: [PriorityMuscle!]!
    lowPriorityMuscles: [PriorityMuscle!]!
    reminderTime: String
    dietPattern: DietPattern!
    allergies: [Allergen!]!
    mealPattern: MealPattern!
    fasting: Fasting!
    prep: PrepStyle
    favouriteDishes: [String!]!
  }

  type ActivePlan {
    programId: ID!
    cycleNumber: Int!
    startDate: String!
    endDate: String!
    "The ±1 rule is anchored to this."
    onboardingDays: Int!
    daysPerWeek: Int!
    dayRange: DayRange!
    splitLabel: String!
    targets: PlanTargets!
    projection: PlanProjection
    sessions: [PlannedSession!]!
    restDays: [RestDay!]!
    adaptations: [Adaptation!]!
    "Day swaps per week, in the order made. Apply them to sessions' weekdays to get that week's schedule."
    scheduleSwaps: [ScheduleSwap!]!
    profile: PlanProfile!
  }

  type OnboardingResult {
    screenedOut: Boolean!
    message: String
    plan: ActivePlan
  }

  extend type Query {
    "Generates a plan without saving it. No sign-in needed (used before sign-up and by the mobile app)."
    previewPlan(training: TrainingIntakeInput!, diet: DietIntakeInput!, startDate: String!): PlanPreview!
    "The signed-in user's active plan, or null if they haven't onboarded."
    myPlan: ActivePlan
  }

  extend type Mutation {
    "Health gate, save answers, generate program + nutrition plan in one step, send the welcome email."
    completeOnboarding(input: OnboardingInput!): OnboardingResult!
    "±1 day rule: anywhere in dayRange."
    setTrainingDays(days: Int!): ActivePlan!
    setStartDate(date: String!): ActivePlan!
    "Swap the sessions on two training days (YYYY-MM-DD) this week. Up to 2 swaps a week; the plan itself doesn't change."
    swapSessionDays(dateA: String!, dateB: String!): ActivePlan!
    "Undo this week's swaps for the week containing date."
    resetWeekSchedule(date: String!): ActivePlan!
    "HH:MM 24-hour, or null to turn reminders off."
    setWorkoutReminder(time: String): ActivePlan!
  }
`;
