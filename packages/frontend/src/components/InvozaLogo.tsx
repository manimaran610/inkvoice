import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

const NAVY = "#06233a";
const GREEN = "#00bd78";

/** Icon-only mark from the Invoza app icon. */
export function InvozaIcon({ className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Invoza"
    >
      <rect width="100" height="100" rx="24" fill="#fff" />
      <path d="M15 16 52.5 39.5v12.7L25.8 35.3v42H15z" fill={NAVY} />
      <path d="M61.9 25h10.9v63L35 64V51.2l26.9 17.6z" fill={GREEN} />
    </svg>
  );
}

/** Full logo with mark + "Invoza" wordmark */
export function InvozaLogo({ className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 250 80"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Invoza"
    >
      <g transform="translate(8 8) scale(0.64)">
        <rect width="100" height="100" rx="24" fill="#fff" />
        <path d="M15 16 52.5 39.5v12.7L25.8 35.3v42H15z" fill={NAVY} />
        <path d="M61.9 25h10.9v63L35 64V51.2l26.9 17.6z" fill={GREEN} />
      </g>
      <text
        x="82"
        y="54"
        fontFamily="'Geist Variable', system-ui, -apple-system, sans-serif"
        fontSize="39"
        fontWeight="700"
        letterSpacing="-1.4"
        fill="var(--foreground)"
      >
        <tspan>Invo</tspan>
        <tspan fill={GREEN}>za</tspan>
      </text>
    </svg>
  );
}
