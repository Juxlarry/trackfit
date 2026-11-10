import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { Check, ChefHat, Clock, Droplet, Minus, PenLine, Plus, Repeat, ShieldCheck, Trophy, Utensils } from "lucide-react";
import { weekdayOf, type MealSlot } from "@engine";
import { WATER_PRESETS } from "@engine/foods";
import { MEAL_DAY, MEAL_SWAP_OPTIONS, SET_MEAL_EATEN, SET_WATER, SWAP_MEAL } from "../graphql/operations";
import type { ClubChallengeDto, FoodLogDto, MealDayDto, MealItemDto, MyClubChallengeDto } from "../graphql/types";
import { usePlan } from "../hooks/usePlan";
import { Ring } from "../components/ui/Ring";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { DAYS, DAYS_LONG, dayLabel, dayOfMonth, dayShort, localToday } from "../lib/dates";
import { ViewHead } from "./AppLayout";
import { SLOT_LABEL, weekDates } from "./planUtil";
import { FoodSheet } from "./FoodSheet";
import { ChallengeProof } from "./clubs/ChallengeProof";
import { useMyChallenges } from "./clubs/challengeHooks";
import { PulseLoader } from "../components/ui/PulseLoader";

const DIET_LABEL: Record<string, string> = { OMNIVORE: "Eats everything", HALAL: "Halal", PESCATARIAN: "Pescatarian", VEGETARIAN: "Vegetarian", VEGAN: "Vegan", OTHER: "Custom" };
const fmt = (n: number) => n.toLocaleString("en-GB");
const SLOT_ORDER: MealSlot[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];

function Bar({ label, v, max, color }: { label: string; v: number; max: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(Math.min(100, max ? (v / max) * 100 : 0)))); return () => cancelAnimationFrame(id); }, [v, max]);
  return <div className="mb"><div className="l"><span>{label}</span><b>{v} / {max} g</b></div><div className="bar"><i style={{ width: `${w}%`, background: color }} /></div></div>;
}

