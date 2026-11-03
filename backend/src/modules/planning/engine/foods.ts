import type { EatingAdherence } from "./checkin.js";

/**
 * Foods anyone can log, Ghanaian dishes first. Numbers are per 100 g (or
 * 100 ml for drinks), estimated from standard food tables (USDA, West African
 * Food Composition Table) for a typical home or chop-bar preparation, so
 * they're good to about ±15%. Each food has household portions with their
 * weight. Shared with the web app, which searches it on the device.
 */
export type FoodGroup = "DISH" | "STAPLE" | "SOUP" | "PROTEIN" | "BREAKFAST" | "SNACK" | "FRUIT" | "DRINK" | "EXTRA";

export interface FoodPortion { label: string; g: number }

export interface Food {
  key: string;
  name: string;
  /** Other names people search by, e.g. local names and brands. */
  aka?: string;
  group: FoodGroup;
  local?: boolean;
  /** Measured in ml rather than g. */
  liquid?: boolean;
  /** kcal, protein g, carbs g, fat g per 100 g (or 100 ml). */
  per100: [number, number, number, number];
  portions: FoodPortion[];
}

type P = [string, number][];
const PLATES: P = [["Cup", 190], ["Small plate", 250], ["Medium plate", 350], ["Large plate", 500]];
const BALLS: P = [["Small ball", 250], ["Medium ball", 350], ["Large ball", 450]];
const MOUNDS: P = [["Small", 250], ["Medium", 350], ["Large", 500]];
const BOWLS: P = [["Small bowl", 250], ["Medium bowl", 400], ["Large bowl", 550]];
const STEWS: P = [["2 tbsp", 30], ["Ladle", 100], ["Cup", 250]];
const PORRIDGE: P = [["Small bowl", 250], ["Medium bowl", 350], ["Large bowl", 500]];
const MEAT: P = [["Small piece", 50], ["3 pieces", 100], ["Portion", 150]];
const GLASS: P = [["Glass", 250], ["Small bottle", 330], ["Bottle", 500]];
const SPOONS: P = [["1 tsp", 5], ["1 tbsp", 14]];

const F = (key: string, name: string, group: FoodGroup, per100: Food["per100"], portions: P, o: { aka?: string; local?: boolean; liquid?: boolean } = {}): Food =>
  ({ key, name, group, per100, portions: portions.map(([label, g]) => ({ label, g })), ...o });
const GH = { local: true };

