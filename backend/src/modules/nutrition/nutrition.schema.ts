export const nutritionTypeDefs = /* GraphQL */ `
  type Recipe {
    key: String!
    dish: String!
    name: String!
    slot: MealSlot!
    kcal: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
    portionGuide: String!
    isLocal: Boolean!
  }

  "A food eaten on a day, from the food list or the user's own."
  type FoodLog {
    id: ID!
    slot: MealSlot!
    foodKey: String
    customFoodId: ID
    name: String!
    "e.g. Medium plate (350 g), 250 g, or 1 serving."
    portionLabel: String!
    portionIndex: Int
    grams: Int
    quantity: Float!
    kcal: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
    "The planned meal this was eaten instead of."
    replacedSlotIndex: Int
  }

  type DayTotals {
    kcal: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
  }

  type WaterDay {
    ml: Int!
    targetMl: Int!
    "The target in bottles and sachets."
    targetText: String!
  }

  "A quick-add food the user saved. Its numbers are for one serving."
  type CustomFood {
    id: ID!
    name: String!
    kcal: Int!
    proteinG: Int!
    carbsG: Int!
    fatG: Int!
  }

  type MyFoods {
    custom: [CustomFood!]!
    "The last distinct foods and portions logged, newest first."
    recent: [FoodLog!]!
  }

  input CustomFoodInput {
    name: String!
    kcal: Int!
    proteinG: Int
    carbsG: Int
    fatG: Int
  }

  "Log one of: foodKey (with portionIndex or grams), customFoodId, or a new custom food."
  input LogFoodInput {
    date: String!
    slot: MealSlot!
    foodKey: String
    portionIndex: Int
    grams: Int
    customFoodId: ID
    custom: CustomFoodInput
    quantity: Float!
    insteadOfSlotIndex: Int
  }

  input FoodLogChange {
    slot: MealSlot!
    portionIndex: Int
    grams: Int
    quantity: Float!
  }

  extend type Query {
    myFoods: MyFoods!
    "The planned menu for a date (YYYY-MM-DD), with eaten ticks and swaps applied."
    mealDay(date: String!): DayMenu!
    "Recipes that fit a slot and the user's diet and allergies."
    mealSwapOptions(date: String!, slotIndex: Int!): [Recipe!]!
  }

  extend type Mutation {
    setMealEaten(date: String!, slotIndex: Int!, eaten: Boolean!): DayMenu!
    swapMeal(date: String!, slotIndex: Int!, recipeKey: String!): DayMenu!
    logFood(input: LogFoodInput!): DayMenu!
    changeFoodLog(id: ID!, change: FoodLogChange!): DayMenu!
    removeFoodLog(id: ID!): DayMenu!
    setWater(date: String!, ml: Int!): DayMenu!
  }
`;
