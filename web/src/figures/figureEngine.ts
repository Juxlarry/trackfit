/**
 * Exercise and body-shape illustrations (ported from the approved prototype).
 * Side-view figure posed with simple forward kinematics. Angles: 0 = up,
 * 90 = right (facing), 180 = down, 270 = left, measured from the hip outward.
 * drawFig() returns SVG markup for a 240x186 viewBox; ExerciseFigure animates it.
 */
type Pt = [number, number];
type JointKey = "H" | "K" | "A" | "K2" | "A2" | "S" | "Hd" | "E" | "W" | "E2" | "W2";
type Joints = Record<JointKey, Pt>;
export type FigMode = "good" | "bad";
export interface Pose {
  pin?: JointKey; at?: Pt; th: number; sh: number; to: number; ua: number; fa: number;
  th2?: number; sh2?: number; ua2?: number; fa2?: number; nk?: number; bend?: number; ft?: number; ft2?: number;
}
export interface Pattern {
  eq: string; muscles: string[]; kf: [Pose, Pose]; bad: Pose; hl?: string; cable?: [number, number]; props?: string;
  setup: string; steps: string[]; avoid: string[]; bad_lbl: string; note?: string;
  /** Front view: both arms and legs drawn at full strength (frontal-plane moves like lateral raises). */
  front?: boolean;
  /** Hanging moves have no floor line. */
  noFloor?: boolean;
  /** Solid bar from a fixed point to the hands (landmine). */
  lever?: [number, number];
}
const FL = {sh:44, th:46, to:58, ua:30, fa:28, nk:20};
const fdir = (a: number): Pt => { const r = a*Math.PI/180; return [Math.sin(r), -Math.cos(r)]; };
const fadd = (o: Pt, a: number, l: number): Pt => { const d = fdir(a); return [o[0]+d[0]*l, o[1]+d[1]*l]; };
function fk(p: Pose): Joints {
  const H: Pt = [0,0];
  const K = fadd(H,p.th,FL.th), A = fadd(K,p.sh,FL.sh);
  const K2 = fadd(H,p.th2!=null?p.th2:p.th,FL.th), A2 = fadd(K2,p.sh2!=null?p.sh2:p.sh,FL.sh);
  const S = fadd(H,p.to,FL.to), Hd = fadd(S,p.to+(p.nk||0),FL.nk);
  const E = fadd(S,p.ua,FL.ua), W = fadd(E,p.fa,FL.fa);
  const E2 = fadd(S,p.ua2!=null?p.ua2:p.ua,FL.ua), W2 = fadd(E2,p.fa2!=null?p.fa2:p.fa,FL.fa);
  const pts: Joints = {H,K,A,K2,A2,S,Hd,E,W,E2,W2};
  const pin = pts[p.pin||"A"], at = p.at || [120,172];
  const dx = at[0]-pin[0], dy = at[1]-pin[1];
  for (const k of Object.keys(pts) as JointKey[]) pts[k] = [pts[k][0]+dx, pts[k][1]+dy];
  return pts;
}
const P1 = (x: number) => Math.round(x*10)/10;
const pt = (q: Pt) => P1(q[0])+","+P1(q[1]);
function figBody(p: Pose, cls: string){
  const P = fk(p);
  const limb = (a: Pt, b: Pt, c: Pt, k: string) => '<polyline class="limb '+k+'" points="'+pt(a)+' '+pt(b)+' '+pt(c)+'"/>';
  const foot = (a: Pt, ang: number, k: string) => { const f = fadd(a, ang, 13); return '<line class="foot '+k+'" x1="'+P1(a[0])+'" y1="'+P1(a[1])+'" x2="'+P1(f[0])+'" y2="'+P1(f[1])+'"/>'; };
  const ft = p.ft != null ? p.ft : (p.sh - 90);
  const ft2 = p.ft2 != null ? p.ft2 : ((p.sh2 != null ? p.sh2 : p.sh) - 90);
  const mid = [(P.H[0]+P.S[0])/2,(P.H[1]+P.S[1])/2];
  const vx = P.S[0]-P.H[0], vy = P.S[1]-P.H[1], vl = Math.hypot(vx,vy)||1;
  const n = [-vy/vl, vx/vl], b = p.bend || 0;
  const cp: Pt = [mid[0]+n[0]*b*2, mid[1]+n[1]*b*2];
  let g = '<g class="'+cls+'">';
  g += limb(P.H,P.K2,P.A2,"far") + foot(P.A2,ft2,"far") + limb(P.S,P.E2,P.W2,"far");
  g += '<path class="torso" d="M'+pt(P.H)+' Q'+pt(cp)+' '+pt(P.S)+'"/>';
  g += limb(P.H,P.K,P.A,"near") + foot(P.A,ft,"near") + limb(P.S,P.E,P.W,"near");
  g += '<circle class="head" cx="'+P1(P.Hd[0])+'" cy="'+P1(P.Hd[1])+'" r="10"/>';
  g += '</g>';
  return {g, P, spine: [(mid[0]+cp[0])/2, (mid[1]+cp[1])/2] as Pt};
}
function figEquip(eq: string, P: Joints, fa: number){
  if (eq === "bar") return '<circle class="plate" cx="'+P1(P.W[0])+'" cy="'+P1(P.W[1])+'" r="16"/><circle class="hub" cx="'+P1(P.W[0])+'" cy="'+P1(P.W[1])+'" r="3.5"/>';
  if (eq === "sled"){
    const ang = fa;
    return '<g transform="translate('+P1(P.A[0])+' '+P1(P.A[1])+') rotate('+P1(ang)+')"><rect class="prop" x="-4" y="-26" width="8" height="40" rx="2"/></g>';
  }
  if (eq === "kb"){
    return '<rect class="db" x="'+P1(P.W[0]-8)+'" y="'+P1(P.W[1]-6)+'" width="16" height="13" rx="4"/>';
  }
  if (eq === "db"){
    const d = (W: Pt, ang: number, k: string) => '<g transform="translate('+P1(W[0])+' '+P1(W[1])+') rotate('+P1(ang)+')"><rect class="db '+k+'" x="-4" y="-10" width="8" height="20" rx="3"/></g>';
    return d(P.W2, fa, "far") + d(P.W, fa, "near");
  }
  return "";
}
function lerpPose(a: Pose, b: Pose, s: number): Pose {
  const o: Record<string, unknown> = {};
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  keys.forEach(k => {
    const x = A[k] != null ? A[k] : B[k], y = B[k] != null ? B[k] : A[k];
    if (Array.isArray(x)) { const yy = y as number[]; o[k] = [x[0]+(yy[0]-x[0])*s, x[1]+(yy[1]-x[1])*s]; }
    else if (typeof x === "number") o[k] = x + ((y as number)-x)*s;
    else o[k] = x;
  });
  return o as unknown as Pose;
}
const BENCH = '<rect class="prop" x="38" y="126" width="112" height="9" rx="3"/><rect class="prop" x="56" y="135" width="8" height="43"/><rect class="prop" x="124" y="135" width="8" height="43"/>';
const SEAT = '<rect class="prop" x="70" y="149" width="62" height="9" rx="3"/><rect class="prop" x="96" y="158" width="8" height="20"/>';
export const PATS: Record<string, Pattern> = {
  squat:{eq:"bar", muscles:["Quads","Glutes","Core"],
    kf:[{pin:"A",at:[108,174],th:180,sh:180,to:0,ua:205,fa:340},{pin:"A",at:[108,174],th:100,sh:208,to:38,ua:220,fa:355,ft:90}],
    bad:{pin:"A",at:[108,174],th:96,sh:212,to:66,bend:-9,ua:245,fa:20,ft:90}, hl:"spine",
    setup:"Feet shoulder-width, toes turned out slightly. Brace your core like you're about to be pushed.",
    steps:["Sit your hips back and down between your heels","Keep your knees tracking over your toes","Drive up through the whole foot with your chest proud"],
    avoid:["Chest collapsing forward and lower back rounding","Heels lifting off the floor"], bad_lbl:"Chest collapses, back rounds"},
  rdl:{eq:"bar", muscles:["Hamstrings","Glutes","Lower back"],
    kf:[{pin:"A",at:[120,174],th:180,sh:180,to:0,ua:180,fa:180},{pin:"A",at:[120,174],th:162,sh:192,to:80,ua:180,fa:180}],
    bad:{pin:"A",at:[120,174],th:132,sh:208,to:82,bend:-12,nk:30,ua:180,fa:180}, hl:"spine",
    setup:"Bar over mid-foot, soft knees, shoulders pulled back and down.",
    steps:["Push your hips back like closing a car door with your bum","Slide the bar down your thighs with a flat back","Stop at a strong hamstring stretch, then squeeze your glutes to stand"],
    avoid:["Rounding the back to reach lower","Bending the knees so it turns into a squat"], bad_lbl:"Rounded back"},
  bench:{eq:"bar", muscles:["Chest","Front shoulders","Triceps"], props:BENCH,
    kf:[{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:0,fa:0},{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:150,fa:8}],
    bad:{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:212,fa:330}, hl:"W",
    setup:"Eyes under the bar, feet flat, shoulder blades squeezed together.",
    steps:["Lower the bar to mid-chest with control","Keep elbows about 45 degrees from your body","Press up and slightly back over your shoulders"],
    avoid:["Bar drifting toward your neck with elbows flared","Bouncing the bar off your chest"], bad_lbl:"Bar drifts high, elbows flare"},
  pushup:{eq:"", muscles:["Chest","Triceps","Core"],
    kf:[{pin:"A",at:[204,174],th:113,sh:113,to:293,ua:178,fa:180,ft:200},{pin:"A",at:[204,174],th:106,sh:106,to:286,ua:125,fa:205,ft:200}],
    bad:{pin:"A",at:[204,174],th:100,sh:100,to:290,bend:-11,ua:128,fa:205,ft:200}, hl:"spine",
    setup:"Hands under your shoulders, body in one straight line from head to heels.",
    steps:["Lower your chest between your hands","Angle your elbows back, not straight out","Push the floor away until your arms are straight"],
    avoid:["Hips sagging toward the floor","Head dropping before your chest"], bad_lbl:"Hips sag"},
  row:{eq:"db", muscles:["Upper back","Lats","Biceps"],
    kf:[{pin:"A",at:[112,174],th:165,sh:195,to:72,ua:180,fa:180},{pin:"A",at:[112,174],th:165,sh:195,to:72,ua:282,fa:175}],
    bad:{pin:"A",at:[112,174],th:172,sh:186,to:30,ua:250,fa:150}, hl:"S",
    setup:"Hinge forward with a flat back, weight hanging under your shoulder.",
    steps:["Pull your elbow back toward your hip","Squeeze your shoulder blade back at the top","Lower slowly until your arm is straight"],
    avoid:["Standing up and using momentum","Shrugging the shoulder up to your ear"], bad_lbl:"Too upright, using momentum"},
  pulldown:{eq:"", cable:[132,8], muscles:["Lats","Upper back","Biceps"], props:SEAT,
    kf:[{pin:"H",at:[96,142],th:88,sh:182,to:350,ua:6,fa:4},{pin:"H",at:[96,142],th:88,sh:182,to:345,ua:172,fa:16}],
    bad:{pin:"H",at:[96,142],th:88,sh:182,to:315,ua:195,fa:40}, hl:"S",
    setup:"Thighs locked under the pad, slight lean back, hands just outside your shoulders.",
    steps:["Pull the bar down to your upper chest","Lead with your elbows, driving them down","Let it rise with control until your arms are long"],
    avoid:["Leaning far back to swing the weight","Pulling the bar behind your neck"], bad_lbl:"Leaning back to swing"},
  press:{eq:"db", muscles:["Shoulders","Triceps","Upper chest"], props:SEAT,
    kf:[{pin:"H",at:[100,142],th:90,sh:180,to:0,ua:140,fa:6},{pin:"H",at:[100,142],th:90,sh:180,to:0,ua:4,fa:2}],
    bad:{pin:"H",at:[100,142],th:90,sh:180,to:338,bend:9,ua:340,fa:345}, hl:"spine",
    setup:"Sit tall with your back against the pad, dumbbells at shoulder height.",
    steps:["Press up and slightly in until your arms are straight","Keep your ribs down and core tight","Lower to ear level with control"],
    avoid:["Arching your lower back to push the weight","Shrugging at the top"], bad_lbl:"Lower back arches"},
  thrust:{eq:"bar", muscles:["Glutes","Hamstrings"], props:'<rect class="prop" x="22" y="139" width="64" height="39" rx="4"/>',
    kf:[{pin:"A",at:[176,174],th:58,sh:178,to:292,ua:120,fa:120},{pin:"A",at:[176,174],th:90,sh:178,to:268,ua:118,fa:118}],
    bad:{pin:"A",at:[176,174],th:98,sh:180,to:256,bend:-10,ua:118,fa:118}, hl:"spine",
    setup:"Upper back on the bench edge, feet flat, shins vertical at the top.",
    steps:["Tuck your chin and keep your ribs down","Drive through your heels until hips line up with knees","Squeeze your glutes for a second, then lower with control"],
    avoid:["Overarching the lower back at the top","Feet too far out so hamstrings take over"], bad_lbl:"Overarched lower back"},
  lunge:{eq:"db", muscles:["Quads","Glutes","Balance"],
    kf:[{pin:"A",at:[150,174],th:162,sh:182,th2:200,sh2:212,to:0,ua:180,fa:180,ft2:150},{pin:"A",at:[150,174],th:100,sh:182,th2:186,sh2:268,to:4,ua:180,fa:180,ft2:205}],
    bad:{pin:"A",at:[150,174],th:112,sh:215,th2:196,sh2:262,to:32,ua:180,fa:180,ft2:205,ft:90}, hl:"K",
    setup:"Long stance, front foot flat, back heel up.",
    steps:["Drop your back knee straight down","Keep your front shin fairly upright","Push through your front heel to rise"],
    avoid:["Front knee shooting far past your toes","Torso folding forward"], bad_lbl:"Knee drifts, torso tips"},
  deadbug:{eq:"", muscles:["Abs","Deep core"],
    kf:[{pin:"H",at:[132,162],th:0,sh:90,th2:0,sh2:90,to:270,ua:2,fa:2,ua2:2,fa2:2,ft:180,ft2:180},{pin:"H",at:[132,162],th:72,sh:80,th2:0,sh2:90,to:270,ua:282,fa:276,ua2:2,fa2:2,ft:170,ft2:180}],
    bad:{pin:"H",at:[132,162],th:86,sh:90,th2:0,sh2:90,to:270,bend:8,ua:282,fa:276,ua2:2,fa2:2,ft:175,ft2:180}, hl:"spine",
    setup:"Lie on your back, arms reaching up, knees stacked over hips at 90 degrees.",
    steps:["Press your lower back gently into the floor","Slowly reach one arm back and the opposite leg out","Return and switch sides, breathing out as you reach"],
    avoid:["Lower back lifting off the floor","Rushing and losing control"], bad_lbl:"Lower back lifts off the floor"},
  curl:{eq:"db", muscles:["Biceps","Forearms"],
    kf:[{pin:"A",at:[120,174],th:180,sh:180,to:0,ua:182,fa:182},{pin:"A",at:[120,174],th:180,sh:180,to:0,ua:182,fa:30}],
    bad:{pin:"A",at:[120,174],th:182,sh:178,to:342,ua:150,fa:20}, hl:"E",
    setup:"Stand tall, elbows by your sides, palms forward.",
    steps:["Curl the weight up without moving your elbows","Squeeze at the top","Lower all the way down slowly"],
    avoid:["Swinging your body to lift the weight","Elbows drifting forward"], bad_lbl:"Swinging the weight"},
  pushdown:{eq:"", cable:[152,8], muscles:["Triceps"],
    kf:[{pin:"A",at:[112,174],th:180,sh:180,to:8,ua:178,fa:70},{pin:"A",at:[112,174],th:180,sh:180,to:8,ua:178,fa:172}],
    bad:{pin:"A",at:[112,174],th:176,sh:184,to:24,ua:140,fa:170}, hl:"E",
    setup:"Elbows pinned to your sides, slight forward lean, soft knees.",
    steps:["Push down until your arms are straight","Pause and squeeze the back of your arms","Let it rise to just above 90 degrees"],
    avoid:["Elbows drifting forward and flaring","Leaning over to push with bodyweight"], bad_lbl:"Elbows drift forward"},
  raise:{eq:"db", muscles:["Side shoulders"], note:"Shown side-on. Raise out to your sides, not to the front.",
    kf:[{pin:"A",at:[120,174],th:180,sh:180,to:0,ua:178,fa:176},{pin:"A",at:[120,174],th:180,sh:180,to:0,ua:92,fa:96}],
    bad:{pin:"A",at:[120,174],th:180,sh:180,to:345,ua:58,fa:62}, hl:"S",
    setup:"Slight bend in the elbows, dumbbells by your thighs.",
    steps:["Raise the weights out to your sides","Stop at shoulder height, leading with your elbows","Lower slowly over 2 to 3 seconds"],
    avoid:["Swinging with your back","Lifting above shoulder height and shrugging"], bad_lbl:"Swinging, going too high"},
  calf:{eq:"", muscles:["Calves"],
    kf:[{pin:"A",at:[120,174],th:180,sh:180,to:0,ua:182,fa:182,ft:90},{pin:"A",at:[120,165],th:180,sh:180,to:0,ua:182,fa:182,ft:142}],
    bad:{pin:"A",at:[120,168],th:162,sh:198,to:8,ua:182,fa:182,ft:120}, hl:"K",
    setup:"Balls of your feet on a step, hold something for balance.",
    steps:["Rise as high as you can onto your toes","Pause at the top","Lower slowly until your heels drop below the step"],
    avoid:["Bouncing at the bottom","Bending your knees to cheat"], bad_lbl:"Knees bending"},
  legext:{eq:"", muscles:["Quads"], props:SEAT,
    kf:[{pin:"H",at:[96,142],th:90,sh:180,to:354,ua:170,fa:150},{pin:"H",at:[96,142],th:90,sh:92,to:354,ua:170,fa:150,ft:0}],
    bad:{pin:"H",at:[96,142],th:84,sh:72,to:328,ua:150,fa:130,ft:340}, hl:"K",
    setup:"Back against the pad, knees lined up with the machine's pivot.",
    steps:["Straighten your legs fully","Squeeze your quads for a second","Lower with control"],
    avoid:["Kicking the weight up with momentum","Lifting your hips off the seat"], bad_lbl:"Leaning back and kicking"}
};
const PULLBAR = '<rect class="prop" x="30" y="16" width="180" height="8" rx="3"/>';
const MAT = '<rect class="prop" x="14" y="171" width="212" height="5" rx="2"/>';
const PAD = '<rect class="prop" x="30" y="125" width="170" height="9" rx="3"/><rect class="prop" x="60" y="134" width="8" height="44"/><rect class="prop" x="160" y="134" width="8" height="44"/>';
const WALL = '<rect class="prop" x="58" y="18" width="12" height="160"/>';
const BOX = '<rect class="prop" x="128" y="158" width="84" height="20" rx="3"/>';
const LOWBOX = '<rect class="prop" x="40" y="134" width="52" height="44" rx="3"/>';
const CHAIR = '<rect class="prop" x="26" y="118" width="68" height="8" rx="2"/><rect class="prop" x="30" y="126" width="6" height="52"/><rect class="prop" x="84" y="126" width="6" height="52"/>';
const TABLE = '<rect class="prop" x="140" y="52" width="94" height="9" rx="2"/><rect class="prop" x="214" y="61" width="7" height="117"/>';
const SLED = '<path class="prop" d="M18 96 L34 88 L76 146 L118 146 L118 154 L64 154 Z"/>';
const FRONT_LEGS = { th: 172, sh: 178, th2: 188, sh2: 182, ft: 120, ft2: 240 };

