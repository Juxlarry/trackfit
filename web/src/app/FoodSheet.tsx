import { useEffect, useMemo, useState } from "react";
import type { ApolloCache } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, Check, Clock, PenLine, Plus, Search, Star, Trash2, Trophy } from "lucide-react";
import type { MealSlot } from "@engine";
import { FOODS, foodByKey, foodNumbers, searchFoods, type Food } from "@engine/foods";
import { CHANGE_FOOD_LOG, LOG_FOOD, MEAL_DAY, MY_FOODS, REMOVE_FOOD_LOG } from "../graphql/operations";
import type { ClubChallengeDto, CustomFoodDto, FoodLogDto, MealDayDto } from "../graphql/types";
import { useUnits } from "../hooks/usePlan";
import { ChipGroup } from "../components/ui/Options";
import { useToast } from "../components/ui/Toast";
import { dayLabel } from "../lib/dates";
import { SLOT_LABEL } from "./planUtil";
import { ChallengeProof } from "./clubs/ChallengeProof";
import { useMyChallenges } from "./clubs/challengeHooks";

/**
 * Log any food: search the food list (or your own foods), pick a portion and
 * amount, and which meal it was. Also edits or removes a logged food.
 */
type Choice = { kind: "food"; food: Food } | { kind: "custom"; custom: CustomFoodDto };
type Step = "pick" | "amount" | "quick" | "proof";

const SLOTS: MealSlot[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];
const QTYS = [0.5, 1, 1.5, 2, 3];
const POPULAR = ["jollof-rice", "waakye", "banku", "kenkey", "fufu", "red-red", "kelewele", "hausa-koko", "tea-bread", "egg-boiled", "chicken-grilled", "soft-drink"];
const fmt = (n: number) => n.toLocaleString("en-GB");
const qtyText = (q: number) => (q === 0.5 ? "½" : q % 1 === 0.5 ? `${Math.floor(q)}½` : String(q));

function slotByClock(): MealSlot {
  const h = new Date().getHours();
  return h < 11 ? "BREAKFAST" : h < 15 ? "LUNCH" : h < 18 ? "SNACK" : "DINNER";
}

type Mutated = { logFood?: MealDayDto; changeFoodLog?: MealDayDto; removeFoodLog?: MealDayDto };

