import type { ToastMessage } from '../types'

export function ToastViewport({ items }: { items: ToastMessage[] }) {
  return (
    <div className="mtoast-stack" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={`mtoast mtoast--${item.tone}`}>
          {item.text}
        </div>
      ))}
    </div>
  )
}
