export interface Point {
    x: number;
    y: number;
}

// Pure orientation-sensitive $1 Unistroke Recognizer.
// The rotation step is intentionally omitted so the absolute stroke direction
// is preserved and naturally disambiguates symbols like / vs \ vs | vs -.
const NUM_RESAMPLE_POINTS = 64;
const NORMALIZE_SQUARE_SIZE = 200;
const MAX_PATH_DISTANCE = 0.5 * Math.sqrt(2 * NORMALIZE_SQUARE_SIZE * NORMALIZE_SQUARE_SIZE);
const MIN_SCORE = 0.64;

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: Point[]): Point {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

function pathLength(points: Point[]): number {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += distance(points[i - 1], points[i]);
    return d;
}

function boundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function resample(points: Point[], n: number): Point[] {
    if (points.length === 0) return [];
    if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));

    const I = pathLength(points) / (n - 1);
    if (I <= 0) return Array.from({ length: n }, () => ({ ...points[0] }));

    const out: Point[] = [{ ...points[0] }];
    let D = 0;
    let prev = { ...points[0] };

    for (let i = 1; i < points.length; i++) {
        const curr = points[i];
        let seg = distance(prev, curr);
        if (seg === 0) continue;

        while (D + seg >= I) {
            const t = (I - D) / seg;
            const q = {
                x: prev.x + t * (curr.x - prev.x),
                y: prev.y + t * (curr.y - prev.y),
            };
            out.push(q);
            prev = q;
            seg = distance(prev, curr);
            D = 0;
        }
        D += seg;
        prev = curr;
    }

    const last = points[points.length - 1];
    while (out.length < n) out.push({ ...last });
    if (out.length > n) return out.slice(0, n);
    return out;
}

function scaleToSquare(points: Point[], size: number): Point[] {
    const b = boundingBox(points);
    const maxDim = Math.max(b.width, b.height, 0.0001);
    const s = size / maxDim;
    return points.map((p) => ({ x: p.x * s, y: p.y * s }));
}

function translateToOrigin(points: Point[]): Point[] {
    const c = centroid(points);
    return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

// Orientation-sensitive normalization: resample → scale → center.
// The rotation step from standard $1 is intentionally absent.
function normalizePath(points: Point[]): Point[] {
    const r = resample(points, NUM_RESAMPLE_POINTS);
    const scaled = scaleToSquare(r, NORMALIZE_SQUARE_SIZE);
    return translateToOrigin(scaled);
}

function pathDistance(a: Point[], b: Point[]): number {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += distance(a[i], b[i]);
    return d / a.length;
}

type Template = { label: string; points: Point[] };

function makeTemplate(label: string, rawPoints: Point[]): Template {
    return { label, points: normalizePath(rawPoints) };
}

function makeCircle(count: number, clockwise: boolean, startAngle = 0): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i <= count; i++) {
        const a = clockwise
            ? startAngle + (i / count) * Math.PI * 2
            : startAngle - (i / count) * Math.PI * 2;
        pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return pts;
}

function makeOval(count: number, clockwise: boolean, startAngle: number, rx: number, ry: number): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i <= count; i++) {
        const a = clockwise
            ? startAngle + (i / count) * Math.PI * 2
            : startAngle - (i / count) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
    }
    return pts;
}

// Closed-shape helper: repeat the start point at the end.
function closed(pts: Point[]): Point[] {
    return [...pts, pts[0]];
}

// Named vertices for readability.
const TOP: Point = { x: 0, y: -1 };
const BR: Point = { x: 0.95, y: 0.8 };
const BL: Point = { x: -0.95, y: 0.8 };
const TL: Point = { x: -1, y: -1 };
const TR: Point = { x: 1, y: -1 };
const SBR: Point = { x: 1, y: 1 };
const SBL: Point = { x: -1, y: 1 };

