import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import { assertIsoDate } from "../../shared/errors.js";
import { getMealDay, getSwapOptions, setMealEaten, swapMeal } from "./nutrition.service.js";

export const nutritionResolvers = {
  Query: {
    mealDay: (_p: unknown, args: { date: string }, ctx: GraphQLContext) =>
      getMealDay(requireUser(ctx).id, assertIsoDate(args.date)),
    mealSwapOptions: (_p: unknown, args: { date: string; slotIndex: number }, ctx: GraphQLContext) =>
      getSwapOptions(requireUser(ctx).id, assertIsoDate(args.date), args.slotIndex),
  },
  Mutation: {
    setMealEaten: (_p: unknown, args: { date: string; slotIndex: number; eaten: boolean }, ctx: GraphQLContext) =>
      setMealEaten(requireUser(ctx).id, assertIsoDate(args.date), args.slotIndex, args.eaten),
    swapMeal: (_p: unknown, args: { date: string; slotIndex: number; recipeKey: string }, ctx: GraphQLContext) =>
      swapMeal(requireUser(ctx).id, assertIsoDate(args.date), args.slotIndex, args.recipeKey),
  },
};
