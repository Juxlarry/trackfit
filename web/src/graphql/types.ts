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
}

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
    dietPattern: DietPattern;
    allergies: Allergen[];
    mealPattern: MealPattern;
    fasting: string;
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
  me: { userId: string; isAdmin: boolean; isCoach: boolean };
  members: ClubMemberDto[];
  joinRequests: { userId: string; displayName: string; requestedAt: string }[];
  invites: { id: string; email: string; asAdmin: boolean; createdAt: string }[];
  joinLinks: { id: string; url: string; expiresAt: string; maxUses: number; uses: number }[];
  limits: { maxAdmins: number; maxMembers: number; maxLinkUses: number; linkDays: number };
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