export const FOODS: Food[] = [
  // Ghanaian dishes and staples
  F("jollof-rice", "Jollof rice", "DISH", [165, 3.2, 28, 4.5], PLATES, { ...GH, aka: "jollof" }),
  F("waakye", "Waakye", "DISH", [150, 5, 28, 1.5], PLATES, { ...GH, aka: "rice and beans, waakye plain" }),
  F("waakye-works", "Waakye with everything (gari, spaghetti, egg, stew, shito)", "DISH", [159, 5.5, 25, 4.2], [["Medium plate", 550], ["Large plate", 750]], { ...GH, aka: "waakye full, waakye special" }),
  F("fried-rice", "Fried rice", "DISH", [175, 4, 27, 5.5], PLATES, { ...GH, aka: "chinese fried rice" }),
  F("plain-rice", "Rice, white, boiled", "STAPLE", [130, 2.7, 28, 0.3], PLATES, { ...GH, aka: "plain rice, rice" }),
  F("brown-rice", "Brown rice, boiled", "STAPLE", [112, 2.6, 23.5, 0.9], PLATES),
  F("omo-tuo", "Omo tuo (rice balls)", "STAPLE", [130, 2.7, 28, 0.3], [["1 ball", 150], ["2 balls", 300]], { ...GH, aka: "rice balls, omotuo" }),
  F("banku", "Banku", "STAPLE", [120, 2, 27, 0.5], BALLS, GH),
  F("kenkey", "Kenkey", "STAPLE", [135, 2.8, 30, 0.8], [["Half ball", 175], ["1 ball", 350]], { ...GH, aka: "dokon, komi, ga kenkey, fante kenkey" }),
  F("fufu", "Fufu", "STAPLE", [155, 1.1, 38, 0.3], MOUNDS, { ...GH, aka: "fufuo, cassava plantain" }),
  F("tz", "Tuo zaafi (TZ)", "STAPLE", [105, 2.2, 23, 0.6], MOUNDS, { ...GH, aka: "tz, tuo" }),
  F("konkonte", "Konkonte", "STAPLE", [145, 1, 35, 0.3], MOUNDS, { ...GH, aka: "kokonte, face the wall" }),
  F("eba", "Eba (cooked gari)", "STAPLE", [150, 0.5, 37, 0.2], MOUNDS, { ...GH, aka: "gari" }),
  F("gari", "Gari, dry", "STAPLE", [360, 1.2, 87, 0.5], [["1 tbsp", 10], ["Quarter cup", 35], ["Cup", 140]], { ...GH, aka: "garri" }),
  F("gari-soakings", "Gari soakings (with sugar, milk, groundnuts)", "BREAKFAST", [150, 3, 30, 2.5], [["Bowl", 300]], { ...GH, aka: "soakings, gari soak" }),
  F("gari-beans", "Gari and beans with oil", "DISH", [175, 6, 26, 5.5], [["Small plate", 300], ["Medium plate", 400], ["Large plate", 550]], { ...GH, aka: "yo ke gari, gob3, beans and gari" }),
  F("yam-boiled", "Yam, boiled", "STAPLE", [118, 1.5, 28, 0.2], [["1 slice", 100], ["2 slices", 200], ["3 slices", 300]], { ...GH, aka: "ampesi yam" }),
  F("yam-fried", "Yam chips, fried", "SNACK", [250, 2, 35, 11], [["5 pieces", 150], ["Portion", 250]], { ...GH, aka: "fried yam, yam chips" }),
  F("plantain-boiled", "Plantain, boiled", "STAPLE", [116, 0.8, 31, 0.2], [["Half", 90], ["1 finger", 180]], { ...GH, aka: "ampesi plantain, boiled ripe, unripe plantain" }),
  F("plantain-fried", "Plantain, fried", "STAPLE", [220, 1.2, 36, 8], [["5 slices", 100], ["Half a plantain", 120], ["1 plantain", 240]], { ...GH, aka: "fried ripe plantain, dodo" }),
  F("kelewele", "Kelewele", "SNACK", [230, 1.5, 35, 9], [["Small pack", 100], ["Cup", 150], ["Large pack", 250]], { ...GH, aka: "spiced fried plantain" }),
  F("boli", "Roasted plantain (boli)", "SNACK", [140, 1.3, 36, 0.4], [["1 finger", 160]], { ...GH, aka: "kofi brokeman, roast plantain" }),
  F("cocoyam", "Cocoyam, boiled", "STAPLE", [112, 1.5, 26, 0.1], [["1 piece", 100], ["2 pieces", 200]], { ...GH, aka: "ampesi" }),
  F("cassava", "Cassava, boiled", "STAPLE", [150, 1.2, 36, 0.3], [["1 piece", 100], ["2 pieces", 200]], { ...GH, aka: "bankye, ampesi" }),
  F("sweet-potato", "Sweet potato, boiled", "STAPLE", [76, 1.4, 17.7, 0.1], [["1 medium", 150]]),
  F("spaghetti", "Spaghetti, cooked", "STAPLE", [158, 5.8, 31, 0.9], [["Side (on waakye)", 80], ["Cup", 140], ["Plate", 250]], { aka: "pasta, macaroni" }),
  F("indomie", "Instant noodles (e.g. Indomie)", "DISH", [470, 9, 60, 21], [["1 pack", 70], ["Big pack", 120], ["2 packs", 140]], { aka: "indomie, noodles" }),

  // Stews and soups
  F("red-red", "Red red (bean stew)", "DISH", [150, 7, 18, 6], [["Cup", 250], ["Plate", 350]], { ...GH, aka: "beans stew, bean stew, gob3" }),
  F("kontomire-stew", "Kontomire stew", "SOUP", [120, 5, 5, 9], STEWS, { ...GH, aka: "palava sauce, cocoyam leaves, nkontomire" }),
  F("garden-egg-stew", "Garden egg stew", "SOUP", [100, 2, 7, 7], STEWS, { ...GH, aka: "eggplant stew, abom" }),
  F("okro-stew", "Okro stew", "SOUP", [90, 4, 6, 6], STEWS, { ...GH, aka: "okra" }),
  F("tomato-stew", "Tomato stew (red stew)", "SOUP", [130, 1.5, 6, 11], STEWS, { ...GH, aka: "stew, gravy, shito stew" }),
  F("egusi-stew", "Agushie stew", "SOUP", [180, 8, 4, 15], STEWS, { ...GH, aka: "egusi" }),
  F("shito", "Shito", "EXTRA", [550, 8, 10, 52], [["1 tsp", 5], ["1 tbsp", 15]], { ...GH, aka: "black pepper sauce" }),
  F("pepper", "Fresh pepper sauce", "EXTRA", [60, 1.5, 9, 2], [["1 tbsp", 15], ["2 tbsp", 30]], { ...GH, aka: "ground pepper, kpakpo shito, green pepper" }),
  F("light-soup", "Light soup", "SOUP", [30, 1.5, 4, 1], BOWLS, { ...GH, aka: "nkrakra, pepper soup, tomato soup" }),
  F("groundnut-soup", "Groundnut soup", "SOUP", [120, 5, 5, 9.5], BOWLS, { ...GH, aka: "nkatie nkwan, peanut soup" }),
  F("palmnut-soup", "Palm nut soup", "SOUP", [140, 3, 4, 13], BOWLS, { ...GH, aka: "abenkwan, banga" }),
  F("okro-soup", "Okro soup", "SOUP", [70, 4, 5, 4], BOWLS, { ...GH, aka: "okra soup, fetri detsi" }),

  // Breakfast
  F("hausa-koko", "Hausa koko", "BREAKFAST", [70, 1.5, 15, 0.5], PORRIDGE, { ...GH, aka: "koko, spicy millet porridge" }),
  F("koko", "Koko (corn porridge)", "BREAKFAST", [65, 1.2, 14, 0.4], PORRIDGE, { ...GH, aka: "corn porridge, akasa" }),
  F("tom-brown", "Tom brown (with milk and sugar)", "BREAKFAST", [90, 3, 15, 2], PORRIDGE, { ...GH, aka: "tombrown, roasted corn porridge" }),
  F("rice-water", "Rice water", "BREAKFAST", [60, 1, 13, 0.3], PORRIDGE, { ...GH, aka: "rice porridge" }),
  F("oats", "Oats, dry", "BREAKFAST", [389, 17, 66, 7], [["40 g", 40], ["60 g", 60], ["80 g", 80]], { aka: "porridge, quaker" }),
  F("cornflakes", "Cornflakes", "BREAKFAST", [357, 7.5, 84, 0.4], [["Bowl", 30], ["Large bowl", 50]], { aka: "cereal" }),
  F("weetabix", "Weetabix", "BREAKFAST", [362, 12, 69, 2], [["2 biscuits", 38], ["3 biscuits", 57]], { aka: "cereal" }),
  F("tea-bread", "Tea bread (sugar bread)", "BREAKFAST", [290, 8, 55, 4], [["1 slice", 40], ["2 slices", 80], ["Small loaf", 200]], { ...GH, aka: "bread, sugar bread" }),
  F("butter-bread", "Butter bread", "BREAKFAST", [320, 8, 52, 9], [["1 slice", 40], ["2 slices", 80], ["Small loaf", 200]], { ...GH, aka: "bread" }),
  F("brown-bread", "Wheat bread", "BREAKFAST", [250, 10, 43, 3.5], [["1 slice", 35], ["2 slices", 70]], { aka: "bread, brown bread, whole wheat" }),
  F("egg-sandwich", "Egg sandwich (bread and fried egg)", "BREAKFAST", [250, 10, 30, 10], [["1 sandwich", 180]], { ...GH, aka: "egg bread, roadside omelette" }),
  F("koose", "Koose", "BREAKFAST", [250, 8, 20, 15], [["1 piece", 30], ["3 pieces", 90], ["5 pieces", 150]], { ...GH, aka: "akara, bean fritters" }),
  F("bofrot", "Bofrot", "SNACK", [330, 6, 45, 14], [["1 piece", 40], ["3 pieces", 120]], { ...GH, aka: "puff puff, toogbei, doughnut" }),

  // Protein
  F("chicken-grilled", "Chicken, grilled (skin off)", "PROTEIN", [180, 25, 0, 8.5], [["1 drumstick", 75], ["1 thigh", 100], ["1 breast", 150]], { aka: "chicken, roast chicken" }),
  F("chicken-fried", "Chicken, fried (with skin)", "PROTEIN", [260, 23, 6, 16], [["1 drumstick", 75], ["1 thigh", 100], ["1 breast", 150]], { aka: "chicken, fried chicken" }),
  F("gizzard", "Gizzard, stewed or grilled", "PROTEIN", [154, 30, 0, 2.7], [["1 skewer", 80], ["Portion", 120]], { ...GH, aka: "gizdodo" }),
  F("tilapia", "Tilapia, grilled", "PROTEIN", [128, 26, 0, 2.7], [["Small fish", 150], ["Medium fish", 250]], { ...GH, aka: "fish, grilled fish" }),
  F("fish-fried", "Fish, fried", "PROTEIN", [230, 22, 3, 14], [["1 piece", 100], ["Whole small fish", 150]], { ...GH, aka: "fried fish, redfish, mackerel, salmon" }),
  F("fish-smoked", "Fish, smoked (mackerel, herring)", "PROTEIN", [260, 24, 0, 18], [["1 piece", 80], ["Whole small fish", 120]], { ...GH, aka: "kako, smoked fish, momoni, keta school boys" }),
  F("sardines", "Sardines in oil (tinned)", "PROTEIN", [208, 25, 0, 11.5], [["Half tin", 45], ["1 tin", 90]], { aka: "sardine, titus" }),
  F("tuna", "Tuna in water (tinned)", "PROTEIN", [116, 26, 0, 1], [["Half tin", 60], ["1 tin", 120]]),
  F("corned-beef", "Corned beef", "PROTEIN", [250, 27, 0, 15], [["Quarter tin", 85], ["Half tin", 170]], { aka: "exeter" }),
  F("goat", "Goat meat, cooked", "PROTEIN", [143, 27, 0, 3], MEAT, { ...GH, aka: "goat, aponkye" }),
  F("beef", "Beef, stewed", "PROTEIN", [220, 28, 0, 12], MEAT, { aka: "meat, cow meat" }),
  F("wele", "Wele (cow skin)", "PROTEIN", [180, 35, 0, 4], [["3 pieces", 60], ["Portion", 120]], { ...GH, aka: "cow skin, kpomo" }),
  F("khebab", "Khebab (beef)", "PROTEIN", [230, 26, 2, 13], [["1 stick", 60], ["3 sticks", 180]], { ...GH, aka: "kebab, kebabs, suya, chichinga" }),
  F("pork", "Pork chop, grilled", "PROTEIN", [230, 26, 0, 14], [["1 chop", 120]], { aka: "pork" }),
  F("sausage", "Sausage", "PROTEIN", [300, 11, 3, 27], [["1 sausage", 45], ["3 sausages", 135]], { aka: "hot dog, frankfurter" }),
  F("snail", "Snail, cooked", "PROTEIN", [90, 16, 2, 1.4], [["3 snails", 100]], { ...GH, aka: "nwa" }),
  F("prawns", "Prawns or shrimp, cooked", "PROTEIN", [99, 24, 0.2, 0.3], [["Portion", 100]], { aka: "shrimps" }),
  F("egg-boiled", "Egg, boiled", "PROTEIN", [155, 13, 1.1, 11], [["1 egg", 50], ["2 eggs", 100]], { aka: "eggs" }),
  F("egg-fried", "Egg, fried or omelette", "PROTEIN", [196, 13.6, 0.8, 15], [["1 egg", 55], ["2-egg omelette", 120]], { aka: "eggs, omelette, scrambled" }),
  F("wagashi", "Wagashi (fried cheese)", "PROTEIN", [300, 20, 2, 23], [["1 piece", 50], ["2 pieces", 100]], { ...GH, aka: "wagasi, woagashie" }),
  F("tofu", "Tofu", "PROTEIN", [76, 8, 1.9, 4.8], [["Portion", 100], ["Large portion", 150]], { aka: "soya" }),
  F("beans", "Beans, boiled", "PROTEIN", [116, 7.7, 21, 0.5], [["Cup", 170]], { aka: "black eyed beans, cowpeas" }),
  F("whey", "Protein shake (whey, with water)", "PROTEIN", [400, 80, 8, 6], [["1 scoop", 30], ["2 scoops", 60]], { aka: "protein powder, shake" }),

  // Fast food and snacks
  F("pizza", "Pizza", "DISH", [266, 11, 33, 10], [["1 slice", 110], ["Half medium pizza", 440]]),
  F("burger", "Burger (beef)", "DISH", [250, 13, 24, 12], [["1 burger", 220], ["Double burger", 320]], { aka: "hamburger, cheeseburger" }),
  F("fries", "Chips (fries)", "SNACK", [312, 3.4, 41, 15], [["Small", 80], ["Medium", 115], ["Large", 150]], { aka: "french fries, chips" }),
  F("shawarma", "Shawarma (chicken)", "DISH", [210, 12, 18, 10], [["1 wrap", 350], ["Large wrap", 450]], { aka: "shawama, wrap" }),
  F("meat-pie", "Meat pie", "SNACK", [290, 8, 28, 16], [["1 pie", 120]], { ...GH, aka: "pie" }),
  F("sausage-roll", "Sausage roll", "SNACK", [330, 9, 30, 19], [["1 roll", 80]]),
  F("spring-roll", "Spring roll", "SNACK", [250, 6, 28, 12], [["1 roll", 60], ["3 rolls", 180]], { aka: "samosa" }),
  F("plantain-chips", "Plantain chips", "SNACK", [520, 2, 60, 30], [["Small pack", 50], ["Large pack", 100]], { ...GH, aka: "chips" }),
  F("chinchin", "Chinchin", "SNACK", [480, 7, 60, 23], [["Handful", 30], ["Small pack", 50]], { ...GH, aka: "chin chin" }),
  F("biscuits", "Biscuits (sweet)", "SNACK", [480, 7, 65, 21], [["2 biscuits", 30], ["Small pack", 60]], { aka: "cookies, digestive, nutri" }),
  F("crackers", "Cream crackers", "SNACK", [440, 9.5, 68, 14], [["3 crackers", 24], ["Small pack", 50]], { aka: "crackers" }),
  F("chocolate", "Chocolate bar", "SNACK", [535, 7.6, 59, 30], [["Small bar", 45], ["Large bar", 100]], { aka: "kitkat, golden tree" }),
  F("ice-cream", "Ice cream (e.g. FanIce sachet)", "SNACK", [207, 3.5, 24, 11], [["Sachet", 65], ["Scoop", 70], ["Cup", 150]], { aka: "fanice, fan ice, fan milk" }),
  F("frozen-yoghurt", "Frozen yoghurt sachet (e.g. FanYogo)", "SNACK", [120, 3, 21, 2.5], [["Sachet", 100]], { aka: "fanyogo, fan yogo" }),
  F("popcorn", "Popcorn", "SNACK", [387, 13, 78, 4.5], [["Small bag", 30], ["Large bag", 60]]),
  F("groundnuts-roasted", "Groundnuts, roasted", "SNACK", [585, 24, 21, 50], [["Handful", 30], ["Small sachet", 50]], { ...GH, aka: "peanuts, nkatie" }),
  F("groundnuts-boiled", "Groundnuts, boiled", "SNACK", [318, 13.5, 21, 22], [["Handful", 50], ["Cup", 100]], { ...GH, aka: "peanuts, nkatie" }),
  F("cashew", "Cashew nuts", "SNACK", [574, 15, 33, 46], [["Handful", 30]], { aka: "nuts" }),
  F("tiger-nuts", "Tiger nuts", "SNACK", [400, 4.5, 45, 24], [["Handful", 30], ["Small bag", 60]], { ...GH, aka: "atadwe" }),
  F("corn-roasted", "Corn, roasted", "SNACK", [120, 3.5, 25, 1.5], [["1 cob", 100]], { ...GH, aka: "maize, aburo" }),
  F("corn-boiled", "Corn, boiled", "SNACK", [96, 3.4, 19, 1.5], [["1 cob", 100]], { ...GH, aka: "maize, aburo" }),
  F("coconut", "Coconut, fresh", "SNACK", [354, 3.3, 15, 33], [["A few slices", 40], ["Quarter coconut", 100]], { ...GH, aka: "kube" }),

  // Fruit and veg
  F("banana", "Banana", "FRUIT", [89, 1.1, 23, 0.3], [["1 medium", 120], ["1 large", 150]], { aka: "kwadu" }),
  F("orange", "Orange", "FRUIT", [47, 0.9, 12, 0.1], [["1 medium", 130]], { aka: "ankaa" }),
  F("pineapple", "Pineapple", "FRUIT", [50, 0.5, 13, 0.1], [["2 slices", 120], ["Cup", 165]], { aka: "abrobe" }),
  F("mango", "Mango", "FRUIT", [60, 0.8, 15, 0.4], [["1 medium", 200]], { aka: "amango" }),
  F("pawpaw", "Pawpaw", "FRUIT", [43, 0.5, 11, 0.3], [["1 slice", 150], ["Cup", 145]], { aka: "papaya" }),
  F("watermelon", "Watermelon", "FRUIT", [30, 0.6, 7.6, 0.2], [["1 slice", 280]]),
  F("apple", "Apple", "FRUIT", [52, 0.3, 14, 0.2], [["1 medium", 180]]),
  F("avocado", "Avocado", "FRUIT", [160, 2, 8.5, 14.7], [["Half", 100], ["1 whole", 200]], { aka: "pear, paya" }),
  F("garden-eggs", "Garden eggs, raw", "FRUIT", [25, 1, 6, 0.2], [["2 fruits", 100]], { ...GH, aka: "eggplant, ntorowa" }),
  F("salad", "Salad (no dressing)", "FRUIT", [20, 1, 3.5, 0.2], [["Side", 100], ["Bowl", 200]], { aka: "vegetables, veg" }),
  F("coleslaw", "Coleslaw", "FRUIT", [150, 1, 13, 10.5], [["Side", 100]], { aka: "salad cream salad" }),

  // Drinks
  F("milk", "Milk, full cream", "DRINK", [61, 3.2, 4.8, 3.3], [["Splash", 30], ["Glass", 250]], { liquid: true, aka: "fresh milk" }),
  F("evaporated-milk", "Evaporated milk (e.g. Ideal)", "DRINK", [134, 6.8, 10, 7.6], [["1 tbsp", 15], ["Small tin", 160]], { liquid: true, aka: "ideal milk, peak milk, carnation" }),
  F("powdered-milk", "Powdered milk", "EXTRA", [496, 26, 38, 27], [["1 tbsp", 8], ["2 tbsp", 16]], { aka: "nido, cowbell, peak powder" }),
  F("milo", "Milo with milk and sugar", "DRINK", [63, 2.4, 10, 1.6], [["Mug", 300]], { liquid: true, aka: "milo, cocoa drink, bournvita, richoco" }),
  F("tea", "Tea with milk and sugar", "DRINK", [28, 0.8, 5, 0.6], [["Mug", 250]], { liquid: true, aka: "lipton, tea" }),
  F("coffee-black", "Coffee or tea, no milk or sugar", "DRINK", [2, 0.3, 0, 0], [["Mug", 250]], { liquid: true, aka: "nescafe, coffee, green tea" }),
  F("yoghurt-drink", "Yoghurt, sweetened (drinking)", "DRINK", [85, 3, 13, 2.5], [["Cup", 200], ["Bottle", 300]], { liquid: true, aka: "yogurt, yoghurt" }),
  F("greek-yoghurt", "Greek yoghurt, plain", "BREAKFAST", [73, 10, 4, 2], [["Pot", 170], ["Large pot", 250]], { aka: "greek yogurt" }),
  F("soy-milk", "Soy milk", "DRINK", [54, 3.3, 6, 1.8], [["Glass", 250]], { liquid: true, aka: "soya milk" }),
  F("sobolo", "Sobolo (sweetened)", "DRINK", [45, 0, 11, 0], GLASS, { ...GH, liquid: true, aka: "bissap, zobo, hibiscus" }),
  F("asaana", "Asaana", "DRINK", [55, 0.3, 13, 0], GLASS, { ...GH, liquid: true, aka: "caramel corn drink" }),
  F("orange-juice", "Fresh orange juice", "DRINK", [45, 0.7, 10.4, 0.2], [["Glass", 250], ["Bottle", 500]], { liquid: true, aka: "juice" }),
  F("juice-box", "Fruit juice (boxed)", "DRINK", [46, 0.3, 11, 0], [["Small box", 200], ["Glass", 250], ["1 litre box", 1000]], { liquid: true, aka: "ceres, don simon, juice" }),
  F("soft-drink", "Soft drink (Coke, Fanta, Sprite)", "DRINK", [42, 0, 10.6, 0], [["Small bottle", 350], ["Can", 330], ["Bottle", 500]], { liquid: true, aka: "coke, coca cola, fanta, sprite, pepsi, minerals, soda" }),
  F("soft-drink-zero", "Soft drink, zero or diet", "DRINK", [0.4, 0, 0, 0], [["Can", 330], ["Bottle", 500]], { liquid: true, aka: "coke zero, diet coke" }),
  F("malt", "Malt drink (e.g. Malta Guinness)", "DRINK", [63, 0.3, 15, 0], [["Can", 330], ["Bottle", 330]], { liquid: true, aka: "malta, malt, beta malt" }),
  F("energy-drink", "Energy drink", "DRINK", [45, 0, 11, 0], [["Can", 250], ["Bottle", 400]], { liquid: true, aka: "rush, storm, red bull" }),
  F("beer", "Beer (lager, e.g. Club, Star)", "DRINK", [43, 0.5, 3.6, 0], [["Small bottle", 330], ["Big bottle", 625]], { liquid: true, aka: "club, star, gulder, heineken, lager" }),
  F("stout", "Stout (e.g. Guinness)", "DRINK", [60, 0.5, 5.5, 0], [["Small bottle", 330], ["Big bottle", 625]], { liquid: true, aka: "guinness" }),
  F("palm-wine", "Palm wine", "DRINK", [40, 0.4, 3, 0.1], [["Glass", 250], ["Calabash", 500]], { ...GH, liquid: true, aka: "nsafufuo, doka" }),
  F("wine", "Wine", "DRINK", [83, 0.1, 2.6, 0], [["Glass", 150]], { liquid: true }),
  F("spirits", "Spirits (gin, whisky, akpeteshie)", "DRINK", [231, 0, 0, 0], [["Shot", 35], ["Double", 70]], { liquid: true, aka: "akpeteshie, gin, whisky, vodka, bitters, alomo" }),

  // Extras
  F("sugar", "Sugar", "EXTRA", [400, 0, 100, 0], [["1 tsp", 4], ["1 tbsp", 12]]),
  F("honey", "Honey", "EXTRA", [304, 0.3, 82, 0], [["1 tsp", 7], ["1 tbsp", 21]]),
  F("peanut-butter", "Peanut butter (groundnut paste)", "EXTRA", [588, 25, 20, 50], [["1 tbsp", 16], ["2 tbsp", 32]], { aka: "groundnut paste" }),
  F("butter", "Butter or margarine", "EXTRA", [717, 0.9, 0.1, 81], SPOONS, { aka: "blue band, margarine" }),
  F("oil", "Cooking oil", "EXTRA", [884, 0, 0, 100], SPOONS, { aka: "palm oil, vegetable oil, frytol" }),
  F("mayonnaise", "Mayonnaise or salad cream", "EXTRA", [680, 1, 1, 75], [["1 tbsp", 14]], { aka: "mayo, salad cream" }),
];