/** Movements the original 15 figures didn't cover. Angles as above; "front" figures face the viewer. */
const MORE: Record<string, Pattern> = {
  plank:{eq:"", muscles:["Abs","Deep core","Shoulders"], props:MAT,
    kf:[{pin:"A",at:[206,170],th:99,sh:99,to:279,ua:180,fa:270,ft:200},{pin:"A",at:[206,170],th:98,sh:98,to:278,ua:180,fa:270,ft:200}],
    bad:{pin:"A",at:[206,170],th:104,sh:96,to:282,bend:-12,ua:180,fa:270,ft:200}, hl:"spine",
    setup:"Forearms on the floor, elbows under your shoulders, legs straight behind you.",
    steps:["Squeeze your glutes and brace like you're about to be poked","Keep one straight line from head to heels","Breathe slowly and hold for the time on your plan"],
    avoid:["Hips sagging toward the floor","Hips piking up to make it easier"], bad_lbl:"Hips sag"},
  shouldertap:{eq:"", muscles:["Abs","Obliques","Shoulders"],
    kf:[{pin:"A",at:[204,174],th:113,sh:113,to:293,ua:178,fa:180,ft:200},{pin:"A",at:[204,174],th:113,sh:113,to:293,ua:200,fa:40,ua2:178,fa2:180,ft:200}],
    bad:{pin:"A",at:[204,174],th:118,sh:108,to:296,bend:-10,ua:200,fa:40,ua2:178,fa2:180,ft:200}, hl:"spine",
    setup:"High plank, hands under shoulders, feet a little wider than hip-width.",
    steps:["Lift one hand and tap the opposite shoulder","Place it back down and switch sides","Move slowly so your hips stay still"],
    avoid:["Hips rocking side to side","Hips sagging as you tap"], bad_lbl:"Hips sag and rock"},
  kneeraise:{eq:"", muscles:["Lower abs","Hip flexors","Grip"], props:PULLBAR, noFloor:true,
    kf:[{pin:"W",at:[124,20],th:166,sh:232,to:0,ua:0,fa:0,ft:150},{pin:"W",at:[124,20],th:92,sh:178,to:2,ua:0,fa:0,ft:90}],
    bad:{pin:"W",at:[124,20],th:72,sh:140,to:344,ua:350,fa:350,ft:60}, hl:"spine",
    setup:"Hang from a bar with straight arms, shoulders pulled down away from your ears.",
    steps:["Brace your abs and stop any swing","Raise your knees until your thighs pass parallel","Lower slowly without letting your legs swing back"],
    avoid:["Swinging and using momentum","Leaning back to kick the knees up"], bad_lbl:"Swinging the legs up"},
  pullup:{eq:"", muscles:["Lats","Upper back","Biceps"], props:PULLBAR, noFloor:true,
    kf:[{pin:"W",at:[124,20],th:180,sh:250,to:0,ua:360,fa:0,ft:150},{pin:"W",at:[124,20],th:176,sh:250,to:8,ua:204,fa:14,ft:150}],
    bad:{pin:"W",at:[124,20],th:140,sh:210,to:340,ua:300,fa:350,ft:110}, hl:"S",
    setup:"Hands just wider than shoulders, arms straight, knees bent and crossed.",
    steps:["Pull your shoulders down, then drive your elbows toward your ribs","Bring your chin over the bar","Lower all the way until your arms are straight"],
    avoid:["Kicking and swinging to get up","Stopping halfway on every rep"], bad_lbl:"Kipping and half reps"},
  revcrunch:{eq:"", muscles:["Lower abs"], props:MAT,
    kf:[{pin:"S",at:[66,162],th:360,sh:90,to:270,ua:92,fa:92,ft:180},{pin:"S",at:[66,162],th:328,sh:58,to:250,ua:92,fa:92,ft:150}],
    bad:{pin:"S",at:[66,162],th:408,sh:120,to:270,ua:92,fa:92,ft:210}, hl:"H",
    setup:"Lie on your back, arms by your sides, knees bent at 90 degrees above your hips.",
    steps:["Curl your hips off the floor, bringing your knees toward your chest","Pause for a second at the top","Lower your hips slowly back down"],
    avoid:["Swinging your legs instead of curling your hips","Dropping your legs fast on the way down"], bad_lbl:"Legs swing, hips stay down"},
  cablecrunch:{eq:"", cable:[40,6], muscles:["Abs"],
    kf:[{pin:"K",at:[118,172],th:180,sh:270,to:0,bend:0,ua:340,fa:110,ft:180},{pin:"K",at:[118,172],th:178,sh:270,to:118,bend:10,ua:150,fa:240,ft:180}],
    bad:{pin:"K",at:[118,172],th:120,sh:270,to:96,ua:120,fa:230,ft:180}, hl:"H",
    setup:"Kneel facing away from a high cable, rope held beside your head.",
    steps:["Keep your hips still and high","Curl your ribs toward your hips, rounding your back","Return slowly until you feel a stretch in your abs"],
    avoid:["Sitting back on your heels to pull with your bodyweight","Pulling with your arms instead of your abs"], bad_lbl:"Hips sit back, arms pull"},
  hollow:{eq:"", muscles:["Abs","Deep core"], props:MAT,
    kf:[{pin:"H",at:[124,160],th:84,sh:84,to:278,bend:0,ua:280,fa:280,ft:170},{pin:"H",at:[124,160],th:78,sh:78,to:284,bend:0,ua:286,fa:286,ft:165}],
    bad:{pin:"H",at:[124,160],th:92,sh:92,to:272,bend:9,ua:274,fa:274,ft:180}, hl:"spine",
    setup:"Lie on your back, arms overhead, legs straight.",
    steps:["Press your lower back into the floor","Lift your shoulders, arms and legs a few inches","Hold the banana shape and keep breathing"],
    avoid:["Lower back peeling off the floor","Legs so low you lose the back position"], bad_lbl:"Lower back arches"},
  birddog:{eq:"", muscles:["Deep core","Glutes","Lower back"], props:MAT,
    kf:[{pin:"K2",at:[98,168],th:180,sh:270,th2:180,sh2:270,to:84,ua:180,fa:180,ua2:180,fa2:180,ft:180,ft2:180},{pin:"K2",at:[98,168],th:270,sh:270,th2:180,sh2:270,to:84,ua:180,fa:180,ua2:86,fa2:86,ft:180,ft2:180}],
    bad:{pin:"K2",at:[98,168],th:304,sh:304,th2:180,sh2:270,to:86,bend:10,ua:180,fa:180,ua2:70,fa2:70,ft:200,ft2:180}, hl:"spine",
    setup:"On hands and knees, hands under shoulders, knees under hips.",
    steps:["Reach one arm forward and the opposite leg back","Stop when both are level with your body","Return slowly and switch sides"],
    avoid:["Kicking the leg too high so your back arches","Hips twisting open"], bad_lbl:"Leg too high, back arches"},
  superman:{eq:"", muscles:["Lower back","Glutes","Upper back"], props:MAT,
    kf:[{pin:"H",at:[110,164],th:270,sh:270,to:90,ua:90,fa:90,ft:270},{pin:"H",at:[110,164],th:280,sh:280,to:80,ua:76,fa:76,ft:270}],
    bad:{pin:"H",at:[110,164],th:292,sh:292,to:72,nk:-50,bend:-6,ua:66,fa:66,ft:270}, hl:"Hd",
    setup:"Lie face down, arms reaching forward, legs straight.",
    steps:["Squeeze your glutes","Lift your arms, chest and legs a few inches","Hold for a second, then lower with control"],
    avoid:["Cranking your head back to look forward","Lifting so high it pinches your lower back"], bad_lbl:"Neck cranked back"},
  legcurl:{eq:"", muscles:["Hamstrings"], props:PAD,
    kf:[{pin:"H",at:[118,116],th:270,sh:270,to:90,ua:162,fa:120,ft:180},{pin:"H",at:[118,116],th:270,sh:384,to:90,ua:162,fa:120,ft:300}],
    bad:{pin:"H",at:[118,108],th:250,sh:370,to:96,bend:-6,ua:162,fa:120,ft:290}, hl:"H",
    setup:"Lie face down on the machine, the pad just above your heels, knees just off the bench.",
    steps:["Keep your hips pressed into the pad","Curl your heels toward your glutes","Lower slowly until your legs are almost straight"],
    avoid:["Hips lifting off the pad","Swinging the weight up"], bad_lbl:"Hips lift off the pad"},
  legpress:{eq:"sled", muscles:["Quads","Glutes"], props:SLED,
    kf:[{pin:"H",at:[78,140],th:20,sh:118,to:300,ua:150,fa:110,ft:28},{pin:"H",at:[78,140],th:52,sh:52,to:300,ua:150,fa:110,ft:322}],
    bad:{pin:"H",at:[78,132],th:352,sh:110,to:312,bend:-10,ua:150,fa:110,ft:20}, hl:"spine",
    setup:"Back and hips flat on the pad, feet shoulder-width in the middle of the platform.",
    steps:["Lower the platform until your knees reach about 90 degrees","Push through your whole foot","Stop just short of locking your knees"],
    avoid:["Going so deep your hips curl off the pad","Locking your knees out hard at the top"], bad_lbl:"Hips curl up, back rounds"},
  wallsit:{eq:"", muscles:["Quads","Glutes"], props:WALL,
    kf:[{pin:"A",at:[124,174],th:90,sh:180,to:0,ua:160,fa:100,ft:90},{pin:"A",at:[124,174],th:91,sh:179,to:0,ua:160,fa:100,ft:90}],
    bad:{pin:"A",at:[124,174],th:128,sh:172,to:4,ua:160,fa:100,ft:90}, hl:"K",
    setup:"Back flat against a wall, feet about two foot-lengths out.",
    steps:["Slide down until your thighs are parallel to the floor","Keep your knees over your ankles","Hold, breathing steadily"],
    avoid:["Stopping with your hips too high","Pushing on your thighs with your hands"], bad_lbl:"Hips too high"},
  pullover:{eq:"db", muscles:["Lats","Chest"], props:BENCH,
    kf:[{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:362,fa:362},{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:286,fa:282}],
    bad:{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:250,fa:200}, hl:"E",
    setup:"Lie on a bench, both hands holding one dumbbell above your chest, slight bend in the elbows.",
    steps:["Lower the weight back over your head in an arc","Stop when your arms are in line with your body","Pull it back over your chest using your lats"],
    avoid:["Bending your elbows more as you lower","Dropping the weight too far behind your head"], bad_lbl:"Elbows bend, weight drops too far"},
  skullcrusher:{eq:"db", muscles:["Triceps"], props:BENCH,
    kf:[{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:348,fa:348},{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:344,fa:236}],
    bad:{pin:"H",at:[124,118],th:104,sh:178,to:270,ua:300,fa:228}, hl:"E",
    setup:"Lie on a bench, dumbbells held above your chest, arms angled slightly back.",
    steps:["Bend only at the elbows, lowering the weights beside your head","Keep your upper arms still","Straighten your arms to lift back up"],
    avoid:["Elbows drifting back and moving the whole arm","Elbows flaring out wide"], bad_lbl:"Elbows drift back"},
  ohext:{eq:"db", muscles:["Triceps"], props:SEAT,
    kf:[{pin:"H",at:[100,142],th:90,sh:180,to:0,bend:0,ua:352,fa:200},{pin:"H",at:[100,142],th:90,sh:180,to:0,bend:0,ua:354,fa:358}],
    bad:{pin:"H",at:[100,142],th:90,sh:180,to:346,bend:8,ua:36,fa:210}, hl:"E",
    setup:"Sit or stand tall, one dumbbell held overhead with both hands.",
    steps:["Lower the weight behind your head by bending your elbows","Keep your elbows pointing up","Straighten your arms back overhead"],
    avoid:["Elbows flaring forward and out","Arching your lower back"], bad_lbl:"Elbows drift forward, back arches"},
  facepull:{eq:"", cable:[226,52], muscles:["Rear shoulders","Upper back"],
    kf:[{pin:"A",at:[96,174],th:178,sh:182,th2:186,sh2:176,to:356,ua:80,fa:84},{pin:"A",at:[96,174],th:178,sh:182,th2:186,sh2:176,to:356,ua:276,fa:58}],
    bad:{pin:"A",at:[96,174],th:178,sh:182,th2:186,sh2:176,to:338,ua:200,fa:76}, hl:"E",
    setup:"Rope at face height, step back until your arms are straight.",
    steps:["Pull the rope toward your face, elbows high and wide","Pull the ends apart beside your ears","Return slowly"],
    avoid:["Elbows dropping so it turns into a row","Leaning back to move more weight"], bad_lbl:"Elbows drop, leaning back"},
  reardelt:{eq:"db", front:true, muscles:["Rear shoulders","Upper back"], note:"Shown from the front. Hinge forward about 45 degrees with a flat back.",
    kf:[{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:174,fa:176,ua2:186,fa2:184},{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:92,fa:96,ua2:268,fa2:264}],
    bad:{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:60,fa:40,ua2:300,fa2:320}, hl:"S",
    setup:"Hinge forward with a flat back, soft knees, dumbbells hanging under your shoulders.",
    steps:["Raise the weights out to the sides, leading with your elbows","Squeeze your shoulder blades at the top","Lower slowly"],
    avoid:["Swinging the weights up","Shrugging toward your ears"], bad_lbl:"Shrugging and swinging too high"},
  pullapart:{eq:"", front:true, muscles:["Rear shoulders","Upper back"], note:"Shown from the front.",
    kf:[{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:150,fa:262,ua2:210,fa2:98},{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:92,fa:90,ua2:268,fa2:270}],
    bad:{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:56,fa:40,ua2:304,fa2:320}, hl:"S",
    setup:"Hold a band in front of your chest, arms straight, hands shoulder-width.",
    steps:["Pull the band apart by moving your arms out to the sides","Squeeze your shoulder blades together","Return slowly"],
    avoid:["Shrugging your shoulders up","Bending your elbows to cheat"], bad_lbl:"Arms ride up, shoulders shrug"},
  fly:{eq:"", front:true, muscles:["Chest","Front shoulders"], note:"Shown from the front. On the floor, the arm path is the same lying on your back.",
    kf:[{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:72,fa:82,ua2:288,fa2:278},{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:152,fa:212,ua2:208,fa2:148}],
    bad:{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:150,fa:260,ua2:210,fa2:100}, hl:"E",
    setup:"Soft bend in the elbows, arms out wide, chest up.",
    steps:["Bring your hands together in a wide hugging arc","Squeeze your chest when your hands meet","Open back out slowly to a stretch"],
    avoid:["Bending your elbows so it turns into a press","Opening so wide your shoulders hurt"], bad_lbl:"Elbows bend into a press"},
  sidebend:{eq:"db", front:true, muscles:["Obliques"], note:"Shown from the front.",
    kf:[{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:178,fa:180,ua2:182,fa2:180},{...FRONT_LEGS,pin:"A",at:[112,174],to:20,ua:182,fa:180,ua2:186,fa2:180}],
    bad:{...FRONT_LEGS,pin:"A",at:[112,174],th:160,th2:176,to:36,ua:186,fa:180,ua2:190,fa2:180}, hl:"H",
    setup:"Stand tall, dumbbell in one hand, other hand on your hip or head.",
    steps:["Bend sideways toward the weight","Come up by squeezing the opposite side","Finish the set, then switch hands"],
    avoid:["Leaning forward or back instead of straight to the side","Hips sliding out to make room"], bad_lbl:"Hips slide out"},
  raisefront:{eq:"db", front:true, muscles:["Side shoulders"], note:"Shown from the front.",
    kf:[{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:172,fa:174,ua2:188,fa2:186},{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:92,fa:100,ua2:268,fa2:260}],
    bad:{...FRONT_LEGS,pin:"A",at:[112,174],to:0,ua:50,fa:44,ua2:310,fa2:316}, hl:"S",
    setup:"Slight bend in the elbows, dumbbells by your thighs.",
    steps:["Raise the weights out to your sides","Stop at shoulder height, leading with your elbows","Lower slowly over 2 to 3 seconds"],
    avoid:["Swinging with your back","Lifting above shoulder height and shrugging"], bad_lbl:"Too high, shrugging"},
  pallof:{eq:"", muscles:["Obliques","Deep core"], note:"The cable pulls from your side. Your job is to not let it twist you.",
    kf:[{pin:"A",at:[100,174],th:176,sh:184,th2:184,sh2:176,to:0,ua:170,fa:30},{pin:"A",at:[100,174],th:176,sh:184,th2:184,sh2:176,to:0,ua:90,fa:90}],
    bad:{pin:"A",at:[100,174],th:176,sh:184,th2:184,sh2:176,to:345,bend:7,ua:70,fa:66}, hl:"spine",
    setup:"Stand side-on to a cable at chest height, handle held at your chest.",
    steps:["Brace your core and press the handle straight out","Hold for 2 seconds without letting your body turn","Bring it back to your chest"],
    avoid:["Letting the cable twist your torso","Leaning away to fight it"], bad_lbl:"Leaning and twisting"},
  stepup:{eq:"db", muscles:["Quads","Glutes"], props:BOX,
    kf:[{pin:"A",at:[150,156],th:140,sh:186,th2:204,sh2:186,to:8,ua:180,fa:180,ft:90},{pin:"A",at:[150,156],th:180,sh:180,th2:170,sh2:200,to:0,ua:180,fa:180,ft:90}],
    bad:{pin:"A",at:[150,156],th:126,sh:160,th2:212,sh2:190,to:34,ua:180,fa:180,ft:90}, hl:"K",
    setup:"Stand facing a box or sturdy step, one whole foot on top.",
    steps:["Drive through your top heel to stand up on the box","Bring the other foot up to meet it","Step down slowly with the same leg and repeat"],
    avoid:["Pushing off your bottom foot","Folding forward over your knee"], bad_lbl:"Pushing off the back foot, folding forward"},
  landmine:{eq:"", lever:[16,176], muscles:["Shoulders","Upper chest","Core"],
    kf:[{pin:"A",at:[130,174],th:170,sh:190,th2:194,sh2:176,to:10,ua:168,fa:18},{pin:"A",at:[130,174],th:170,sh:190,th2:194,sh2:176,to:14,ua:56,fa:54}],
    bad:{pin:"A",at:[130,174],th:170,sh:190,th2:194,sh2:176,to:350,bend:8,ua:30,fa:30}, hl:"spine",
    setup:"Hold the end of the bar at your shoulder, staggered stance, slight forward lean.",
    steps:["Press the bar up and forward until your arm is straight","Keep your ribs down","Lower back to your shoulder with control"],
    avoid:["Leaning back to push the bar","Shrugging at the top"], bad_lbl:"Leaning back"},
  goblet:{eq:"kb", muscles:["Quads","Glutes","Core"],
    kf:[{pin:"A",at:[108,174],th:180,sh:180,to:0,ua:160,fa:20},{pin:"A",at:[108,174],th:100,sh:208,to:30,ua:176,fa:36,ft:90}],
    bad:{pin:"A",at:[108,174],th:96,sh:212,to:62,bend:-9,ua:200,fa:80,ft:90}, hl:"spine",
    setup:"Hold one dumbbell upright against your chest, feet shoulder-width.",
    steps:["Sit down between your heels, elbows inside your knees","Keep the weight close and your chest up","Stand by pushing the floor away"],
    avoid:["Chest dropping and back rounding","Heels lifting"], bad_lbl:"Chest drops, back rounds"},
  bwsquat:{eq:"", muscles:["Quads","Glutes"],
    kf:[{pin:"A",at:[108,174],th:180,sh:180,to:0,ua:180,fa:180},{pin:"A",at:[108,174],th:100,sh:208,to:34,ua:88,fa:90,ft:90}],
    bad:{pin:"A",at:[108,174],th:96,sh:212,to:64,bend:-9,ua:120,fa:130,ft:90}, hl:"spine",
    setup:"Feet shoulder-width, toes slightly out, arms ready to reach forward.",
    steps:["Take 3 seconds to sit down between your heels","Reach your arms forward to balance","Stand up in 1 second"],
    avoid:["Rushing the lowering","Chest collapsing forward"], bad_lbl:"Chest collapses"},
  boxsquat:{eq:"bar", muscles:["Quads","Glutes"], props:LOWBOX,
    kf:[{pin:"A",at:[112,174],th:180,sh:180,to:0,ua:205,fa:340},{pin:"A",at:[112,174],th:96,sh:196,to:30,ua:220,fa:355,ft:90}],
    bad:{pin:"A",at:[112,174],th:88,sh:196,to:58,bend:-9,ua:245,fa:20,ft:90}, hl:"spine",
    setup:"Box or bench just behind you, feet shoulder-width.",
    steps:["Sit back until you lightly touch the box","Keep tension, don't relax onto it","Drive up through your whole foot"],
    avoid:["Dropping onto the box","Rocking forward to stand"], bad_lbl:"Rocking forward off the box"},
  slrdl:{eq:"db", muscles:["Hamstrings","Glutes","Balance"],
    kf:[{pin:"A",at:[126,174],th:180,sh:180,th2:186,sh2:186,to:0,ua:180,fa:180},{pin:"A",at:[126,174],th:170,sh:186,th2:262,sh2:262,to:82,ua:180,fa:180,ft2:170}],
    bad:{pin:"A",at:[126,174],th:150,sh:200,th2:240,sh2:250,to:96,bend:-12,nk:30,ua:180,fa:180,ft2:170}, hl:"spine",
    setup:"Stand on one leg, soft knee, weights hanging in front.",
    steps:["Hinge forward while your back leg rises behind you","Keep your hips square to the floor","Stand up by squeezing the glute of the standing leg"],
    avoid:["Back rounding to reach lower","Hips twisting open"], bad_lbl:"Back rounds"},
  invrow:{eq:"", muscles:["Upper back","Lats","Biceps"], props:TABLE,
    kf:[{pin:"A",at:[36,172],th:248,sh:248,to:68,ua:28,fa:28,ft:180},{pin:"A",at:[36,172],th:236,sh:236,to:56,ua:300,fa:40,ft:180}],
    bad:{pin:"A",at:[36,172],th:236,sh:258,to:66,bend:-12,ua:330,fa:30,ft:180}, hl:"spine",
    setup:"Lie under a sturdy table, hands on the edge, heels on the floor, body straight.",
    steps:["Pull your chest up to the table edge","Squeeze your shoulder blades together","Lower until your arms are straight"],
    avoid:["Hips sagging","Pushing with your legs"], bad_lbl:"Hips sag"},
  cablerow:{eq:"", cable:[226,138], muscles:["Upper back","Lats","Biceps"], props:SEAT,
    kf:[{pin:"H",at:[84,142],th:86,sh:118,to:4,ua:92,fa:92,ft:40},{pin:"H",at:[84,142],th:86,sh:118,to:0,ua:196,fa:92,ft:40}],
    bad:{pin:"H",at:[84,142],th:86,sh:118,to:332,ua:212,fa:100,ft:40}, hl:"spine",
    setup:"Sit tall, slight bend in the knees, arms straight toward the cable.",
    steps:["Pull the handle to your lower ribs","Drive your elbows back and squeeze your shoulder blades","Let your arms go long again without rounding forward"],
    avoid:["Leaning far back to move the weight","Rounding your back at the start"], bad_lbl:"Leaning back"},
  chestpress:{eq:"", muscles:["Chest","Front shoulders","Triceps"], props:SEAT+'<rect class="prop" x="66" y="58" width="9" height="86" rx="3"/>',
    kf:[{pin:"H",at:[86,142],th:90,sh:180,to:0,ua:216,fa:84},{pin:"H",at:[86,142],th:90,sh:180,to:0,ua:90,fa:90}],
    bad:{pin:"H",at:[86,142],th:90,sh:180,to:20,ua:100,fa:94}, hl:"spine",
    setup:"Sit with your back flat on the pad, handles at mid-chest height.",
    steps:["Press the handles straight out","Stop just before your elbows lock","Bring them back slowly until your hands reach your chest"],
    avoid:["Back coming off the pad","Shoulders rolling forward at the end"], bad_lbl:"Back comes off the pad"},
  bridge:{eq:"", muscles:["Glutes","Hamstrings"], props:MAT,
    kf:[{pin:"A",at:[164,170],th:62,sh:166,to:270,ua:92,fa:92,ft:90},{pin:"A",at:[164,170],th:84,sh:166,to:252,ua:110,fa:100,ft:90}],
    bad:{pin:"A",at:[164,170],th:96,sh:166,to:242,bend:-9,ua:112,fa:100,ft:90}, hl:"spine",
    setup:"Lie on your back, knees bent, feet flat and hip-width apart.",
    steps:["Push through your heels and lift your hips","Squeeze your glutes until your body is straight from shoulders to knees","Lower slowly"],
    avoid:["Arching your lower back at the top","Pushing through your toes"], bad_lbl:"Lower back arches"},
  pike:{eq:"", muscles:["Shoulders","Triceps"],
    kf:[{pin:"A",at:[186,174],th:146,sh:146,to:214,ua:182,fa:180,ft:200},{pin:"A",at:[186,174],th:150,sh:150,to:222,ua:226,fa:150,ft:200}],
    bad:{pin:"A",at:[186,174],th:118,sh:118,to:252,ua:240,fa:150,ft:200}, hl:"H",
    setup:"Hands and feet on the floor, hips high in an upside-down V.",
    steps:["Bend your elbows and lower the top of your head toward the floor","Keep your hips high","Push back up until your arms are straight"],
    avoid:["Hips dropping so it turns into a push-up","Elbows flaring straight out"], bad_lbl:"Hips drop"},
  chairdip:{eq:"", muscles:["Triceps","Chest"], props:CHAIR,
    kf:[{pin:"W",at:[90,116],th:120,sh:146,to:0,ua:180,fa:180,ft:120},{pin:"W",at:[90,116],th:104,sh:158,to:2,ua:214,fa:150,ft:110}],
    bad:{pin:"W",at:[90,116],th:96,sh:164,to:22,ua:244,fa:140,ft:110}, hl:"S",
    setup:"Hands on the edge of a sturdy chair behind you, legs out in front.",
    steps:["Bend your elbows to lower your hips straight down","Stop when your upper arms are about level with the floor","Press back up"],
    avoid:["Going so deep your shoulders roll forward","Elbows flaring out wide"], bad_lbl:"Too deep, shoulders roll forward"},
};
Object.assign(PATS, MORE);