export function FuelPage() {
  const plan = usePlan().plan!;
  const toast = useToast();
  const today = useMemo(() => localToday(), []);
  const week = weekDates(today);
  const [day, setDay] = useState(weekdayOf(today));
  const date = week[day];
  const isT = date === today;
  const q = useQuery<{ mealDay: MealDayDto }>(MEAL_DAY, { variables: { date } });
  const [setEaten] = useMutation<{ setMealEaten: MealDayDto }>(SET_MEAL_EATEN);
  const [swapFor, setSwapFor] = useState<MealItemDto | null>(null);
  // null: closed; "new": log a food; otherwise the logged food being edited.
  // From Today's challenge card: /fuel?log=<challengeId> opens the food sheet on it.
  const [params, setParams] = useSearchParams();
  const [forChallenge, setForChallenge] = useState<string | null>(() => params.get("log"));
  const [food, setFood] = useState<FoodLogDto | "new" | null>(() => (params.get("log") ? "new" : null));
  useEffect(() => { if (params.get("log")) setParams({}, { replace: true }); }, [params, setParams]);
  const challenges = useMyChallenges(date);
  const m = q.data?.mealDay;
  const t = plan.targets;
  const canLog = date <= today;
  const { kcal: eK, proteinG: eP, carbsG: eC, fatG: eF } = m?.eaten ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const left = t.kcal - eK;
  const foods = [...(m?.foods ?? [])].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const allergies = plan.profile.allergies;
  const prep = plan.profile.prep;
  const last = m?.items[m.items.length - 1];
  const prepTxt = prep === "BATCH_FEW_DAYS" && last ? `Cook ${last.name.split(" with")[0].toLowerCase()} in one go for the next 2 to 3 days.`
    : prep === "BATCH_WEEK" ? "Prep lunches and dinners for the work week on Sunday. The menu repeats in blocks so you only cook twice."
    : prep === "BUY" ? "Buying food? Order the closest dish on the menu and keep the portion to one plate." : "";

  const toggle = async (it: MealItemDto) => {
    try {
      await setEaten({
        variables: { date, slotIndex: it.slotIndex, eaten: !it.eaten },
        optimisticResponse: { setMealEaten: { ...m!, items: m!.items.map((x) => (x.slotIndex === it.slotIndex ? { ...x, eaten: !it.eaten, skipped: false } : x)) } },
        update: (cache, { data }) => { if (data) cache.writeQuery({ query: MEAL_DAY, variables: { date }, data: { mealDay: data.setMealEaten } }); },
      });
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that."); }
  };

  return (
    <div className="view-in">
      <ViewHead kicker={isT ? `Today, ${dayShort(date)}` : dayLabel(date)} title="Fuel" />
      <div className="daypick" role="tablist" aria-label="Day">
        {week.map((d, k) => (
          <button key={d} type="button" role="tab" aria-selected={k === day} className={k === day ? "on" : ""} onClick={() => setDay(k)}>{DAYS[k]}<b>{dayOfMonth(d)}</b></button>
        ))}
      </div>
      <div className="agrid">
        <div className="acol">
          <section className="card fadein">
            <div className="card-h">
              <div><h3>{isT ? "Today's menu" : `Menu for ${DAYS_LONG[day]}`}</h3><p>Built from your favourites, scaled to {fmt(t.kcal)} kcal</p></div>
              {canLog && m && <button type="button" className="linkbtn" onClick={() => setFood("new")}><Plus />Log food</button>}
            </div>
            {!m && (q.error ? <p className="help">{q.error.message}</p> : <PulseLoader small label="Loading your menu" />)}
            {m?.items.map((it) => (
              <div key={it.slotIndex} className={`meal-card${it.eaten ? " eaten" : ""}${it.skipped ? " skipped" : ""}`}>
                <button type="button" className={`eat${it.eaten ? " on" : ""}`} aria-pressed={it.eaten} aria-label={`Mark ${it.name} as eaten`} onClick={() => void toggle(it)}><Check /></button>
                <div>
                  <div className="slot">{SLOT_LABEL[it.slot]}{it.skipped && <span className="tag">Replaced</span>}</div>
                  <div className="nm">{it.name}</div>
                  <div className="how">{it.portionGuide}{Math.abs(it.portionFactor - 1) > 0.08 ? ` Portions x${it.portionFactor.toFixed(1)}.` : ""}</div>
                </div>
                <div className="side">
                  <span className="kc">{fmt(it.kcal)} kcal, {it.proteinG} g P</span>
                  <button type="button" className="linkbtn" onClick={() => setSwapFor(it)}><Repeat />Swap</button>
                </div>
              </div>
            ))}
            {m && m.proteinShortfallG > 15 && (
              <div className="meal-card">
                <span className="eat" style={{ borderStyle: "dashed" }}><Plus /></span>
                <div><div className="slot">Protein top-up</div><div className="nm">{plan.profile.dietPattern === "VEGAN" ? "Soy milk or a plant protein shake" : "Greek yogurt or a protein shake"}</div><div className="how">Closes the protein gap for the day.</div></div>
                <div className="side"><span className="kc">+{m.proteinShortfallG} g P</span></div>
              </div>
            )}
          </section>
          {m && canLog && (
            <section className="card fadein" style={{ "--d": ".1s" } as CSSProperties}>
              <div className="card-h">
                <div><h3>Also eaten</h3><p>Anything off the menu: snacks, drinks, eating out</p></div>
                {foods.length > 0 && <button type="button" className="linkbtn" onClick={() => setFood("new")}><Plus />Add</button>}
              </div>
              {foods.map((f) => (
                <button key={f.id} type="button" className="meal-card food-log" onClick={() => setFood(f)} aria-label={`Edit ${f.name}`}>
                  <span className="eat on" aria-hidden="true"><Check /></span>
                  <span>
                    <span className="slot">{SLOT_LABEL[f.slot]}{f.replacedSlotIndex != null && <span className="tag swap">Instead of the plan</span>}</span>
                    <span className="nm">{f.name}</span>
                    <span className="how">{f.portionLabel}{f.quantity !== 1 ? ` × ${f.quantity === 0.5 ? "½" : f.quantity % 1 === 0.5 ? `${Math.floor(f.quantity)}½` : f.quantity}` : ""}</span>
                  </span>
                  <span className="side"><span className="kc">{fmt(f.kcal)} kcal, {f.proteinG} g P</span><span className="linkbtn"><PenLine />Edit</span></span>
                </button>
              ))}
              {!foods.length && (
                <div className="empty"><Utensils /><span>Ate something that isn't on the menu? Log it so your totals stay honest. <button type="button" className="linkbtn" onClick={() => setFood("new")}><Plus />Log food</button></span></div>
              )}
            </section>
          )}
        </div>
        <div className="acol">
          <section className="card fadein" style={{ "--d": ".06s" } as CSSProperties}>
            <div className="card-h"><div><h3>{isT ? "Eaten so far" : "Planned"}</h3><p>Tick meals as you eat them</p></div></div>
            <div className="fuelrow">
              <Ring value={eK} max={t.kcal} big={fmt(eK)} small={`of ${fmt(t.kcal)} kcal`} />
              <div className="mbars">
                <Bar label="Protein" v={eP} max={t.proteinG} color="var(--ink)" />
                <Bar label="Carbs" v={eC} max={t.carbsG} color="var(--lime)" />
                <Bar label="Fat" v={eF} max={t.fatG} color="var(--coral)" />
              </div>
            </div>
            {canLog && eK > 0 && (
              <p className="help" style={{ marginBottom: 0 }}>
                {left >= 0 ? <><b>{fmt(left)} kcal left</b> {isT ? "today" : "that day"}.</> : <><b>{fmt(-left)} over</b> {isT ? "today" : "that day"}. One day doesn't change the trend.</>}
              </p>
            )}
          </section>
          {m?.water && canLog && <WaterCard date={date} day={m} challenges={challenges.filter((x) => x.challenge.kind === "WATER")} />}
          <section className="card fadein" style={{ "--d": ".12s" } as CSSProperties}>
            <div className="card-h"><div><h3>Your rules</h3><p>Every meal follows these</p></div></div>
            <div className="list">
              <div className="li"><span className="ic"><Utensils /></span><span className="t">{DIET_LABEL[plan.profile.dietPattern] ?? "Custom"}</span><span /></div>
              <div className="li"><span className="ic"><ShieldCheck /></span><span className="t">{allergies.length ? `No ${allergies.map((a) => a.toLowerCase()).join(", ")}` : "No allergies set"}</span><span /></div>
              {plan.profile.fasting === "YES" && <div className="li"><span className="ic"><Clock /></span><span className="t">16:8 eating window</span><span /></div>}
              {prepTxt && <div className="li"><span className="ic"><ChefHat /></span><span><span className="t">Prep tip</span><span className="d" style={{ display: "block" }}>{prepTxt}</span></span><span /></div>}
            </div>
          </section>
        </div>
      </div>
      <Sheet open={!!food} onClose={() => { setFood(null); setForChallenge(null); }} label={food === "new" ? "Log food" : "Edit food"}>
        {food && m && <FoodSheet date={date} day={m} editing={food === "new" ? null : food} challengeId={forChallenge} onDone={() => { setFood(null); setForChallenge(null); }} />}
      </Sheet>
      <Sheet open={!!swapFor} onClose={() => setSwapFor(null)} label="Swap a meal">
        {swapFor && <SwapSheet date={date} item={swapFor} kcal={t.kcal} onDone={() => setSwapFor(null)} />}
      </Sheet>
    </div>
  );
}

/** Optional: tap what you drank. The target is in bottles and sachets, not just ml. */
function WaterCard({ date, day, challenges }: { date: string; day: MealDayDto; challenges: MyClubChallengeDto[] }) {
  const toast = useToast();
  const [proof, setProof] = useState<ClubChallengeDto | null>(null);
  const w = day.water!;
  const [last, setLast] = useState<number[]>([]);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const [setWater] = useMutation<{ setWater: MealDayDto }>(SET_WATER, {
    update: (cache, { data }) => { if (data) cache.writeQuery({ query: MEAL_DAY, variables: { date }, data: { mealDay: data.setWater } }); },
  });
  const save = async (ml: number) => {
    const v = Math.max(0, Math.min(10000, Math.round(ml)));
    try {
      await setWater({ variables: { date, ml: v }, optimisticResponse: { setWater: { ...day, water: { ...w, ml: v } } } });
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save that."); }
  };
  const add = (ml: number) => { setLast([...last, ml]); void save(w.ml + ml); };
  const undo = () => { const ml = last[last.length - 1]; setLast(last.slice(0, -1)); void save(w.ml - ml); };
  const pct = Math.min(100, (w.ml / w.targetMl) * 100);
  return (
    <section className="card fadein" style={{ "--d": ".1s" } as CSSProperties}>
      <div className="card-h">
        <div><h3>Water</h3><p>Optional. Aim for {fmt(w.targetMl)} ml: {w.targetText.charAt(0).toLowerCase() + w.targetText.slice(1)}</p></div>
      </div>
      <div className="mb">
        <div className="l"><span>{w.ml >= w.targetMl ? "Target reached" : `${fmt(w.targetMl - w.ml)} ml to go`}</span><b>{fmt(w.ml)} / {fmt(w.targetMl)} ml</b></div>
        <div className="bar"><i style={{ width: `${pct}%`, background: "var(--water)" }} /></div>
      </div>
      {challenges.map(({ challenge: c, doneForPeriod }) => (
        <div key={c.id} className="ch-water">
          <Trophy />
          <span><b>Challenge: {fmt(c.waterMl ?? 0)} ml</b><i>{c.title} · {c.clubName}</i></span>
          {doneForPeriod ? <span className="tag">Proof sent</span>
            : w.ml >= (c.waterMl ?? 0) ? <button type="button" className="linkbtn" onClick={() => setProof(c)}>Send proof</button>
            : <span className="d">{fmt((c.waterMl ?? 0) - w.ml)} ml to go</span>}
        </div>
      ))}
      <Sheet open={!!proof} onClose={() => setProof(null)} label="Send proof">
        {proof && <ChallengeProof challenge={proof} date={date} onDone={() => setProof(null)} />}
      </Sheet>
      <div className="water-presets">
        {WATER_PRESETS.map((p) => (
          <button key={p.label} type="button" className="wp" onClick={() => add(p.ml)} aria-label={`Add ${p.label.toLowerCase()}, ${p.ml} ml`}>
            <Droplet /><span><b>{p.label}</b><i>{p.hint}</i></span><span className="ml">+{p.ml >= 1000 ? `${p.ml / 1000} L` : `${p.ml} ml`}</span>
          </button>
        ))}
      </div>
      <div className="water-actions">
        {last.length > 0 && <button type="button" className="linkbtn" onClick={undo}><Minus />Undo last</button>}
        {editing ? (
          <form className="water-edit" onSubmit={(e) => { e.preventDefault(); void save(Number(typed) || 0); setEditing(false); setLast([]); }}>
            <label htmlFor="w-total" className="help">Total for the day (ml)</label>
            <input id="w-total" className="txt" type="number" inputMode="numeric" min={0} max={10000} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <button type="submit" className="linkbtn"><Check />Save</button>
          </form>
        ) : (
          <button type="button" className="linkbtn" onClick={() => { setTyped(String(w.ml)); setEditing(true); }}><PenLine />Enter a total</button>
        )}
      </div>
    </section>
  );
}

function SwapSheet({ date, item, kcal, onDone }: { date: string; item: MealItemDto; kcal: number; onDone: () => void }) {
  const toast = useToast();
  const q = useQuery<{ mealSwapOptions: { key: string; name: string; portionGuide: string }[] }>(MEAL_SWAP_OPTIONS, { variables: { date, slotIndex: item.slotIndex } });
  const [swap] = useMutation<{ swapMeal: MealDayDto }>(SWAP_MEAL);
  const [picked, setPicked] = useState("");
  const choose = async (key: string, name: string) => {
    setPicked(key);
    try {
      await swap({
        variables: { date, slotIndex: item.slotIndex, recipeKey: key },
        update: (cache, { data }) => { if (data) cache.writeQuery({ query: MEAL_DAY, variables: { date }, data: { mealDay: data.swapMeal } }); },
      });
      toast(`Swapped to ${name.toLowerCase()}.`);
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't swap that."); setPicked(""); }
  };
  const options = (q.data?.mealSwapOptions ?? []).filter((o) => o.key !== item.recipeKey);
  return (
    <>
      <p className="sh-k">Swap {SLOT_LABEL[item.slot].toLowerCase()}</p>
      <h3>Pick something else</h3>
      <p>Portions are rescaled so your day still adds up to {fmt(kcal)} kcal.</p>
      {q.loading && <PulseLoader small label="Loading options" />}
      <div className="opts">
        {options.map((o) => (
          <button key={o.key} type="button" className={`opt noico${picked === o.key ? " on" : ""}`} disabled={!!picked} onClick={() => void choose(o.key, o.name)}>
            <span><span className="t">{o.name}</span><span className="d" style={{ display: "block" }}>{o.portionGuide}</span></span>
            <span className="tick"><Check /></span>
          </button>
        ))}
      </div>
    </>
  );
}
