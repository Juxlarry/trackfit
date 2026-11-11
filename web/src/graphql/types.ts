import type { Adaptation, DietPattern, Allergen, MealPattern, MealSlot } from "@engine";

export interface PlannedExerciseDto {
  exerciseId: string | null;
  name: string;
  pattern: string | null;
  sets: number;
  reps: string;
  isCore: boolean;
  swapped: boolean;
  replaces: string | null;
  suggestedLoadKg: number | null;
  /** From the week-6 check-in: where this cycle starts, until the first log. */
  startLoadKg: number | null;
  /** Swapped for the rest of the cycle: the planned exercise (README "Exercise swaps"). */
  swappedFrom: { exerciseId: string; name: string } | null;
}

export type SwapFilter = "ANY" | "DUMBBELLS" | "BODYWEIGHT";
export interface ExerciseSwapOptionDto { exerciseId: string; name: string; equipment: string; sameMovement: boolean; reason: string; suggestedLoadKg: number | null }

export interface PlannedSessionDto {
  templateId: string | null;
  weekday: number;
  type: string;
  name: string;
  warmup: { name: string; dose: string }[];
  exercises: PlannedExerciseDto[];
}

export interface CycleSpanDto { cycleNumber: number; startDate: string; endDate: string; active: boolean }

export interface ActivePlanDto {
  programId: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  onboardingDays: number;
  daysPerWeek: number;
  dayRange: { min: number; max: number };
  splitLabel: string;
  onboardingPath: "FULL" | "QUICK";
  /** Question blocks a quick start user still owes. */
  pendingSections: ("FUEL" | "TRAINING_DETAILS")[];
  targets: { bmr: number; tdee: number; kcal: number; proteinG: number; carbsG: number; fatG: number };
  projection: { weeks: number; weeklyRateKg: number; endDate: string } | null;
  sessions: PlannedSessionDto[];
  restDays: { weekday: number; suggestion: string }[];
  adaptations: Adaptation[];
  /** Day swaps per week (weekStart = Monday), in the order made. */
  scheduleSwaps: { weekStart: string; dayA: number; dayB: number }[];
  profile: {
    goal: string;
    targetWeightKg: number | null;
    startWeightKg: number;
    heightCm: number;
    sessionMinutes: number;
    sleepHours: number;
    equipment: string;
    experience: string;
    warmup: boolean;
    cardioLikes: string[];
    priorityMuscles: string[];
    lowPriorityMuscles: string[];
    reminderTime: string | null;
    /** Null until a quick start user sets up Fuel. */
    dietPattern: DietPattern | null;
    allergies: Allergen[];
    mealPattern: MealPattern | null;
    fasting: string | null;
    prep: string | null;
    favouriteDishes: string[];
  };
}

export interface MeDto {
  id: string;
  displayName: string;
  email: string | null;
  units: "METRIC" | "IMPERIAL";
  /** OWNER or ADMIN for the console. */
  appRole: AppRole | null;
  /** Whether Clubs appears in the menu. */
  showClubs: boolean;
}

export interface MyPlanData {
  me: MeDto | null;
  myPlan: ActivePlanDto | null;
}

export interface MealItemDto {
  slotIndex: number;
  slot: MealSlot;
  recipeKey: string;
  name: string;
  portionGuide: string;
  portionFactor: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  eaten: boolean;
  skipped: boolean;
}

export interface DayTotalsDto { kcal: number; proteinG: number; carbsG: number; fatG: number }

export interface FoodLogDto {
  id: string;
  slot: MealSlot;
  foodKey: string | null;
  customFoodId: string | null;
  name: string;
  portionLabel: string;
  portionIndex: number | null;
  grams: number | null;
  quantity: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  replacedSlotIndex: number | null;
}

export interface CustomFoodDto { id: string; name: string; kcal: number; proteinG: number; carbsG: number; fatG: number }

export interface MealDayDto {
  date: string;
  proteinShortfallG: number;
  targets: DayTotalsDto | null;
  items: MealItemDto[];
  foods: FoodLogDto[];
  water: { ml: number; targetMl: number; targetText: string } | null;
  eaten: DayTotalsDto;
}

export interface ActivityDto {
  id: string;
  performedOn: string;
  kind: "CARDIO" | "SPORT" | "WARMUP" | "MOBILITY" | "ABS";
  activityType: string;
  durationMinutes: number;
  distanceKm: number | null;
  kcal: number | null;
  kcalEstimated: boolean;
  avgHeartRate: number | null;
  effort: string | null;
}

export interface SessionSummaryDto {
  id: string;
  templateId: string | null;
  templateName: string | null;
  startedAt: string;
  durationMinutes: number | null;
  setCount: number;
  volumeKg: number;
}

