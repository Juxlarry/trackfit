import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Check, ChefHat, Clock, Info, Plus, Repeat, ShieldCheck, Utensils } from "lucide-react";
import { weekdayOf } from "@engine";
import { MEAL_DAY, MEAL_SWAP_OPTIONS, SET_MEAL_EATEN, SWAP_MEAL } from "../graphql/operations";
import type { MealDayDto, MealItemDto } from "../graphql/types";
import { usePlan } from "../hooks/usePlan";
import { Ring } from "../components/ui/Ring";
import { Sheet } from "../components/ui/Sheet";
import { useToast } from "../components/ui/Toast";
import { DAYS, DAYS_LONG, dayLabel, dayOfMonth, dayShort, localToday } from "../lib/dates";
import { SLOT_LABEL } from "../onboarding/screens";
import { ViewHead } from "./AppLayout";
import { weekDates } from "./planUtil";

const DIET_LABEL: Record<string, string> = { OMNIVORE: "Eats everything", HALAL: "Halal", PESCATARIAN: "Pescatarian", VEGETARIAN: "Vegetarian", VEGAN: "Vegan", OTHER: "Custom" };
const fmt = (n: number) => n.toLocaleString("en-GB");

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
  const m = q.data?.mealDay;
  const t = plan.targets;
  const eaten = (m?.items ?? []).filter((x) => x.eaten);
  const eK = eaten.reduce((a, x) => a + x.kcal, 0);
  const eP = eaten.reduce((a, x) => a + x.proteinG, 0);
  const eC = eaten.reduce((a, x) => a + x.carbsG, 0);
  const eF = eaten.reduce((a, x) => a + x.fatG, 0);
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
        optimisticResponse: { setMealEaten: { ...m!, items: m!.items.map((x) => (x.slotIndex === it.slotIndex ? { ...x, eaten: !it.eaten } : x)) } },
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
            <div className="card-h"><div><h3>{isT ? "Today's menu" : `Menu for ${DAYS_LONG[day]}`}</h3><p>Built from your favourites, scaled to {fmt(t.kcal)} kcal</p></div></div>
            {!m && <p className="help">{q.error ? q.error.message : "Loading your menu…"}</p>}
            {m?.items.map((it) => (
              <div key={it.slotIndex} className={`meal-card${it.eaten ? " eaten" : ""}`}>
                <button type="button" className={`eat${it.eaten ? " on" : ""}`} aria-pressed={it.eaten} aria-label={`Mark ${it.name} as eaten`} onClick={() => void toggle(it)}><Check /></button>
                <div>
                  <div className="slot">{SLOT_LABEL[it.slot]}</div>
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
          <div className="empty fadein" style={{ "--d": ".1s" } as CSSProperties}><Info /><span>Ate something off-plan? Logging any food you like arrives in a later release. For now, swap a meal to the closest match.</span></div>
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
          </section>
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
      <Sheet open={!!swapFor} onClose={() => setSwapFor(null)} label="Swap a meal">
        {swapFor && <SwapSheet date={date} item={swapFor} kcal={t.kcal} onDone={() => setSwapFor(null)} />}
      </Sheet>
    </div>
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
      {q.loading && <p className="help">Loading options…</p>}
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
