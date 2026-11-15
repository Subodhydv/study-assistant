const EXAMPLES = [
  {
    label: 'A topic',
    text: 'The water cycle',
  },
  {
    label: 'Lecture notes',
    text: `Cell biology — lecture 3
The mitochondria produce most of the cell's ATP through cellular respiration.
Ribosomes build proteins by translating messenger RNA.
The cell membrane is a phospholipid bilayer that controls what enters and leaves the cell.
The nucleus stores DNA and controls gene expression.
Lysosomes contain enzymes that break down waste and worn-out organelles.
Chloroplasts, found in plant cells, carry out photosynthesis.`,
  },
  {
    label: 'A reading summary',
    text: `Supply and demand: when the price of a good rises, the quantity demanded usually falls. A shortage happens when demand is greater than supply at the current price. A surplus happens when supply is greater than demand. The equilibrium price is where the supply and demand curves meet. Price elasticity measures how strongly demand responds to a change in price.`,
  },
];

export default function EmptyState({ onPick, scenarios }) {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 id="empty-title" className="empty-title">Not sure what to paste?</h2>
      <p className="empty-text">Start from an example, then edit it however you like.</p>
      <div className="chip-row">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" className="chip" onClick={() => onPick(ex.text)}>
            {ex.label}
          </button>
        ))}
      </div>

      {scenarios && (
        <details className="scenarios">
          <summary>Test how the app handles a bad answer from the model</summary>
          <p className="empty-text">
            In demo mode, add one of these tags to your notes to make the stand-in model misbehave on purpose.
          </p>
          <ul className="scenario-list">
            {Object.entries(scenarios).map(([tag, description]) => (
              <li key={tag}>
                <button type="button" className="chip chip-mono" onClick={() => onPick(`Photosynthesis basics ${tag}`)}>
                  {tag}
                </button>
                <span>{description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
