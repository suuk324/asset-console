import styles from './SectionHeader.module.css'

interface SectionHeaderProps {
  eyebrow: string
  title: string
  description?: string
  action?: React.ReactNode
  meta?: React.ReactNode
  compact?: boolean
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  meta,
  compact = false,
}: SectionHeaderProps) {
  const className = [styles.header, compact ? styles.compact : ''].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <div className={styles.copyBlock}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <div className={styles.titleRow}>
          <h1>{title}</h1>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
