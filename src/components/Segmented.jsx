/** A row of radio buttons styled as a segmented control. */
export default function Segmented({ label, name, value, options, onChange }) {
  return (
    <fieldset className="segmented">
      <legend className="segmented-label">{label}</legend>
      <div className="segmented-track">
        {options.map((opt) => (
          <label key={opt.value} className={`segmented-option${opt.value === value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={opt.value === value}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
