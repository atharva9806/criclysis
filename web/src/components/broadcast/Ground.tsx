/**
 * A floodlit ground at night, drawn in SVG: floodlight towers and their
 * glow, the stands with a crowd texture, the oval outfield with mowing
 * stripes, the rope, the 30-yard circle and the pitch. Decoration only
 * (aria-hidden), no photograph and no data. It fills its positioned parent;
 * put it in a `scheme-dark` section so the text over it uses dark tokens.
 *
 * The glows breathe and a light sweeps once on load (app/globals.css);
 * both stop under prefers-reduced-motion.
 */

type Variant = "hero" | "band";

/** Crowd dots: a fixed, hand-spaced tile, so the texture is the same on every render. */
const CROWD: [number, number, number, string][] = [
  [3, 4, 1.6, "#ffffff"],
  [10, 3, 1.3, "#ff4fa3"],
  [17, 5, 1.5, "#9ec5ff"],
  [24, 3, 1.2, "#ffffff"],
  [31, 5, 1.6, "#ffd36b"],
  [6, 11, 1.4, "#9ec5ff"],
  [13, 12, 1.6, "#ffffff"],
  [20, 10, 1.3, "#ffd36b"],
  [27, 12, 1.5, "#ffffff"],
  [34, 11, 1.2, "#ff4fa3"],
];

function Tower({ x, y, s = 1, id }: { x: number; y: number; s?: number; id: string }) {
  const lamps = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) lamps.push(<circle key={`${r}-${c}`} cx={8 + c * 13} cy={8 + r * 11} r={3.6} fill="#fffbe8" />);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle className="ground-glow" cx={40} cy={18} r={260} fill={`url(#${id}-lamp)`} />
      <path d="M40 34 L36 420 L44 420 Z" fill="#1a2640" />
      <rect x={-4} y={-6} width={88} height={42} rx={4} fill="#1a2640" />
      {lamps}
    </g>
  );
}

export function Ground({ variant = "hero", id = "ground", className = "" }: { variant?: Variant; id?: string; className?: string }) {
  const hero = variant === "hero";
  // The band crops to the stands and the far rope; the hero shows the whole oval.
  const view = hero ? "0 0 1600 700" : "0 120 1600 420";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox={view}
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <radialGradient id={`${id}-sky`} cx="50%" cy="0%" r="90%">
          <stop offset="0" stopColor="#16285a" />
          <stop offset="0.55" stopColor="#0a1430" />
          <stop offset="1" stopColor="#060a13" />
        </radialGradient>
        <radialGradient id={`${id}-lamp`}>
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.55" />
          <stop offset="0.25" stopColor="#cfe0ff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#cfe0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf1ff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#eaf1ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-turf`} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#2a8a4c" />
          <stop offset="0.55" stopColor="#14522b" />
          <stop offset="1" stopColor="#082414" />
        </radialGradient>
        <linearGradient id={`${id}-pitch`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9b27e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e2cd98" stopOpacity="0.85" />
        </linearGradient>
        <pattern id={`${id}-crowd`} width="38" height="16" patternUnits="userSpaceOnUse">
          {CROWD.map(([cx, cy, r, fill], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill={fill} opacity={0.22 + (i % 3) * 0.08} />
          ))}
        </pattern>
        <pattern id={`${id}-mow`} width="120" height="10" patternUnits="userSpaceOnUse">
          <rect width="60" height="10" fill="#ffffff" opacity="0.05" />
        </pattern>
        <linearGradient id={`${id}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#060a13" stopOpacity="0" />
          <stop offset="1" stopColor="#060a13" stopOpacity="0.9" />
        </linearGradient>
        <clipPath id={`${id}-oval`}>
          <ellipse cx="800" cy="690" rx="900" ry="250" />
        </clipPath>
      </defs>

      <rect x="0" y="0" width="1600" height="700" fill={`url(#${id}-sky)`} />

      {/* Floodlight beams falling on the field. */}
      <g className="ground-glow">
        <path d="M150 90 L560 700 L-60 700 Z" fill={`url(#${id}-beam)`} />
        <path d="M1450 90 L1660 700 L1040 700 Z" fill={`url(#${id}-beam)`} />
      </g>

      {/* The stands, with the crowd. */}
      <ellipse cx="800" cy="700" rx="1180" ry="380" fill="#0b1428" />
      <ellipse cx="800" cy="700" rx="1180" ry="380" fill={`url(#${id}-crowd)`} />
      <ellipse cx="800" cy="700" rx="1180" ry="380" fill="none" stroke="#2a3a5e" strokeWidth="2" opacity="0.7" />
      <ellipse cx="800" cy="700" rx="960" ry="282" fill="#0a1222" />

      {/* The outfield, mowing stripes, rope and the 30-yard circle. */}
      <ellipse cx="800" cy="690" rx="900" ry="250" fill={`url(#${id}-turf)`} />
      <g clipPath={`url(#${id}-oval)`}>
        <rect x="-100" y="420" width="1800" height="300" fill={`url(#${id}-mow)`} transform="skewX(-8)" />
      </g>
      <ellipse cx="800" cy="692" rx="866" ry="234" fill="none" stroke="#ffffff" strokeOpacity="0.38" strokeWidth="2.5" />
      <ellipse cx="800" cy="676" rx="430" ry="118" fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="10 12" />

      {/* The pitch, in perspective, with its creases. */}
      <path d="M786 560 L814 560 L828 680 L772 680 Z" fill={`url(#${id}-pitch)`} />
      <path d="M782 572 L818 572 M772 668 L828 668" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="1.6" />
      <path d="M795 560 L795 566 M800 560 L800 566 M805 560 L805 566" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.4" />

      {/* Floodlight towers. */}
      <Tower id={id} x={110} y={60} />
      <Tower id={id} x={1410} y={60} />
      {hero ? (
        <>
          <Tower id={id} x={520} y={150} s={0.55} />
          <Tower id={id} x={1040} y={150} s={0.55} />
        </>
      ) : null}

      {/* One slow light sweep on load. */}
      <rect className="ground-sweep" x="0" y="0" width="420" height="700" fill={`url(#${id}-sweep)`} />

      <rect x="0" y="0" width="1600" height="700" fill={`url(#${id}-fade)`} />
    </svg>
  );
}