const BY_KEY = new Map(FOODS.map((f) => [f.key, f]));
export const foodByKey = (key: string): Food | undefined => BY_KEY.get(key);

export interface FoodNumbers { kcal: number; proteinG: number; carbsG: number; fatG: number; grams: number }

/** What `quantity` of a portion (or `grams` when given) adds up to. */
export function foodNumbers(food: Food, portionIndex: number, quantity: number, grams?: number | null): FoodNumbers {
  const g = grams ?? (food.portions[portionIndex]?.g ?? 0) * quantity;
  const [k, p, c, f] = food.per100;
  return { kcal: Math.round((k * g) / 100), proteinG: Math.round((p * g) / 100), carbsG: Math.round((c * g) / 100), fatG: Math.round((f * g) / 100), grams: Math.round(g) };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ɛ|3/g, "e").replace(/ɔ/g, "o").replace(/[^a-z0-9 ]/g, " ");
const words = (s: string) => norm(s).split(/\s+/).filter(Boolean);

/**
 * Foods matching a search, best first: name starts with it, then a word in
 * the name, then another name it's known by. Every typed word has to match
 * the start of some word. Ghanaian foods win ties.
 */
export function searchFoods<T extends { name: string; aka?: string; local?: boolean }>(query: string, foods: T[], limit = 30): T[] {
  const q = words(query);
  if (!q.length) return [];
  const full = q.join(" ");
  const scored: { f: T; s: number; i: number }[] = [];
  foods.forEach((f, i) => {
    const name = words(f.name);
    const aka = words(f.aka ?? "");
    if (!q.every((t) => name.some((w) => w.startsWith(t)) || aka.some((w) => w.startsWith(t)))) return;
    const s = name.join(" ").startsWith(full) ? 0
      : q.every((t) => name.some((w) => w.startsWith(t))) ? 1
      : norm(f.aka ?? "").split(",").some((a) => a.trim().startsWith(full)) ? 2 : 3;
    scored.push({ f, s: s * 2 + (f.local ? 0 : 1), i });
  });
  return scored.sort((a, b) => a.s - b.s || a.i - b.i).slice(0, limit).map((x) => x.f);
}

