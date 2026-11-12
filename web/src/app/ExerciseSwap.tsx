import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowLeft, CalendarRange, Check, Repeat } from "lucide-react";
import { EXERCISE_SWAP_OPTIONS, MY_PLAN, SWAP_PLAN_EXERCISE } from "../graphql/operations";
import type { ExerciseSwapOptionDto, SwapFilter } from "../graphql/types";
import { ExerciseFigure } from "../figures/Figures";
import { patOf } from "../figures/figureEngine";
import { PulseLoader } from "../components/ui/PulseLoader";
import { useToast } from "../components/ui/Toast";

/**
 * Exercise swaps (README "Exercise swaps"): options that train the same thing
 * with equipment the member has, then how long the swap lasts. Sets, reps and
 * the exercise's place in the session never change.
 */

const FILTER_LABEL: Record<SwapFilter, string> = { ANY: "Any I have", DUMBBELLS: "Dumbbells", BODYWEIGHT: "Bodyweight" };
const KIT: Record<string, string> = { Barbell: "Barbell", Machine: "Machine", Cable: "Cable", Dumbbell: "Dumbbells", Band: "Band", Bodyweight: "Bodyweight" };

export function SwapPicker({ templateId, exercise, onOneOff, onCycle, onDone, onBack }: {
  templateId: string;
  exercise: { exerciseId: string; name: string };
  /** In a workout: "This workout only" is offered too. Elsewhere it's the rest of the cycle. */
  onOneOff?: (o: ExerciseSwapOptionDto) => void;
  /** After a swap for the rest of the cycle is saved. */
  onCycle?: () => void;
  onDone: () => void;
  onBack?: () => void;
}) {
  const toast = useToast();
  const [only, setOnly] = useState<SwapFilter>("ANY");
  const [picked, setPicked] = useState<ExerciseSwapOptionDto | null>(null);
  const q = useQuery<{ exerciseSwapOptions: { filters: SwapFilter[]; options: ExerciseSwapOptionDto[] } }>(EXERCISE_SWAP_OPTIONS, {
    variables: { templateId, exerciseId: exercise.exerciseId, only }, fetchPolicy: "cache-and-network",
  });
  // ActivePlan has no id, so refresh it explicitly rather than relying on the cache.
  const [swap, swapping] = useMutation(SWAP_PLAN_EXERCISE, { refetchQueries: [{ query: MY_PLAN }], awaitRefetchQueries: true });
  const data = q.data?.exerciseSwapOptions;

  if (picked) {
    const cycle = async () => {
      try {
        await swap({ variables: { templateId, exerciseId: exercise.exerciseId, toExerciseId: picked.exerciseId } });
        toast(`${picked.name} replaces ${exercise.name} until your week-6 check-in.`);
        onCycle?.();
        onDone();
      } catch (e) { toast(e instanceof Error ? e.message : "Couldn't swap that. Try again."); }
    };
    return (
      <>
        <button type="button" className="linkbtn" onClick={() => setPicked(null)}><ArrowLeft />Other options</button>
        <p className="sh-k" style={{ marginTop: 8 }}>Swap {exercise.name}</p>
        <h3>{picked.name}: for how long?</h3>
        <p>Same sets and reps as planned.</p>
        <div className="opts">
          {onOneOff && (
            <button type="button" className="opt" onClick={() => { onOneOff(picked); onDone(); }}>
              <span className="ic"><Check /></span>
              <span><span className="t">This workout only</span><span className="d">Next time it's {exercise.name} again.</span></span>
            </button>
          )}
          <button type="button" className="opt" disabled={swapping.loading} onClick={() => void cycle()}>
            <span className="ic"><CalendarRange /></span>
            <span><span className="t">For the rest of this cycle</span><span className="d">Changes your plan until your week-6 check-in. You can go back to {exercise.name} any time.</span></span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {onBack && <button type="button" className="linkbtn" onClick={onBack}><ArrowLeft />Back</button>}
      <p className="sh-k" style={onBack ? { marginTop: 8 } : undefined}>Swap an exercise</p>
      <h3>Swap {exercise.name}</h3>
      <p>Same sets and reps. These train the same muscles in the same way, with equipment you have.</p>
      {data && data.filters.length > 1 && (
        <div className="opts chips swap-filter" role="radiogroup" aria-label="Equipment today">
          {data.filters.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={only === f} className={`chip${only === f ? " on" : ""}`} onClick={() => setOnly(f)}>{FILTER_LABEL[f]}</button>
          ))}
        </div>
      )}
      {!data ? <PulseLoader small label="Finding options" /> : data.options.length === 0 ? (
        <div className="empty"><Repeat /><span>No other option for {exercise.name} with {only === "ANY" ? "your equipment" : FILTER_LABEL[only].toLowerCase()}. If you can't do it today, skip its sets: your workout still logs.</span></div>
      ) : (
        <div className="opts swap-opts">
          {data.options.map((o) => (
            <button key={o.exerciseId} type="button" className="opt swap-opt" onClick={() => setPicked(o)}>
              {/* A still picture: the whole row is the button. */}
              <span className="thumb" aria-hidden="true">{patOf(o.name) && <ExerciseFigure pattern={patOf(o.name)!} animate={false} />}</span>
              <span><span className="t">{o.name}</span><span className="d">{o.reason}</span></span>
              <span className="tag">{KIT[o.equipment] ?? o.equipment}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
