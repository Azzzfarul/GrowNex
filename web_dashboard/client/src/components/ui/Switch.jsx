// M3 switch; styles in index.css (.switch)
export default function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="switch"
    >
      <span className="switch-handle" />
    </button>
  )
}
