import Icon from './Icon'

// M3 outlined text field with a floating label (styles: .tf in index.css). `as` = input | select | textarea.
// The placeholder only shows while focused, so it works as an example value ("e.g. 07:00").
export default function TextField({ label, error, support, as: Tag = 'input', className = '', children, ...props }) {
  return (
    <label className={`tf ${error ? 'tf-invalid' : ''} ${className}`}>
      <Tag className="tf-input" placeholder=" " aria-invalid={!!error || undefined} {...props}>{children}</Tag>
      <span className="tf-label">{label}</span>
      {Tag === 'select' && <Icon name="arrow_drop_down" className="tf-trailing" />}
      {(error || support) && <span className="tf-support">{error || support}</span>}
    </label>
  )
}