/** challengeId: start on that club food challenge (from Today's challenge card). */
export function FoodSheet({ date, day, editing, challengeId, onDone }: { date: string; day: MealDayDto; editing: FoodLogDto | null; challengeId?: string | null; onDone: () => void }) {
  const toast = useToast();
  const imperial = useUnits().unit === "lb";
  const mine = useQuery<{ myFoods: { custom: CustomFoodDto[]; recent: FoodLogDto[] } }>(MY_FOODS, { fetchPolicy: "cache-and-network" });
  const custom = useMemo(() => mine.data?.myFoods.custom ?? [], [mine.data]);
  const recent = mine.data?.myFoods.recent ?? [];

  const editPick = (): Choice | null => {
    if (!editing) return null;
    const food = editing.foodKey ? foodByKey(editing.foodKey) : undefined;
    if (food) return { kind: "food", food };
    const per = (n: number) => n / editing.quantity;
    return { kind: "custom", custom: { id: editing.customFoodId ?? "", name: editing.name, kcal: per(editing.kcal), proteinG: per(editing.proteinG), carbsG: per(editing.carbsG), fatG: per(editing.fatG) } };
  };
  const [step, setStep] = useState<Step>(editing ? "amount" : "pick");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<Choice | null>(editPick);
  const [portion, setPortion] = useState<number | "g">(editing ? (editing.grams != null ? "g" : editing.portionIndex ?? 0) : 0);
  const [grams, setGrams] = useState(editing?.grams ? String(editing.grams) : "");
  const [qty, setQty] = useState(editing?.quantity ?? 1);
  const [slot, setSlot] = useState<MealSlot>(editing?.slot ?? slotByClock());
  const [instead, setInstead] = useState(true);
  const [quick, setQuick] = useState({ name: "", kcal: "", p: "", c: "", f: "" });
  // Food challenges you've taken on: a quick option, then proof once it's logged.
  const challenges = useMyChallenges(date).filter((m) => m.challenge.kind === "FOOD" && !m.doneForPeriod && !m.completed).map((m) => m.challenge);
  const [forCh, setForCh] = useState<ClubChallengeDto | null>(null);
  const startChallenge = (c: ClubChallengeDto) => {
    setForCh(c);
    const food = c.foodKey ? foodByKey(c.foodKey) : undefined;
    if (!food) { setStep("proof"); return; }
    setPick({ kind: "food", food });
    setPortion("g");
    setGrams(String(c.foodGrams ?? ""));
    setQty(1);
    setStep("amount");
  };
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (autoStarted || !challengeId || editing) return;
    const c = challenges.find((x) => x.id === challengeId);
    if (c) { setAutoStarted(true); startChallenge(c); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, challenges.length]);

  const update = { update: (cache: ApolloCache, { data }: { data?: Mutated | null }) => {
    const d = data?.logFood ?? data?.changeFoodLog ?? data?.removeFoodLog;
    if (d) cache.writeQuery({ query: MEAL_DAY, variables: { date }, data: { mealDay: d } });
  } };
  const [logFood, logging] = useMutation<Mutated>(LOG_FOOD, { ...update, refetchQueries: [{ query: MY_FOODS }] });
  const [changeFood, changing] = useMutation<Mutated>(CHANGE_FOOD_LOG, update);
  const [removeFood, removing] = useMutation<Mutated>(REMOVE_FOOD_LOG, update);
  const busy = logging.loading || changing.loading || removing.loading;

  // The planned meal in this slot, if it's still on the menu: the food may replace it.
  const planned = editing ? undefined : day.items.find((it) => it.slot === slot && !it.eaten && !it.skipped);

  const results = useMemo(() => {
    const all: ({ name: string; aka?: string; local?: boolean } & ({ food: Food } | { custom: CustomFoodDto }))[] = [
      ...custom.map((c) => ({ name: c.name, custom: c })),
      ...FOODS.map((f) => ({ name: f.name, aka: f.aka, local: f.local, food: f })),
    ];
    return searchFoods(query, all);
  }, [query, custom]);

  const choose = (p: Choice, from?: FoodLogDto) => {
    setPick(p);
    setPortion(from ? (from.grams != null ? "g" : from.portionIndex ?? 0) : 0);
    setGrams(from?.grams ? String(from.grams) : "");
    setQty(from?.quantity ?? 1);
    setStep("amount");
  };
  const chooseRecent = (r: FoodLogDto) => {
    const food = r.foodKey ? foodByKey(r.foodKey) : undefined;
    const saved = custom.find((c) => c.id === r.customFoodId);
    if (food) choose({ kind: "food", food }, r);
    else if (saved) choose({ kind: "custom", custom: saved }, r);
  };

  const unit = pick?.kind === "food" && pick.food.liquid ? "ml" : "g";
  const imp = (g: number) => (imperial ? ` · ${Math.round((g / (unit === "ml" ? 29.57 : 28.35)) * 10) / 10} ${unit === "ml" ? "fl oz" : "oz"}` : "");
  const gramsN = Math.round(Number(grams));
  const numbers = !pick ? null
    : pick.kind === "food" ? foodNumbers(pick.food, portion === "g" ? 0 : portion, qty, portion === "g" ? gramsN || 0 : null)
    : { kcal: Math.round(pick.custom.kcal * qty), proteinG: Math.round(pick.custom.proteinG * qty), carbsG: Math.round(pick.custom.carbsG * qty), fatG: Math.round(pick.custom.fatG * qty), grams: 0 };
  const amountOk = portion !== "g" || (gramsN >= 1 && gramsN <= 5000);

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : "Couldn't save that. Try again.");
  const insteadOf = planned && instead ? planned.slotIndex : null;
  const done = (what: string) => {
    toast(`${what} logged for ${SLOT_LABEL[slot].toLowerCase()}${planned && instead ? `, instead of ${planned.name.toLowerCase()}` : ""}.`);
    onDone();
  };

  const save = async () => {
    if (!pick || !amountOk) return;
    const amount = pick.kind === "food"
      ? (portion === "g" ? { grams: gramsN, portionIndex: null, quantity: 1 } : { portionIndex: portion, grams: null, quantity: qty })
      : { portionIndex: null, grams: null, quantity: qty };
    try {
      if (editing) {
        await changeFood({ variables: { id: editing.id, change: { slot, ...amount } } });
        toast(`${editing.name} updated.`);
        onDone();
        return;
      }
      await logFood({ variables: { input: {
        date, slot, ...amount, insteadOfSlotIndex: insteadOf,
        ...(pick.kind === "food" ? { foodKey: pick.food.key } : { customFoodId: pick.custom.id }),
      } } });
      // Logged for a challenge: proof next, in the same sheet.
      if (forCh && pick.kind === "food" && pick.food.key === forCh.foodKey) { setStep("proof"); return; }
      done(pick.kind === "food" ? pick.food.name : pick.custom.name);
    } catch (e) { fail(e); }
  };

  const saveQuick = async () => {
    const n = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
    try {
      await logFood({ variables: { input: {
        date, slot, quantity: 1, insteadOfSlotIndex: insteadOf,
        custom: { name: quick.name.trim(), kcal: n(quick.kcal) ?? 0, proteinG: n(quick.p), carbsG: n(quick.c), fatG: n(quick.f) },
      } } });
      done(quick.name.trim());
    } catch (e) { fail(e); }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await removeFood({ variables: { id: editing.id } });
      toast(`${editing.name} removed.`);
      onDone();
    } catch (e) { fail(e); }
  };

  const mealPicker = (
    <>
      <p style={{ fontWeight: 600, margin: "18px 0 8px" }}>Which meal?</p>
      <ChipGroup label="Meal" options={SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))} selected={[slot]} onPick={setSlot} />
      {planned && (
        <>
          <p style={{ fontWeight: 600, margin: "18px 0 8px" }}>Instead of {planned.name.toLowerCase()}?</p>
          <ChipGroup label="Instead of the planned meal" selected={[instead ? "yes" : "no"]} onPick={(v) => setInstead(v === "yes")}
            options={[{ value: "yes", label: "Yes, instead of it" }, { value: "no", label: "No, as well" }]} />
          <p className="help" style={{ marginTop: 8 }}>{instead ? "The planned meal won't count toward today." : "Tick the planned meal too once you've eaten it."}</p>
        </>
      )}
    </>
  );

  if (step === "proof" && forCh) return <ChallengeProof challenge={forCh} date={date} onDone={onDone} />;

  if (step === "quick") {
    const ok = quick.name.trim().length >= 2 && Number(quick.kcal) > 0;
    return (
      <>
        <button type="button" className="linkbtn" onClick={() => setStep("pick")}><ArrowLeft />Back to search</button>
        <p className="sh-k" style={{ marginTop: 8 }}>{dayLabel(date)}</p>
        <h3>Add your own food</h3>
        <p>It's saved to My foods, so next time it's one search away. Check the label or the restaurant's menu for the calories.</p>
        <div className="field"><label htmlFor="q-name">Name</label><input className="txt" id="q-name" maxLength={80} placeholder="e.g. Mum's light soup with goat" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} /></div>
        <div className="row2" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="q-kcal">Calories (kcal)</label><input className="txt" id="q-kcal" type="number" inputMode="numeric" min={1} max={5000} value={quick.kcal} onChange={(e) => setQuick({ ...quick, kcal: e.target.value })} /></div>
          <div className="field"><label htmlFor="q-p">Protein (g) <span className="opt-l">Optional</span></label><input className="txt" id="q-p" type="number" inputMode="numeric" min={0} value={quick.p} onChange={(e) => setQuick({ ...quick, p: e.target.value })} /></div>
          <div className="field"><label htmlFor="q-c">Carbs (g) <span className="opt-l">Optional</span></label><input className="txt" id="q-c" type="number" inputMode="numeric" min={0} value={quick.c} onChange={(e) => setQuick({ ...quick, c: e.target.value })} /></div>
          <div className="field"><label htmlFor="q-f">Fat (g) <span className="opt-l">Optional</span></label><input className="txt" id="q-f" type="number" inputMode="numeric" min={0} value={quick.f} onChange={(e) => setQuick({ ...quick, f: e.target.value })} /></div>
        </div>
        {mealPicker}
        <button type="button" className="cta" disabled={!ok || busy} onClick={() => void saveQuick()}>Add and save<Check /></button>
      </>
    );
  }

  if (step === "amount" && pick && numbers) {
    const name = pick.kind === "food" ? pick.food.name : pick.custom.name;
    return (
      <>
        {!editing && <button type="button" className="linkbtn" onClick={() => setStep("pick")}><ArrowLeft />Back to search</button>}
        <p className="sh-k" style={{ marginTop: editing ? 0 : 8 }}>{editing ? `Edit · ${dayLabel(date)}` : dayLabel(date)}</p>
        <h3>{name}</h3>
        {pick.kind === "food" ? (
          <>
            <p style={{ fontWeight: 600, margin: "14px 0 8px" }}>Portion</p>
            <ChipGroup label="Portion" selected={[portion]} onPick={setPortion}
              options={[...pick.food.portions.map((p, i) => ({ value: i as number | "g", label: `${p.label} · ${p.g} ${unit}${imp(p.g)}` })), { value: "g" as const, label: `Enter ${unit}` }]} />
          </>
        ) : <p className="help">Your own food. Numbers are for 1 serving.</p>}
        {portion === "g" && pick.kind === "food" ? (
          <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
            <label htmlFor="f-g">Amount ({unit})</label>
            <input className="txt" id="f-g" type="number" inputMode="numeric" min={1} max={5000} value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
          </div>
        ) : (
          <>
            <p style={{ fontWeight: 600, margin: "18px 0 8px" }}>{pick.kind === "food" ? "How many?" : "Servings"}</p>
            <ChipGroup label="Amount" options={QTYS.map((q) => ({ value: q, label: `${qtyText(q)}×` }))} selected={[qty]} onPick={setQty} />
          </>
        )}
        <div className="food-sum" aria-live="polite">
          <b>{fmt(numbers.kcal)}</b><span>kcal</span>
          <i>{numbers.proteinG} g protein · {numbers.carbsG} g carbs · {numbers.fatG} g fat</i>
        </div>
        {mealPicker}
        <button type="button" className="cta" disabled={!amountOk || busy} onClick={() => void save()}>{editing ? "Save changes" : `Add ${fmt(numbers.kcal)} kcal`}<Check /></button>
        {editing && <button type="button" className="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={busy} onClick={() => void remove()}><Trash2 />Remove from {dayLabel(date).toLowerCase()}</button>}
      </>
    );
  }

  const row = (key: string, title: string, desc: string, onClick: () => void) => (
    <button key={key} type="button" className="opt noico" onClick={onClick}>
      <span><span className="t">{title}</span><span className="d" style={{ display: "block" }}>{desc}</span></span>
      <span className="tick"><Plus /></span>
    </button>
  );
  const foodRow = (f: Food) => {
    const p = f.portions[0];
    return row(f.key, f.name, `${fmt(foodNumbers(f, 0, 1).kcal)} kcal per ${p.label.toLowerCase()} (${p.g} ${f.liquid ? "ml" : "g"})`, () => choose({ kind: "food", food: f }));
  };
  const customRow = (c: CustomFoodDto) => row(`c-${c.id}`, c.name, `${fmt(c.kcal)} kcal per serving · My foods`, () => choose({ kind: "custom", custom: c }));

  return (
    <>
      <p className="sh-k">{dayLabel(date)}</p>
      <h3>Log food</h3>
      <div className="food-search">
        <Search aria-hidden="true" />
        <input className="txt" type="search" aria-label="Search foods" placeholder="Search: waakye, kenkey, Malta, pizza…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      {!query.trim() && challenges.length > 0 && (
        <>
          <h4 className="food-h"><Trophy />Club challenges</h4>
          <div className="opts food-list">
            {challenges.map((c) => row(`ch-${c.id}`, `Challenge: ${c.foodGrams} ${c.foodUnit ?? "g"} ${(c.foodName ?? "").toLowerCase()}`, `${c.title} · ${c.clubName}`, () => startChallenge(c)))}
          </div>
        </>
      )}
      {query.trim() ? (
        <div className="opts food-list">
          {results.map((r) => ("food" in r ? foodRow(r.food) : customRow(r.custom)))}
          {!results.length && <p className="help">Nothing called "{query.trim()}" yet.</p>}
        </div>
      ) : (
        <>
          {recent.length > 0 && (
            <>
              <h4 className="food-h"><Clock />Recent</h4>
              <div className="opts food-list">
                {recent.slice(0, 6).map((r) => row(`r-${r.id}`, r.name, `${r.portionLabel}${r.quantity !== 1 ? ` × ${qtyText(r.quantity)}` : ""} · ${fmt(r.kcal)} kcal`, () => chooseRecent(r)))}
              </div>
            </>
          )}
          {custom.length > 0 && (
            <>
              <h4 className="food-h"><Star />My foods</h4>
              <div className="opts food-list">{custom.map(customRow)}</div>
            </>
          )}
          <h4 className="food-h">Popular</h4>
          <div className="opts food-list">{POPULAR.map((k) => foodByKey(k)).filter((f): f is Food => !!f).map(foodRow)}</div>
        </>
      )}
      <button type="button" className="ghost" style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
        onClick={() => { setQuick({ ...quick, name: query.trim() }); setStep("quick"); }}>
        <PenLine />Can't find it? Add your own
      </button>
    </>
  );
}
