import 'react';

declare module 'react' {
  /** Lets inline styles set CSS custom properties without casting. */
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
