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
    "Starting weight from weeks 5-6 of the last cycle (week-6 check-in). Use it until the first log this cycle."
    startLoadKg: Float
    "In a check-in preview: last cycle's exercise this one replaces for variety."
    rotatedFrom: String
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
    "Replaced by a logged food, so it doesn't count."
    skipped: Boolean!
  }
  type DayMenu {
    date: String!
    items: [MenuItem!]!
    proteinShortfallG: Int!
    targets: PlanTargets
    "Foods logged that day (empty on previews)."
    foods: [FoodLog!]!
    "Null on previews."
    water: WaterDay
    eaten: DayTotals!
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
    "Null until a quick start user sets up Fuel (then allergies and favouriteDishes are empty)."
    dietPattern: DietPattern
    allergies: [Allergen!]!
    mealPattern: MealPattern
    fasting: Fasting
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
    onboardingPath: OnboardingPath!
    "Question blocks a quick start user still owes. FUEL must be answered before Fuel opens."
    pendingSections: [IntakeSection!]!
  }

  enum OnboardingPath { FULL QUICK }
  enum IntakeSection {
    "Set up Fuel: diet, allergies, favourite meals, meals a day, prep, struggles, fasting, daily activity, training time."
    FUEL
    "Fine-tune your training (optional): lift comfort, split, full-body day, priority muscles, cardio likes, warm-up, sleep."
    TRAINING_DETAILS
  }

  "The quick path's questions."
  input QuickBasicsInput {
    sex: Sex!
    age: Int!
    heightCm: Float!
    weightKg: Float!
    bodyFatLevel: Int
    goal: GoalType!
    targetWeightKg: Float
    pace: Pace
    experience: Experience!
    equipment: Equipment!
    availableDays: [Int!]!
    daysPerWeek: Int!
    sessionMinutes: Int!
    injuries: [Injury!]!
    injuryNote: String
    motivations: [String!]
  }

  input TrainingDetailsInput {
    liftComfort: LiftComfort!
    split: SplitPreference!
    fullBodyDay: Boolean!
    priorityMuscles: [PriorityMuscle!]!
    lowPriorityMuscles: [PriorityMuscle!]
    cardioLikes: [String!]!
    cardioFrequency: String
    warmup: Boolean!
    sleepHours: Float!
    sleepQuality: SleepQuality
  }

  input FuelSetupInput {
    diet: DietIntakeInput!
    activityLevel: ActivityLevel!
    trainTime: TrainTime
    busyness: Busyness
  }

  input QuickOnboardingInput {
    displayName: String
    email: String
    screening: HealthScreeningInput!
    basics: QuickBasicsInput!
    "Only if answered anyway, e.g. after switching from the full quiz."
    details: TrainingDetailsInput
    fuel: FuelSetupInput
    mindset: MindsetInput
    startDate: String!
  }

  type OnboardingResult {
    screenedOut: Boolean!
    message: String
    plan: ActivePlan
  }

  enum WorkoutFeel { TOO_EASY ABOUT_RIGHT TOO_HARD }
  enum EatingAdherence { MOST_DAYS SOME_DAYS HARD }
  enum GoalChoice { NEW_TARGET MAINTAIN }

  type BestLift { name: String! fromKg: Float! toKg: Float! }
  "What a cycle achieved, from logged weigh-ins and workouts."
  type CycleResults {
    startKg: Float!
    endKg: Float
    changeKg: Float
    "Signed change the plan aimed for over 6 weeks (0 for maintain, recomp, fitness)."
    plannedChangeKg: Float!
    sessionsPlanned: Int!
    sessionsDone: Int!
    adherence: Float!
    bestLift: BestLift
    "No weigh-in in the last 3 days: log one before the check-in."
    needsWeighIn: Boolean!
    goalReached: Boolean!
    suggestedDays: Int!
    suggestedTargetKg: Float
  }
  type EatingLog {
    loggedDays: Int!
    "Logged days within 10% of the calorie target."
    onTargetDays: Int!
    "Pre-answer for the eating question, when at least half the days were logged."
    suggested: EatingAdherence
  }
  type CycleCheckin {
    "From day 40 of the cycle."
    open: Boolean!
    opensOn: String!
    cycleNumber: Int!
    dayRange: DayRange!
    currentDays: Int!
    currentKcal: Int!
    goal: String!
    targetWeightKg: Float
    results: CycleResults!
    eatingLog: EatingLog!
  }
  type CycleChange { icon: String! title: String! why: String! }
  type CyclePreview {
    changes: [CycleChange!]!
    targets: PlanTargets!
    daysPerWeek: Int!
    splitLabel: String!
    sessions: [PlannedSession!]!
  }
  input CheckinAnswersInput {
    feel: WorkoutFeel!
    eating: EatingAdherence!
    days: Int!
    "Only when the goal was reached."
    goalChoice: GoalChoice
    newTargetKg: Float
    "Last cycle's exercises to keep instead of the suggested replacements."
    keep: [String!]
  }

  "One 6-week cycle. A check-in can start the next one before endDate."
  type CycleSpan {
    cycleNumber: Int!
    startDate: String!
    endDate: String!
    active: Boolean!
  }

  extend type Query {
    "Every cycle so far, oldest first (photo history on Progress)."
    myCycles: [CycleSpan!]!
    "The week-6 check-in for the active cycle. today is the caller's local date (YYYY-MM-DD)."
    cycleCheckin(today: String!): CycleCheckin
    "What the next cycle would look like with these answers. Nothing is saved. details: the fine-tune answers, for a quick start user who never gave them."
    previewNextCycle(today: String!, answers: CheckinAnswersInput!, details: TrainingDetailsInput): CyclePreview!
    "Generates a plan without saving it. No sign-in needed (used before sign-up and by the mobile app)."
    previewPlan(training: TrainingIntakeInput!, diet: DietIntakeInput!, startDate: String!): PlanPreview!
    "The signed-in user's active plan, or null if they haven't onboarded."
    myPlan: ActivePlan
  }

  extend type Mutation {
    "Health gate, save answers, generate program + nutrition plan in one step, send the welcome email."
    completeOnboarding(input: OnboardingInput!): OnboardingResult!
    "Quick start: only the basics are required; the rest is asked later (pendingSections)."
    completeQuickOnboarding(input: QuickOnboardingInput!): OnboardingResult!
    "Set up Fuel: saves the diet and recalculates calorie targets."
    completeFuelSetup(input: FuelSetupInput!): ActivePlan!
    "Fine-tune your training: rebuilds the weekly plan with these answers."
    fineTuneTraining(input: TrainingDetailsInput!): ActivePlan!
    "±1 day rule: anywhere in dayRange."
    setTrainingDays(days: Int!): ActivePlan!
    setStartDate(date: String!): ActivePlan!
    "Swap the sessions on two training days (YYYY-MM-DD) this week. Up to 2 swaps a week; the plan itself doesn't change."
    swapSessionDays(dateA: String!, dateB: String!): ActivePlan!
    "Undo this week's swaps for the week containing date."
    resetWeekSchedule(date: String!): ActivePlan!
    "Closes the cycle and builds the next one from the check-in. Returns the new plan."
    completeCheckin(today: String!, answers: CheckinAnswersInput!, startDate: String!, details: TrainingDetailsInput): ActivePlan!
    "HH:MM 24-hour, or null to turn reminders off."
    setWorkoutReminder(time: String): ActivePlan!
  }
`;
