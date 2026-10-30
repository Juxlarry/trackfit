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
}

export interface PlannedSessionDto {
  templateId: string | null;
  weekday: number;
  type: string;
  name: string;
  warmup: { name: string; dose: string }[];
  exercises: PlannedExerciseDto[];
}

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
}

export interface MealDayDto {
  date: string;
  proteinShortfallG: number;
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  items: MealItemDto[];
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