/**
 * Which figure illustrates each exercise the plan can generate. Named
 * explicitly so a movement is never shown with a figure from a different
 * exercise; anything not listed gets the text guide only.
 */
const FIG_BY_NAME: Record<string, string> = {
  "Back squat": "squat", "Leg press": "legpress", "Leg press, short range": "legpress", "Goblet squat": "goblet",
  "Tempo bodyweight squat": "bwsquat", "Box squat to bench": "boxsquat", "Box squat to chair": "boxsquat", "Wall sit": "wallsit",
  "Romanian deadlift": "rdl", "DB Romanian deadlift": "rdl", "Single-leg RDL": "slrdl",
  "Bench press": "bench", "DB bench press": "bench", "Incline DB press": "bench", "Neutral-grip DB press": "bench",
  "Machine chest press": "chestpress", "Band chest press": "chestpress", "Cable fly": "fly", "DB floor fly": "fly",
  "Push-up": "pushup", "Push-up on fists or handles": "pushup", "Close-grip push-up": "pushup", "Diamond push-up": "pushup",
  "Incline push-up": "pushup", "Incline push-up on handles": "pushup", "Decline push-up": "pushup", "Pike push-up": "pike", "Chair dip": "chairdip",
  "One-arm DB row": "row", "Barbell row": "row", "Chest-supported DB row": "row", "Chest-supported row": "row",
  "Seated cable row": "cablerow", "Band row": "cablerow", "Inverted table row": "invrow",
  "Lat pulldown": "pulldown", "Neutral-grip pulldown": "pulldown", "Pull-up or assisted pull-up": "pullup", "DB pullover": "pullover",
  "Face pull": "facepull", "Band face pull": "facepull", "Rear-delt fly": "reardelt", "Rear-delt raise": "reardelt",
  "Band pull-apart": "pullapart", "Superman hold": "superman",
  "Overhead press": "press", "DB shoulder press": "press", "Seated DB shoulder press": "press", "High-incline DB press": "press", "Landmine press": "landmine",
  "DB lateral raise": "raisefront", "Cable lateral raise": "raisefront",
  "Hip thrust": "thrust", "DB hip thrust": "thrust", "Glute bridge": "bridge", "Single-leg glute bridge": "bridge",
  "Walking lunge": "lunge", "Reverse lunge": "lunge", "Split squat": "lunge", "Bulgarian split squat": "lunge", "Step-up": "stepup",
  "Leg extension": "legext", "Lying leg curl": "legcurl",
  "Calf raise": "calf", "Standing calf raise": "calf", "Single-leg calf raise": "calf",
  "DB curl": "curl", "EZ-bar curl": "curl", "Hammer curl": "curl", "Light hammer curl": "curl", "Band curl": "curl",
  "Rope pushdown": "pushdown", "Band pushdown": "pushdown", "DB skull crusher": "skullcrusher", "Overhead triceps extension": "ohext",
  "Dead bug": "deadbug", "Plank": "plank", "Forearm plank": "plank", "Plank shoulder tap": "shouldertap", "Hollow hold": "hollow",
  "Bird dog": "birddog", "Reverse crunch": "revcrunch", "Cable crunch": "cablecrunch", "Hanging knee raise": "kneeraise",
  "Pallof press": "pallof", "Side bend": "sidebend",
};