// All templates are pre-normalized at module init.
// Each open-stroke symbol appears in BOTH draw directions.
// Each closed shape appears starting from every vertex in both winding orders.
const TEMPLATES: Template[] = [
    // ── Vertical Line ──────────────────────────────────────────
    makeTemplate("Vertical Line", [{ x: 0, y: -1 }, { x: 0, y: 1 }]),   // top → bottom
    makeTemplate("Vertical Line", [{ x: 0, y: 1 }, { x: 0, y: -1 }]),   // bottom → top

    // ── Horizontal Line ───────────────────────────────────────
    makeTemplate("Horizontal Line", [{ x: -1, y: 0 }, { x: 1, y: 0 }]), // left → right
    makeTemplate("Horizontal Line", [{ x: 1, y: 0 }, { x: -1, y: 0 }]), // right → left

    // ── Forward slash / ───────────────────────────────────────
    makeTemplate("/", [{ x: -1, y: 1 }, { x: 1, y: -1 }]),              // bottom-left → top-right
    makeTemplate("/", [{ x: 1, y: -1 }, { x: -1, y: 1 }]),              // top-right → bottom-left

    // ── Backslash \ ───────────────────────────────────────────
    makeTemplate("\\", [{ x: -1, y: -1 }, { x: 1, y: 1 }]),             // top-left → bottom-right
    makeTemplate("\\", [{ x: 1, y: 1 }, { x: -1, y: -1 }]),             // bottom-right → top-left

    // ── V shape ───────────────────────────────────────────────
    makeTemplate("V", [{ x: -1, y: -0.8 }, { x: 0, y: 1 }, { x: 1, y: -0.8 }]),  // left → bottom → right
    makeTemplate("V", [{ x: 1, y: -0.8 }, { x: 0, y: 1 }, { x: -1, y: -0.8 }]),  // right → bottom → left

    // ── Triangle — 3 start vertices × 2 winding orders ────────
    makeTemplate("Triangle", closed([TOP, BR, BL])),    // CW  from top
    makeTemplate("Triangle", closed([TOP, BL, BR])),    // CCW from top
    makeTemplate("Triangle", closed([BR, BL, TOP])),    // CW  from bottom-right
    makeTemplate("Triangle", closed([BR, TOP, BL])),    // CCW from bottom-right
    makeTemplate("Triangle", closed([BL, TOP, BR])),    // CW  from bottom-left
    makeTemplate("Triangle", closed([BL, BR, TOP])),    // CCW from bottom-left
    // Open-path variants for users who don't fully close their triangle
    makeTemplate("Triangle", [TOP, BR, BL]),
    makeTemplate("Triangle", [TOP, BL, BR]),
    makeTemplate("Triangle", [BR, BL, TOP]),
    makeTemplate("Triangle", [BL, BR, TOP]),

    // ── Square — 4 start vertices × 2 winding orders ──────────
    makeTemplate("Square", closed([TL, TR, SBR, SBL])),   // CW  from TL
    makeTemplate("Square", closed([TL, SBL, SBR, TR])),   // CCW from TL
    makeTemplate("Square", closed([TR, SBR, SBL, TL])),   // CW  from TR
    makeTemplate("Square", closed([TR, TL, SBL, SBR])),   // CCW from TR
    makeTemplate("Square", closed([SBR, SBL, TL, TR])),   // CW  from BR
    makeTemplate("Square", closed([SBR, TR, TL, SBL])),   // CCW from BR
    makeTemplate("Square", closed([SBL, TL, TR, SBR])),   // CW  from BL
    makeTemplate("Square", closed([SBL, SBR, TR, TL])),   // CCW from BL

    // ── Circle — 4 starting points × 2 directions × 3 aspect ratios ──
    // Perfect circle
    makeTemplate("Circle", makeCircle(48, true,  -Math.PI / 2)),  // CW  from top
    makeTemplate("Circle", makeCircle(48, true,   0)),             // CW  from right
    makeTemplate("Circle", makeCircle(48, true,   Math.PI / 2)),  // CW  from bottom
    makeTemplate("Circle", makeCircle(48, true,   Math.PI)),      // CW  from left
    makeTemplate("Circle", makeCircle(48, false, -Math.PI / 2)),  // CCW from top
    makeTemplate("Circle", makeCircle(48, false,  0)),             // CCW from right
    makeTemplate("Circle", makeCircle(48, false,  Math.PI / 2)),  // CCW from bottom
    makeTemplate("Circle", makeCircle(48, false,  Math.PI)),      // CCW from left
    // Wide oval (catches left-right squashed circles)
    makeTemplate("Circle", makeOval(48, true,  -Math.PI / 2, 1.8, 1.0)),
    makeTemplate("Circle", makeOval(48, true,   0,            1.8, 1.0)),
    makeTemplate("Circle", makeOval(48, false, -Math.PI / 2, 1.8, 1.0)),
    makeTemplate("Circle", makeOval(48, false,  0,            1.8, 1.0)),
    // Tall oval (catches top-bottom squashed circles)
    makeTemplate("Circle", makeOval(48, true,  -Math.PI / 2, 1.0, 1.8)),
    makeTemplate("Circle", makeOval(48, true,   0,            1.0, 1.8)),
    makeTemplate("Circle", makeOval(48, false, -Math.PI / 2, 1.0, 1.8)),
    makeTemplate("Circle", makeOval(48, false,  0,            1.0, 1.8)),
];

export function detectShape(points: Point[]): string {
    if (points.length < 5) return "none";

    const b = boundingBox(points);
    if (b.width < 12 && b.height < 12) return "none";

    const candidate = normalizePath(points);

    let bestLabel = "none";
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const template of TEMPLATES) {
        const d = pathDistance(candidate, template.points);
        if (d < bestDistance) {
            bestDistance = d;
            bestLabel = template.label;
        }
    }

    const score = 1 - bestDistance / MAX_PATH_DISTANCE;
    return score >= MIN_SCORE ? bestLabel : "none";
}