export type WorkoutFeel = "TOO_EASY" | "ABOUT_RIGHT" | "TOO_HARD";
export type EatingAdherence = "MOST_DAYS" | "SOME_DAYS" | "HARD";
export type GoalChoice = "NEW_TARGET" | "MAINTAIN";

export interface CheckinAnswers {
  feel: WorkoutFeel;
  eating: EatingAdherence;
  days: number;
  goalChoice?: GoalChoice | null;
  newTargetKg?: number | null;
  keep?: string[];
}

export interface CycleCheckinDto {
  open: boolean;
  opensOn: string;
  cycleNumber: number;
  currentDays: number;
  currentKcal: number;
  goal: string;
  targetWeightKg: number | null;
  dayRange: { min: number; max: number };
  eatingLog: { loggedDays: number; onTargetDays: number; suggested: EatingAdherence | null };
  results: {
    startKg: number;
    endKg: number | null;
    changeKg: number | null;
    plannedChangeKg: number;
    sessionsPlanned: number;
    sessionsDone: number;
    adherence: number;
    needsWeighIn: boolean;
    goalReached: boolean;
    suggestedDays: number;
    suggestedTargetKg: number | null;
    bestLift: { name: string; fromKg: number; toKg: number } | null;
  };
}

export interface CyclePreviewDto {
  daysPerWeek: number;
  splitLabel: string;
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  changes: { icon: string; title: string; why: string }[];
  sessions: { weekday: number; name: string; exercises: { name: string; sets: number; reps: string; rotatedFrom: string | null; startLoadKg: number | null }[] }[];
}

// ── Clubs ───────────────────────────────────────────────────────────────

export type AppRole = "OWNER" | "ADMIN";
export type ClubMemberStatus = "WAITING" | "ACTIVE" | "DECLINED" | "LEFT" | "REMOVED";

export interface ClubMemberDto {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  isCoach: boolean;
  isMe: boolean;
  joinedAt: string | null;
}

export interface ClubDto {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  me: { userId: string; isAdmin: boolean; isCoach: boolean; askToShare: boolean | null };
  members: ClubMemberDto[];
  joinRequests: { userId: string; displayName: string; requestedAt: string }[];
  invites: { id: string; email: string; asAdmin: boolean; createdAt: string }[];
  joinLinks: { id: string; url: string; expiresAt: string; maxUses: number; uses: number }[];
  limits: { maxAdmins: number; maxMembers: number; maxLinkUses: number; linkDays: number };
  feedLimits: ClubFeedLimitsDto;
}

export interface MyClubsData {
  myClubs: { id: string; name: string; description: string | null; status: ClubMemberStatus }[];
  myClubInvites: { id: string; clubName: string; asAdmin: boolean; token: string }[];
}

export interface JoinPreviewDto {
  clubName: string;
  description: string | null;
  kind: "INVITE" | "LINK";
  asAdmin: boolean;
  problem: string | null;
  emailHint: string | null;
  myStatus: ClubMemberStatus | null;
  clubId: string | null;
}

export interface ConsoleClubDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  closedAt: string | null;
  memberCount: number;
  adminCount: number;
  pendingAdminEmails: string[];
}

export interface AppStaffDto {
  userId: string;
  displayName: string;
  email: string | null;
  role: AppRole;
  grantedAt: string;
}

// ── Clubs feed ──────────────────────────────────────────────────────────

export type ClubPostKind = "WORKOUT" | "RUN" | "CYCLE" | "ACTIVITY" | "PROGRESS" | "MEAL" | "CHALLENGE_WIN" | "COACH_VIDEO";
export type ClubReaction = "FIRE" | "STRONG" | "CLAP" | "HEART";
export type ClubFeedFilter = "ALL" | "WINS" | "COACH_VIDEOS" | "CHALLENGES";

export interface ClubFeedLimitsDto {
  imageMb: number; videoMb: number; videoSeconds: number; coachVideoMb: number; coachVideoSeconds: number; postChars: number; commentChars: number;
}

export interface ClubPersonDto { userId: string; displayName: string; isAdmin: boolean; isCoach: boolean; inClub: boolean; isMe: boolean }
export interface ClubMediaDto { id: string; kind: "IMAGE" | "VIDEO"; url: string; durationSeconds: number | null }

export interface ClubWorkoutDto {
  id: string;
  name: string;
  startedAt: string;
  durationMinutes: number | null;
  setCount: number;
  volumeKg: number;
  exercises: { name: string; swappedFor: string | null; sets: { reps: number; weightKg: number }[] }[];
  prs: { exerciseName: string; type: "HEAVIEST_SET" | "ESTIMATED_1RM" | "MOST_REPS_AT_WEIGHT"; weightKg: number; reps: number; value: number }[];
}

