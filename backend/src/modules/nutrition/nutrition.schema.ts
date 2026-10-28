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

  extend type Query {
    "The planned menu for a date (YYYY-MM-DD), with eaten ticks and swaps applied."
    mealDay(date: String!): DayMenu!
    "Recipes that fit a slot and the user's diet and allergies."
    mealSwapOptions(date: String!, slotIndex: Int!): [Recipe!]!
  }

  extend type Mutation {
    setMealEaten(date: String!, slotIndex: Int!, eaten: Boolean!): DayMenu!
    swapMeal(date: String!, slotIndex: Int!, recipeKey: String!): DayMenu!
  }
`;
