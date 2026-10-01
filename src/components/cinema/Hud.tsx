'use client';

import type { Film } from '@/data/catalogue';
import type { Station } from '@/data/story';
import styles from './Hud.module.css';
import { Logotype } from './Logotype';

interface HudProps {
  story: readonly Station[];
  index: number;
  /** The number one pick, offered at the end of the flight. */
  topPick: Film | null;
  soundOn: boolean;
  onToggleSound: () => void;
  onPlay: (film: Film) => void;
  onJump: (station: number) => void;
}

const REPO_URL = 'https://github.com/captain-d-red/state-of-cinema-nextjs';

/** Splits a line into letters that rise in one after another, the way the labels arrive. */
function Letters({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className={styles.letters} aria-label={text}>
      {Array.from(text).map((char, i) => (
        <span key={i} className={styles.mask} aria-hidden="true">
          <span className={styles.letter} style={{ '--i': i, '--delay': `${delay}ms` }}>
            {char === ' ' ? ' ' : char}
          </span>
        </span>
      ))}
    </span>
  );
}

function Copy({ station, topPick, onPlay }: { station: Station; topPick: Film | null; onPlay: (film: Film) => void }) {
  switch (station.kind) {
    case 'title':
      return (
        <div className={styles.title} key="title">
          <h1 className={styles.titleLine}>
            <Letters text="The state" />
          </h1>
          <p className={styles.strap}>
            An overview of seventy-two films in numbers and picks: what the catalogue holds, who made the most of it and
            what sits at the top tonight.
          </p>
          <p className={`${styles.titleLine} ${styles.titleEnd}`} aria-hidden="true">
            <Letters text="of cinema" delay={160} />
          </p>
        </div>
      );
    case 'stat':
      return (
        <div className={styles.stat} key={station.label}>
          <h2 className={styles.statLabel}>
            <Letters text={station.label} />
            <sup className={styles.sup}>({station.value})</sup>
          </h2>
          <p className={styles.footnote}>{station.detail}</p>
        </div>
      );
    case 'pick':
      return (
        <div className={styles.pick} key={station.film.slug}>
          <p className={styles.kicker}>Top pick № {station.rank}</p>
          <h2 className={styles.pickTitle} style={{ '--len': station.film.title.length }}>
            <Letters text={station.film.title} />
          </h2>
          <p className={styles.byline}>by {station.film.director}</p>
          {station.film.trailer && (
            <button type="button" className={styles.play} onClick={() => onPlay(station.film)}>
              <span className={styles.playIcon} aria-hidden="true" />
              Watch trailer
            </button>
          )}
          <p className={styles.footnote}>
            {station.film.year} · {station.film.minutes} min · {station.film.genres.join(', ')}
          </p>
        </div>
      );
    case 'outro':
      return (
        <div className={styles.outro} key="outro">
          <h2 className={styles.outroLine}>
            <Letters text="Now start watching" />
          </h2>
          {topPick && (
            <button type="button" className={styles.cta} onClick={() => onPlay(topPick)}>
              <span className={styles.playIcon} aria-hidden="true" />
              Watch the top pick
            </button>
          )}
          <p className={styles.footnote}>Every film is on the reel. Click a frame to watch its trailer.</p>
        </div>
      );
  }
}

const statusFor = (index: number, count: number): string =>
  index === 0 ? 'Scroll to dive in' : index >= count - 2 ? 'Almost there' : 'Keep going';

/**
 * The interface over the flight: the station's copy in the centre, and the status, mark,
 * repository link and station ticks around the edges.
 */
export function Hud({ story, index, topPick, soundOn, onToggleSound, onPlay, onJump }: HudProps) {
  const station = story[index] ?? story[0]!;
  return (
    <div className={styles.hud}>
      <header className={styles.top}>
        <p className={styles.status}>{statusFor(index, story.length)}</p>
        <a
          className={styles.brand}
          href="#"
          aria-label="AK47, back to the start"
          onClick={(e) => {
            e.preventDefault();
            onJump(0);
          }}
        >
          <Logotype className={styles.mark} />
        </a>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.sound}
            aria-label="Sound"
            aria-pressed={soundOn}
            onClick={onToggleSound}
          >
            <span className={styles.wide}>Sound {soundOn ? 'on' : 'off'}</span>
            <span className={styles.bars} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <a className={styles.repo} href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub<span className={styles.wide}>&nbsp;repo</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <section className={styles.centre} aria-live="polite">
        <Copy station={station} topPick={topPick} onPlay={onPlay} />
      </section>

      <footer className={styles.bottom}>
        <p className={styles.credit}>72 films · 2010 to 2025</p>
        <nav className={styles.ticks} aria-label="Stations">
          {story.map((_, i) => (
            <button
              key={i}
              type="button"
              className={styles.tick}
              style={{ '--d': Math.abs(i - index) }}
              aria-label={`Station ${i + 1} of ${story.length}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => onJump(i)}
            />
          ))}
        </nav>
        <p className={styles.credit}>Made by AK47</p>
      </footer>
    </div>
  );
}
