/**
 * The AK47 logotype. The A is a chevron whose crossbar is the red record light, and the K, 4
 * and 7 are drawn to its cap height of 31 units, its 5.8 unit stroke and its cut corners, with
 * the diagonals of the 4 and the 7 parallel to the A's leg. It fills with the current colour.
 */
export function Logotype({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 113.03 40" fill="currentColor" aria-hidden="true">
      <path d="M16 4 L32 35 L25.5 35 L16 16.5 L6.5 35 L0 35 Z" />
      <circle cx="16" cy="27.5" r="3.2" fill="var(--rec)" />
      <path d="M34.6 4 L40.4 4 L40.4 14.6 L51 4 L59.2 4 L44.5 18.7 L60.8 35 L52.6 35 L40.4 22.8 L40.4 35 L34.6 35 Z" />
      <path
        fillRule="evenodd"
        d="M76.5 4 L84.5 4 L84.5 23.4 L87.7 23.4 L87.7 28.8 L84.5 28.8 L84.5 35 L78.7 35 L78.7 28.8 L63.7 28.8 Z M73.01 23.4 L78.7 23.4 L78.7 12.38 Z"
      />
      <path d="M91.53 4 L113.03 4 L97.03 35 L90.5 35 L103.71 9.4 L91.53 9.4 Z" />
    </svg>
  );
}