export interface ClubActivityDto {
  id: string;
  activityType: string;
  label: string;
  performedOn: string;
  durationMinutes: number;
  distanceKm: number | null;
  avgHeartRate: number | null;
  effort: "EASY" | "MODERATE" | "HARD" | null;
  kcal: number | null;
}

export interface ClubCommentDto { id: string; body: string; createdAt: string; canDelete: boolean; author: ClubPersonDto; media: ClubMediaDto | null }

export interface ClubPostDto {
  id: string;
  clubId: string;
  kind: ClubPostKind;
  body: string;
  createdAt: string;
  editedAt: string | null;
  hasPr: boolean;
  weightChangeKg: number | null;
  canEdit: boolean;
  canDelete: boolean;
  commentCount: number;
  myReaction: ClubReaction | null;
  author: ClubPersonDto;
  media: ClubMediaDto | null;
  workout: ClubWorkoutDto | null;
  activity: ClubActivityDto | null;
  reactions: { reaction: ClubReaction; count: number }[];
  challenge: { id: string; title: string } | null;
  comments?: ClubCommentDto[];
}

export interface ClubShareDraftDto { text: string; clubs: { id: string; name: string }[] }

export interface ClubMemberOverviewDto {
  member: { userId: string; displayName: string; isAdmin: boolean; isCoach: boolean; joinedAt: string | null };
  sessionsPerWeek: number;
  workouts: number;
  activities: number;
  prs: number;
  lastWorkoutAt: string | null;
  lastActivityOn: string | null;
  challengesTaken: number;
  challengesCompleted: number;
}

export interface ConsoleReportDto {
  id: string;
  clubName: string;
  reason: string;
  createdAt: string;
  reporterName: string;
  reportCount: number;
  item: { postId: string; commentId: string | null; kind: ClubPostKind; authorName: string; body: string; createdAt: string; deleted: boolean; media: { id: string; kind: "IMAGE" | "VIDEO"; url: string } | null };
}

// ── Club routines ───────────────────────────────────────────────────────

export interface ClubRoutineDto {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string | null;
  kind: "ACTIVITY" | "WORKOUT";
  /** 0 = Monday … 6 = Sunday. */
  weekdays: number[];
  activityType: string | null;
  activityLabel: string | null;
  minDistanceKm: number | null;
  minMinutes: number | null;
  createdAt: string;
  exercises: { exerciseId: string; name: string; sets: number; reps: number }[];
}

export interface ClubRoutineProgressDto {
  weekStarts: string[];
  routine: ClubRoutineDto;
  members: { userId: string; displayName: string; isMe: boolean; streak: number; doneToday: boolean; weeks: { weekStart: string; done: number; scheduled: number }[] }[];
}

export type ClubChallengeKind = "WORKOUT" | "ACTIVITY" | "FOOD" | "WATER";
export type ClubChallengeCadence = "DAILY" | "WEEKLY";

export interface ClubChallengeDto {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  description: string | null;
  cadence: ClubChallengeCadence;
  kind: ClubChallengeKind;
  startsOn: string;
  endsOn: string;
  state: "UPCOMING" | "RUNNING" | "FINISHED" | "ENDED";
  createdAt: string;
  totalPeriods: number;
  joinedCount: number;
  myAnswer: "JOINED" | "DECLINED" | null;
  canEnd: boolean;
  timeLimitMinutes: number | null;
  activityType: string | null;
  activityLabel: string | null;
  minDistanceKm: number | null;
  minMinutes: number | null;
  foodKey: string | null;
  foodName: string | null;
  foodGrams: number | null;
  foodUnit: string | null;
  waterMl: number | null;
  coach: ClubPersonDto;
  video: ClubMediaDto | null;
  exercises: { exerciseId: string; name: string; sets: number; reps: number }[];
}

export interface MyClubChallengeDto {
  doneForPeriod: boolean;
  done: number;
  total: number;
  completed: boolean;
  winDraft: string | null;
  challenge: ClubChallengeDto;
}

export interface ClubChallengeEntryDto {
  id: string;
  onDate: string;
  periodStart: string;
  resultSeconds: number | null;
  resultReps: number | null;
  distanceKm: number | null;
  minutes: number | null;
  waterMl: number | null;
  note: string | null;
  createdAt: string;
  proof: ClubMediaDto | null;
}

export interface ClubChallengePageDto {
  challenge: ClubChallengeDto;
  mine: MyClubChallengeDto | null;
  participants: { person: ClubPersonDto; done: number; total: number; completed: boolean; entries: ClubChallengeEntryDto[] }[];
  comments: { id: string; body: string; createdAt: string; canDelete: boolean; author: ClubPersonDto }[];
}
