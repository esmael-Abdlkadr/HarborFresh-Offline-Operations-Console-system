import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DeliveryTask } from '../../types/index.ts'

interface TaskCardProps {
  task: DeliveryTask
  conflict: boolean
}

export function TaskCard({ task, conflict }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task-${task.id}`,
    data: { taskId: task.id, batchId: task.batchId ?? null },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    border: conflict ? '1px solid #be3130' : '1px solid var(--border)',
    borderRadius: '0.55rem',
    padding: '0.55rem',
    background: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
  } as const

  return (
    <article ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.5rem' }}>
        <strong>Order #{task.orderId}</strong>
        {conflict && <span title="Conflict" style={{ color: '#be3130' }}>⚠</span>}
      </div>
      <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{task.address.slice(0, 40)}</div>
      <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
        {task.weightLbs} lbs • Priority {task.priority} • {task.status}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        Delivery: {new Date(task.promisedDeliveryWindow.start).toLocaleTimeString()} -{' '}
        {new Date(task.promisedDeliveryWindow.end).toLocaleTimeString()}
      </div>
    </article>
  )
}
