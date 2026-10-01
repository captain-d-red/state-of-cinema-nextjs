'use client';

import { useEffect, useRef } from 'react';
import type { Film } from '@/data/catalogue';
import styles from './TrailerDialog.module.css';

interface TrailerDialogProps {
  film: Film | null;
  onClose: () => void;
}

/**
 * The projector. A native modal dialog, so focus is trapped and Escape closes it for free,
 * playing the trailer through YouTube's privacy-enhanced player at the film's own aspect.
 */
export function TrailerDialog({ film, onClose }: TrailerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (film && !dialog.open) dialog.showModal();
    if (!film && dialog.open) dialog.close();
  }, [film]);

  const trailer = film?.trailer;
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={film ? `${film.title} trailer` : 'Trailer'}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {film && trailer && (
        <div className={styles.frame} style={{ '--aspect': trailer.aspect }}>
          <iframe
            className={styles.player}
            src={`https://www.youtube-nocookie.com/embed/${trailer.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`}
            title={`${film.title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}
      {film && (
        <div className={styles.bar}>
          <p className={styles.caption}>
            <span className={styles.title}>{film.title}</span>
            <span className={styles.meta}>
              {film.director} · {film.year}
            </span>
          </p>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </dialog>
  );
}
