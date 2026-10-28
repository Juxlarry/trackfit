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
const PAT_MAP: [RegExp, string][] = [
  [/dead bug|crunch|knee raise|hollow|pallof|plank|bird dog|side bend/i,"deadbug"],[/thrust|bridge/i,"thrust"],
  [/lunge|split squat|step-up/i,"lunge"],[/calf/i,"calf"],[/leg extension|leg curl/i,"legext"],
  [/romanian|rdl|deadlift|good morning/i,"rdl"],[/squat|leg press|wall sit/i,"squat"],[/push-up|dip/i,"pushup"],
  [/pulldown|pull-up|pullover/i,"pulldown"],[/row|face pull|rear-delt|pull-apart|superman/i,"row"],
  [/shoulder press|overhead press|landmine|pike|high-incline/i,"press"],[/curl/i,"curl"],
  [/pushdown|skull|triceps|extension/i,"pushdown"],[/lateral|raise/i,"raise"],[/bench|chest press|db press|fly|incline/i,"bench"]
];
export function patOf(name: string): string | null { for (const [re,k] of PAT_MAP) if (re.test(name)) return k; return null; }
export function drawFig(key: string, mode: FigMode, s: number): string {
  const pat = PATS[key]; if (!pat) return "";
  const a = pat.kf[0], b = mode === "bad" ? pat.bad : pat.kf[1];
  const pose = lerpPose(a, b, s);
  let g = '<line class="floor" x1="8" x2="232" y1="178" y2="178"/>' + (pat.props || "");
  if (mode === "bad"){ const gp = lerpPose(a, pat.kf[1], s); g += figBody(gp, "fig-ghost").g; }
  const f = figBody(pose, "fig-main");
  if (pat.cable) g += '<line class="cable" x1="'+pat.cable[0]+'" y1="'+pat.cable[1]+'" x2="'+P1(f.P.W[0])+'" y2="'+P1(f.P.W[1])+'"/><circle class="prop" cx="'+pat.cable[0]+'" cy="'+pat.cable[1]+'" r="6"/>';
  g += f.g + figEquip(pat.eq, f.P, pose.fa);
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
