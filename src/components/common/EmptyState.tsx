import styles from './EmptyState.module.css'

interface EmptyStateProps {
  title: string
  body: string
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon}>FM</div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}
