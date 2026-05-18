import clsx from 'clsx'
import styles from './TagPill.module.css'

interface TagPillProps {
  label: string
  active?: boolean
  onClick?: () => void
}

export function TagPill({ label, active = false, onClick }: TagPillProps) {
  const Element = onClick ? 'button' : 'span'
  return (
    <Element
      type={onClick ? 'button' : undefined}
      className={clsx(styles.pill, active && styles.active, onClick && styles.clickable)}
      onClick={onClick}
    >
      {label}
    </Element>
  )
}
