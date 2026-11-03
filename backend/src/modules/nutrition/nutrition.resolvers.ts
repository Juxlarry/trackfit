import type { GraphQLContext } from "../../shared/auth/context.js";
import { requireUser } from "../../shared/auth/context.js";
import { assertIsoDate } from "../../shared/errors.js";
import {
  changeFoodLog, getMealDay, getMyFoods, getSwapOptions, logFood, removeFoodLog, setMealEaten, setWater, swapMeal,
  type FoodLogChange, type LogFoodInput,
} from "./nutrition.service.js";

export const nutritionResolvers = {
  Query: {
    myFoods: (_p: unknown, _a: unknown, ctx: GraphQLContext) => getMyFoods(requireUser(ctx).id),
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
    logFood: (_p: unknown, args: { input: LogFoodInput }, ctx: GraphQLContext) =>
      logFood(requireUser(ctx).id, { ...args.input, date: assertIsoDate(args.input.date) }),
    changeFoodLog: (_p: unknown, args: { id: string; change: FoodLogChange }, ctx: GraphQLContext) =>
      changeFoodLog(requireUser(ctx).id, args.id, args.change),
    removeFoodLog: (_p: unknown, args: { id: string }, ctx: GraphQLContext) => removeFoodLog(requireUser(ctx).id, args.id),
    setWater: (_p: unknown, args: { date: string; ml: number }, ctx: GraphQLContext) =>
      setWater(requireUser(ctx).id, assertIsoDate(args.date), args.ml),
  },
};
