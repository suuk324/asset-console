export function LinearProgress({
  value,
  label,
}: {
  value: number
  label: string
}) {
  return (
    <div className="mprogress" aria-label={label} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="mprogress__track">
        <div className="mprogress__bar" style={{ width: `${Math.max(4, Math.round(value * 100))}%` }} />
      </div>
      <span className="mprogress__label">
        {label}
        <strong>{Math.round(value * 100)}%</strong>
      </span>
    </div>
  )
}
