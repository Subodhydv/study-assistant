import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTypingTarget, shuffle } from '../lib/shuffle.js';
import { IconChevronLeft, IconChevronRight, IconRotate, IconShuffle } from './Icons.jsx';

export default function Flashcards({ cards, active = true }) {
  const byId = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);
  const [order, setOrder] = useState(() => cards.map((c) => c.id));
  const [marks, setMarks] = useState({}); // id -> 'known' | 'learning'
  const [reviewOnly, setReviewOnly] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  const deck = useMemo(
    () => (reviewOnly ? order.filter((id) => marks[id] !== 'known') : order),
    [order, marks, reviewOnly],
  );
  const safeIndex = Math.min(index, Math.max(deck.length - 1, 0));
  const card = byId[deck[safeIndex]];
  const knownCount = cards.filter((c) => marks[c.id] === 'known').length;
  const remaining = cards.length - knownCount;

  const go = useCallback(
    (delta) => {
      setFlipped(false);
      setFinished(false);
      setIndex((i) => Math.min(Math.max(Math.min(i, deck.length - 1) + delta, 0), Math.max(deck.length - 1, 0)));
    },
    [deck.length],
  );

  const mark = useCallback(
    (status) => {
      if (!card) return;
      setMarks((m) => ({ ...m, [card.id]: status }));
      setFlipped(false);
      const leavesDeck = reviewOnly && status === 'known';
      const isLast = leavesDeck ? safeIndex >= deck.length - 1 : safeIndex === deck.length - 1;
      if (isLast) {
        setFinished(true);
        if (!leavesDeck) return;
        setIndex(Math.max(deck.length - 2, 0));
      } else if (!leavesDeck) {
        setIndex(safeIndex + 1);
      }
    },
    [card, reviewOnly, safeIndex, deck.length],
  );

  const restart = (onlyLearning) => {
    setReviewOnly(onlyLearning);
    setIndex(0);
    setFlipped(false);
    setFinished(false);
  };

  const reshuffle = () => {
    setOrder((o) => shuffle(o));
    setIndex(0);
    setFlipped(false);
    setFinished(false);
  };

  const resetAll = () => {
    setMarks({});
    setOrder(cards.map((c) => c.id));
    restart(false);
  };

  // Keyboard: Space/Enter flip, arrows move, 1 = still learning, 2 = got it.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      if (e.target.closest?.('dialog[open]')) return;
      const onButton = e.target instanceof Element && e.target.closest('button');
      if ((e.key === ' ' || e.key === 'Enter') && !onButton && !finished) {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        go(1);
      } else if (e.key === 'ArrowLeft') {
        go(-1);
      } else if (e.key === '1' && !finished) {
        mark('learning');
      } else if (e.key === '2' && !finished) {
        mark('known');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, go, mark, finished]);

  // Swipe left/right on touch screens.
  const touch = useRef(null);
  const swiped = useRef(false);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
    swiped.current = false;
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    }
  };
  const onCardClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setFlipped((f) => !f);
  };

  if (cards.length === 0) {
    return <p className="panel-empty">This set has no flashcards. Try the quiz, or ask for some cards above.</p>;
  }

  if (finished || deck.length === 0) {
    const learning = cards.filter((c) => marks[c.id] !== 'known').length;
    return (
      <div className="deck-done" role="status">
        <h2 className="deck-done-title">
          {learning === 0 ? 'You know every card in this set.' : 'End of the deck.'}
        </h2>
        <p className="deck-done-text">
          {knownCount} of {cards.length} marked as known.
          {learning > 0 && ` ${learning} still to learn.`}
        </p>
        <div className="deck-done-actions">
          {learning > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => restart(true)}>
              Review the {learning} still to learn
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => restart(false)}>
            Go through all cards
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetAll}>
            <IconRotate /> Reset progress
          </button>
        </div>
      </div>
    );
  }

  const status = marks[card.id];

  return (
    <div className="flashcards">
      <div className="deck-toolbar">
        <p className="deck-position" aria-live="polite">
          Card {safeIndex + 1} of {deck.length}
          {reviewOnly && <span className="deck-mode"> (still to learn)</span>}
        </p>
        <div className="deck-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={reshuffle}>
            <IconShuffle /> Shuffle
          </button>
          {reviewOnly ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => restart(false)}>
              Show all cards
            </button>
          ) : (
            knownCount > 0 &&
            remaining > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => restart(true)}>
                Only cards to learn ({remaining})
              </button>
            )
          )}
        </div>
      </div>

      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${(knownCount / cards.length) * 100}%` }} />
      </div>
      <p className="sr-only">
        {knownCount} of {cards.length} cards marked as known.
      </p>

      <div className="card-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button
          type="button"
          className={`index-card${flipped ? ' is-flipped' : ''}`}
          onClick={onCardClick}
          aria-label={flipped ? `Answer: ${card.back}. Activate to show the question.` : `Question: ${card.front}. Activate to show the answer.`}
        >
          <span className="index-card-inner">
            <span className="index-card-face index-card-front" aria-hidden="true">
              <span className="index-card-text">{card.front}</span>
              <span className="index-card-hint">Tap or press space to flip</span>
            </span>
            <span className="index-card-face index-card-back" aria-hidden="true">
              <span className="index-card-text">{card.back}</span>
            </span>
          </span>
          {status && (
            <span className={`card-stamp is-${status}`} aria-hidden="true">
              {status === 'known' ? 'Known' : 'Learning'}
            </span>
          )}
        </button>
      </div>

      <div className="deck-controls">
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => go(-1)} disabled={safeIndex === 0} aria-label="Previous card">
          <IconChevronLeft />
        </button>
        <div className="deck-marks">
          <button type="button" className="btn btn-mark is-learning" onClick={() => mark('learning')}>
            Still learning <kbd>1</kbd>
          </button>
          <button type="button" className="btn btn-mark is-known" onClick={() => mark('known')}>
            Got it <kbd>2</kbd>
          </button>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => go(1)}
          disabled={safeIndex >= deck.length - 1}
          aria-label="Next card"
        >
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}
