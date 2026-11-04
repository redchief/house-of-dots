import { allLines, type RoomState } from '../shared/game';
import { cn, COLORS } from './utils';

const GAP = 40;
const PAD = 14;

type Props = {
  room: RoomState;
  canMove: boolean;
  onMove: (line: string) => void;
};

const ends = (line: string) => {
  const [kind, rs, cs] = line.split(':');
  const r = Number(rs);
  const c = Number(cs);
  const x1 = PAD + c * GAP;
  const y1 = PAD + r * GAP;
  return kind === 'h'
    ? { x1, y1, x2: x1 + GAP, y2: y1 }
    : { x1, y1, x2: x1, y2: y1 + GAP };
};

export const Board = ({ room, canMove, onMove }: Props) => {
  const n = room.size;
  const span = n * GAP + PAD * 2;
  const lines = allLines(n);

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      className="aspect-square w-full max-w-[min(92vw,70vh)] touch-manipulation select-none"
      role="grid"
      aria-label={`${n} by ${n} dots and boxes board`}
    >
      <defs>
        <clipPath id="avatar" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>

      {Object.entries(room.boxes).map(([key, owner]) => {
        const [r, c] = key.split(':').map(Number);
        const x = PAD + c! * GAP;
        const y = PAD + r! * GAP;
        const p = room.players[owner];
        const inset = GAP * 0.14;
        return (
          <g key={key} className="animate-pop" style={{ transformOrigin: `${x + GAP / 2}px ${y + GAP / 2}px` }}>
            <rect x={x} y={y} width={GAP} height={GAP} fill={COLORS[owner]} opacity={0.22} />
            {p && !p.isBot && p.avatarUrl ? (
              <image
                href={p.avatarUrl}
                x={x + inset}
                y={y + inset}
                width={GAP - inset * 2}
                height={GAP - inset * 2}
                clipPath="url(#avatar)"
                preserveAspectRatio="xMidYMin slice"
              >
                <title>{p.username}</title>
              </image>
            ) : (
              <text x={x + GAP / 2} y={y + GAP / 2} textAnchor="middle" dominantBaseline="central" fontSize={GAP * 0.5}>
                🤖
              </text>
            )}
          </g>
        );
      })}

      {lines.map((line) => {
        const pos = ends(line);
        const owner = room.lines[line];
        if (owner !== undefined) {
          return (
            <line
              key={line}
              {...pos}
              stroke={COLORS[owner]}
              strokeWidth={line === room.lastLine ? 6 : 4.5}
              strokeLinecap="round"
              className={cn(line === room.lastLine && 'animate-pulse')}
            />
          );
        }
        return (
          <g key={line}>
            <line {...pos} stroke="currentColor" strokeOpacity={0.12} strokeWidth={2} strokeDasharray="2 5" />
            {canMove && (
              <line
                {...pos}
                strokeWidth={GAP * 0.45}
                strokeLinecap="round"
                className="cursor-pointer stroke-transparent hover:stroke-fg/20 focus:stroke-fg/30 focus:outline-none"
                tabIndex={0}
                role="button"
                aria-label={`Draw line ${line}`}
                onClick={() => onMove(line)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onMove(line)}
              />
            )}
          </g>
        );
      })}

      {Array.from({ length: (n + 1) ** 2 }, (_, i) => (
        <circle
          key={i}
          cx={PAD + (i % (n + 1)) * GAP}
          cy={PAD + Math.floor(i / (n + 1)) * GAP}
          r={4}
          className="pointer-events-none fill-fg"
        />
      ))}
    </svg>
  );
};
