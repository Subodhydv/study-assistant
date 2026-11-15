import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTypingTarget, shuffle } from '../lib/shuffle.js';
import { IconCheck, IconX } from './Icons.jsx';

const LETTERS = 'ABCDEF';

function makeRound(questions, ids, number) {
  const retest = number > 1;
  return {
    number,
    // Retest rounds shuffle question order and option order, so you can't
    // pass by remembering "it was the second one".
    ids: retest ? shuffle(ids) : ids,
    optionOrder: Object.fromEntries(
      ids.map((id) => {
        const q = questions.find((x) => x.id === id);
        const natural = q.options.map((_, i) => i);
        return [id, retest ? shuffle(natural) : natural];
      }),
    ),
  };
}

export default function Quiz({ questions, active = true }) {
  const byId = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);
  const [round, setRound] = useState(() => makeRound(questions, questions.map((q) => q.id), 1));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // id -> chosen ORIGINAL option index
  const [phase, setPhase] = useState('question');
  const [mastered, setMastered] = useState({}); // id -> true once answered correctly in any round
  const [scores, setScores] = useState([]); // [{ number, correct, total }]
  const nextRef = useRef(null);

  const qid = round.ids[index];
  const q = byId[qid];
  const chosen = answers[qid];
  const answered = chosen !== undefined;
  const isLast = index === round.ids.length - 1;

  const choose = useCallback(
    (originalIndex) => {
      if (answered || !q) return;
      setAnswers((a) => ({ ...a, [qid]: originalIndex }));
      if (originalIndex === q.answerIndex) setMastered((m) => ({ ...m, [qid]: true }));
    },
    [answered, q, qid],
  );

  const next = useCallback(() => {
    if (!answered) return;
    if (isLast) {
      const correct = round.ids.filter((id) => answers[id] === byId[id].answerIndex).length;
      setScores((s) => [...s, { number: round.number, correct, total: round.ids.length }]);
      setPhase('results');
    } else {
      setIndex((i) => i + 1);
    }
  }, [answered, isLast, round, answers, byId]);

  const startRound = (ids, number) => {
    setRound(makeRound(questions, ids, number));
    setIndex(0);
    setAnswers({});
    setPhase('question');
  };

  // Focus "Next" after answering so Enter continues.
  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered]);

  // Keyboard: 1-6 or A-F to answer, Enter or → for next.
  useEffect(() => {
    if (!active || phase !== 'question') return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      if (e.target.closest?.('dialog[open]')) return;
      const order = round.optionOrder[qid] ?? [];
      const key = e.key.toUpperCase();
      let pos = -1;
      if (/^[1-6]$/.test(key)) pos = Number(key) - 1;
      else if (LETTERS.includes(key) && key.length === 1) pos = LETTERS.indexOf(key);
      if (pos >= 0 && pos < order.length && !answered) {
        e.preventDefault();
        choose(order[pos]);
      } else if (e.key === 'ArrowRight' && answered) {
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, phase, round, qid, answered, choose, next]);

  if (questions.length === 0) {
    return <p className="panel-empty">This set has no quiz questions. Try the flashcards, or ask for some questions above.</p>;
  }

  const masteredCount = Object.keys(mastered).filter((id) => byId[id]).length;

  if (phase === 'results') {
    const wrong = round.ids.filter((id) => answers[id] !== byId[id].answerIndex);
    const last = scores[scores.length - 1];
    return (
      <div className="quiz-results">
        <div className="score-card" role="status">
          <p className="score-big">
            {last.correct}
            <span className="score-of">/{last.total}</span>
          </p>
          <div>
            <h2 className="score-title">
              {wrong.length === 0
                ? round.number === 1
                  ? 'Perfect score.'
                  : 'All the retested questions are right now.'
                : `${wrong.length} to go over again.`}
            </h2>
            <p className="score-sub">
              You&apos;ve answered {masteredCount} of {questions.length} questions correctly at least once.
            </p>
          </div>
        </div>

        <div className="results-actions">
          {wrong.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => startRound(wrong, round.number + 1)}>
              Retest the {wrong.length} you missed
            </button>
          )}
          <button
            type="button"
            className={`btn ${wrong.length ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => startRound(questions.map((x) => x.id), round.number + 1)}
          >
            Retake the whole quiz
          </button>
        </div>

        {scores.length > 1 && (
          <ol className="round-history" aria-label="Previous rounds">
            {scores.map((s) => (
              <li key={s.number}>
                Round {s.number}: {s.correct}/{s.total}
              </li>
            ))}
          </ol>
        )}

        <h3 className="review-heading">Review</h3>
        <ul className="review-list">
          {round.ids.map((id) => {
            const item = byId[id];
            const ok = answers[id] === item.answerIndex;
            return (
              <li key={id} className={`review-item ${ok ? 'is-right' : 'is-wrong'}`}>
                <span className="review-icon" aria-label={ok ? 'Correct' : 'Incorrect'}>
                  {ok ? <IconCheck /> : <IconX />}
                </span>
                <div>
                  <p className="review-q">{item.question}</p>
                  {!ok && (
                    <p className="review-a">
                      You chose <span className="strike">{item.options[answers[id]]}</span>. Answer:{' '}
                      <strong>{item.options[item.answerIndex]}</strong>
                    </p>
                  )}
                  {ok && <p className="review-a">{item.options[item.answerIndex]}</p>}
                  {item.explanation && <p className="review-why">{item.explanation}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const order = round.optionOrder[qid];
  const correct = answered && chosen === q.answerIndex;

  return (
    <div className="quiz">
      <div className="deck-toolbar">
        <p className="deck-position">
          Question {index + 1} of {round.ids.length}
          {round.number > 1 && <span className="deck-mode"> (round {round.number})</span>}
        </p>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${(index / round.ids.length) * 100}%` }} />
      </div>

      <fieldset className="question-card">
        <legend className="question-text">{q.question}</legend>
        <div className="options">
          {order.map((originalIndex, pos) => {
            const isChosen = chosen === originalIndex;
            const isAnswer = originalIndex === q.answerIndex;
            let state = '';
            if (answered && isAnswer) state = ' is-correct';
            else if (answered && isChosen) state = ' is-wrong';
            else if (answered) state = ' is-muted';
            return (
              <button
                key={originalIndex}
                type="button"
                className={`option${state}`}
                onClick={() => choose(originalIndex)}
                aria-disabled={answered || undefined}
                aria-pressed={isChosen}
              >
                <span className="option-letter" aria-hidden="true">{LETTERS[pos]}</span>
                <span className="option-text">{q.options[originalIndex]}</span>
                {answered && isAnswer && <span className="sr-only"> (correct answer)</span>}
                {answered && isChosen && !isAnswer && <span className="sr-only"> (your answer)</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className={`feedback ${correct ? 'is-right' : 'is-wrong'}`} role="status">
            <p className="feedback-title">
              {correct ? 'Correct.' : `Not quite. The answer is ${LETTERS[order.indexOf(q.answerIndex)]}.`}
            </p>
            {q.explanation && <p className="feedback-why">{q.explanation}</p>}
          </div>
        )}
      </fieldset>

      <div className="quiz-footer">
        <p className="kbd-hint">
          Answer with <kbd>1</kbd>–<kbd>{order.length}</kbd> or <kbd>A</kbd>–<kbd>{LETTERS[order.length - 1]}</kbd>
        </p>
        <button ref={nextRef} type="button" className="btn btn-primary" onClick={next} disabled={!answered}>
          {isLast ? 'See results' : 'Next question'}
        </button>
      </div>
    </div>
  );
}
