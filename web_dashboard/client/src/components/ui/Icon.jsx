// Material Symbols Rounded glyph by name (https://fonts.google.com/icons). Decorative: give the
// surrounding control its own label.
export default function Icon({ name, filled = false, size, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`icon ${filled ? 'icon-fill' : ''} ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  )
}