// ── Water ─────────────────────────────────────────────────────────────────

export interface WaterPreset { label: string; ml: number; hint: string }

/** Common ways people drink water in Ghana, for one-tap logging. */
export const WATER_PRESETS: WaterPreset[] = [
  { label: "Glass", ml: 250, hint: "A regular drinking glass" },
  { label: "Sachet", ml: 500, hint: "One sachet of pure water" },
  { label: "Small bottle", ml: 500, hint: "Voltic or Bel-Aqua, 500 ml" },
  { label: "Medium bottle", ml: 750, hint: "Voltic or Bel-Aqua, 750 ml" },
  { label: "Large bottle", ml: 1500, hint: "Voltic or Bel-Aqua, 1.5 L" },
];

/** About 35 ml per kg, plus 500 ml on training days, rounded to 250 ml. */
export function waterTargetMl(weightKg: number, trainingDay: boolean): number {
  const base = Math.min(4000, Math.max(1500, Math.round((weightKg * 35) / 250) * 250));
  return base + (trainingDay ? 500 : 0);
}

const halves = (n: number) => {
  const h = Math.max(0.5, Math.round(n * 2) / 2);
  const whole = Math.floor(h);
  return h % 1 ? (whole ? `${whole}½` : "½") : String(whole);
};

/** "About 2 large Voltic or Bel-Aqua bottles (1.5 L), or 6 sachets." */
export function waterInWords(ml: number): string {
  const large = ml / 1500;
  const big = large >= 1 ? `About ${halves(large)} large Voltic or Bel-Aqua bottle${large > 1.25 ? "s" : ""} (1.5 L)` : `About ${halves(ml / 750)} medium Voltic or Bel-Aqua bottle${ml / 750 > 1.25 ? "s" : ""} (750 ml)`;
  return `${big}, or ${halves(ml / 500)} sachet${ml / 500 > 1.25 ? "s" : ""} of pure water.`;
}

// ── Eating log in the check-in ────────────────────────────────────────────

export interface EatingLog {
  loggedDays: number;
  /** Logged days within ±10% of the calorie target. */
  onTargetDays: number;
  /** Pre-answer for "How did the eating plan go?", when at least half the days were logged. */
  suggested: EatingAdherence | null;
}

export const ON_TARGET_BAND = 0.1;

export function eatingFromLog(dailyKcal: number[], targetKcal: number, daysSoFar: number): EatingLog {
  const logged = dailyKcal.filter((k) => k > 0);
  const onTarget = logged.filter((k) => Math.abs(k - targetKcal) <= targetKcal * ON_TARGET_BAND).length;
  const share = logged.length ? onTarget / logged.length : 0;
  const suggested: EatingAdherence | null = logged.length < Math.max(7, daysSoFar / 2) ? null
    : share >= 0.7 ? "MOST_DAYS" : share >= 0.4 ? "SOME_DAYS" : "HARD";
  return { loggedDays: logged.length, onTargetDays: onTarget, suggested };
}