/** Figure key for an exercise name, or null when there is no faithful illustration. */
const FIG_LOWER = new Map(Object.entries(FIG_BY_NAME).map(([n, k]) => [n.toLowerCase(), k]));
export function figureFor(name: string): string | null {
  // Case-insensitive: MVP 1's exercise library spells some names differently ("Leg Press").
  const k = FIG_LOWER.get(name.trim().toLowerCase());
  return k && PATS[k] ? k : null;
}

const PAT_MAP: [RegExp, string][] = [
  [/dead bug|crunch|knee raise|hollow|pallof|plank|bird dog|side bend/i,"deadbug"],[/thrust|bridge/i,"thrust"],
  [/lunge|split squat|step-up/i,"lunge"],[/calf/i,"calf"],[/leg extension|leg curl/i,"legext"],
  [/romanian|rdl|deadlift|good morning/i,"rdl"],[/squat|leg press|wall sit/i,"squat"],[/push-up|dip/i,"pushup"],
  [/pulldown|pull-up|pullover/i,"pulldown"],[/row|face pull|rear-delt|pull-apart|superman/i,"row"],
  [/shoulder press|overhead press|landmine|pike|high-incline/i,"press"],[/curl/i,"curl"],
  [/pushdown|skull|triceps|extension/i,"pushdown"],[/lateral|raise/i,"raise"],[/bench|chest press|db press|fly|incline/i,"bench"]
];
/** Figure for any exercise name: the exact table first, then broad matching for custom exercises. */
export function patOf(name: string): string | null {
  const exact = figureFor(name);
  if (exact) return exact;
  for (const [re,k] of PAT_MAP) if (re.test(name)) return k;
  return null;
}
export function drawFig(key: string, mode: FigMode, s: number): string {
  const pat = PATS[key]; if (!pat) return "";
  const a = pat.kf[0], b = mode === "bad" ? pat.bad : pat.kf[1];
  const pose = lerpPose(a, b, s);
  let g = (pat.noFloor ? "" : '<line class="floor" x1="8" x2="232" y1="178" y2="178"/>') + (pat.props || "");
  if (mode === "bad"){ const gp = lerpPose(a, pat.kf[1], s); g += figBody(gp, "fig-ghost").g; }
  const f = figBody(pose, "fig-main");
  if (pat.lever) g += '<line class="lever" x1="'+pat.lever[0]+'" y1="'+pat.lever[1]+'" x2="'+P1(f.P.W[0])+'" y2="'+P1(f.P.W[1])+'"/>';
  if (pat.cable) g += '<line class="cable" x1="'+pat.cable[0]+'" y1="'+pat.cable[1]+'" x2="'+P1(f.P.W[0])+'" y2="'+P1(f.P.W[1])+'"/><circle class="prop" cx="'+pat.cable[0]+'" cy="'+pat.cable[1]+'" r="6"/>';
  g += f.g + figEquip(pat.eq, f.P, pat.eq === "sled" ? (pose.sh - 90) : pose.fa);
  if (mode === "bad" && pat.hl){ const c = pat.hl === "spine" ? f.spine : f.P[pat.hl as JointKey]; g += '<circle class="hl" cx="'+P1(c[0])+'" cy="'+P1(c[1])+'" r="19"/>'; }
  return g;
}
/* ---------- Body-type figures (front view, parametric) ---------- */
const BODY: Record<"m" | "f", Record<string, number[]>> = {
  m:{sh:[22,22,22.5,23.5,24.5], ch:[20.5,20.5,21.5,23,25], wa:[14,15.5,18,21.5,25], be:[0,1,3,6,9], hi:[16.5,17,18.5,20.5,22.5], th:[8.5,9,10,11.5,13], ar:[5.5,5.8,6.3,7.2,8.2], nk:[6,6,6.5,7.2,8]},
  f:{sh:[19,19,19.5,20.5,21.5], ch:[17.5,18,19.5,21,23], wa:[12,13.5,15.5,19,22.5], be:[0,0.5,2,4.5,7.5], hi:[20,21,22.5,24.5,27], th:[9.5,10,11,12.5,14], ar:[4.8,5.2,5.8,6.7,7.6], nk:[5,5,5.4,6,6.8]}
};
function smoothClosed(pts: Pt[]){
  const n = pts.length; let d = "M"+pt(pts[0]);
  for (let i=0;i<n;i++){
    const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
    const c1: Pt = [p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6], c2: Pt = [p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6];
    d += " C"+pt(c1)+" "+pt(c2)+" "+pt(p2);
  }
  return d+"Z";
}
export function bodyFig(level: number, sex: string): string {
  const B = BODY[sex==="f"?"f":"m"], X = 50;
  const v = (k: string) => B[k][level];
  const s = v("sh"), c = v("ch"), w = v("wa"), be = v("be"), h = v("hi"), t = v("th"), a = v("ar"), nk = v("nk");
  const R = (x: number, y: number): Pt => [X+x,y], Lf = (x: number, y: number): Pt => [X-x,y];
  const half = [[nk,30],[s,42],[c,58],[c+be*0.35,70],[w+be,84],[w+be*0.55,96],[h,108],[h+0.4,121]];
  const torso: Pt[] = half.map(q=>R(q[0],q[1])).concat([[X,124] as Pt]).concat(half.slice().reverse().map(q=>Lf(q[0],q[1])));
  const lc = h*0.52;
  const leg = (sgn: number): Pt[] => { const P = (x: number, y: number): Pt => [X+sgn*x,y]; return [P(h,114),P(lc+t*0.62,134),P(lc+t*0.45,152),P(lc+t*0.5,163),P(lc+3.2,180),P(lc-2.8,181),P(lc-t*0.38,164),P(lc-t*0.36,152),P(1.6,130),P(0.8,121)]; };
  const ax = Math.max(0, (w+be+1.5) - (s - a*0.45));
  const arm = (sgn: number): Pt[] => { const P = (x: number, y: number): Pt => [X+sgn*(x+ax*Math.min(1,(y-48)/36>0?(y-48)/36:0)),y]; return [P(s-2,41),P(s+a*0.62,58),P(s+a*0.55+1.5,82),P(s+a*0.42+2.5,102),P(s+3.2,116),P(s+0.8,123),P(s-1.8,116),P(s-a*0.45+0.5,84),P(c-0.8,57)]; };
  const id = "bc"+sex+level;
  let g = '<svg class="bodysvg" viewBox="0 0 100 188" role="img" aria-label="Body shape illustration"><defs><clipPath id="'+id+'"><path d="'+smoothClosed(torso)+'"/><path d="'+smoothClosed(leg(1))+'"/><path d="'+smoothClosed(leg(-1))+'"/></clipPath></defs>';
  g += '<path class="b-skin" d="'+smoothClosed(leg(1))+'"/><path class="b-skin" d="'+smoothClosed(leg(-1))+'"/>';
  g += '<path class="b-skin" d="'+smoothClosed(torso)+'"/>';
  g += '<g clip-path="url(#'+id+')"><rect class="b-short" x="0" y="'+(sex==="f"?106:105)+'" width="100" height="'+(sex==="f"?24:28)+'"/>'+(sex==="f"?'<rect class="b-short" x="0" y="52" width="100" height="'+(15+level*0.8)+'"/>':"")+'</g>';
  g += '<path class="b-skin" d="'+smoothClosed(arm(1))+'"/><path class="b-skin" d="'+smoothClosed(arm(-1))+'"/>';
  g += '<rect class="b-skin" x="'+(X-nk+1)+'" y="22" width="'+(2*nk-2)+'" height="12" rx="3"/>';
  g += '<ellipse class="b-skin" cx="'+X+'" cy="16" rx="'+(9.5+level*0.4)+'" ry="'+(11+level*0.25)+'"/>';
  if (level <= 1){
    const o = level===0 ? 0.55 : 0.32;
    g += '<g class="b-def" style="opacity:'+o+'"><path d="M50 66 V98"/>'+(sex==="m"?'<path d="M44 74 H56 M44.5 83 H55.5 M45 91 H55"/><path d="M38 56 Q50 61 62 56"/>':'<path d="M45 86 Q50 88 55 86"/>')+'</g>';
  }
  return g + '</svg>';
}
