import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, type DragEndEvent, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAuth } from '../hooks/useAuth.ts'
import { dispatchService, DispatchError } from '../services/dispatchService.ts'
import { db } from '../db/db.ts'
import { TaskCard } from '../components/dispatch/TaskCard.tsx'
import { ReasonModal } from '../components/dispatch/ReasonModal.tsx'
import { Modal } from '../components/ui/Modal.tsx'

type PendingAction =
  | { type: 'assign'; taskId: number; batchId: number; expectedTaskVersion: number; expectedBatchVersion: number }
  | { type: 'unassign'; taskId: number; expectedTaskVersion: number }
  | { type: 'recalculate'; expectedTaskVersions: Record<number, number> }
  | { type: 'autoPlan' }

function DropColumn({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      className="card"
      style={{ minHeight: 220, background: isOver ? '#eef7ff' : undefined }}
    >
      <h4 style={{ marginTop: 0 }}>{title}</h4>
      <div style={{ display: 'grid', gap: '0.5rem' }}>{children}</div>
    </section>
  )
}

export default function DispatchBoardPage() {
  const { currentUser } = useAuth()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [addBatchOpen, setAddBatchOpen] = useState(false)
  const [batchForm, setBatchForm] = useState({
    label: '',
    vehicleId: 'van-1',
    driverId: 0,
    shiftStart: 8 * 60,
    shiftEnd: 17 * 60,
    vehicleCapacityLbs: 400,
    reason: '',
  })

  const batches = useLiveQuery(
    () => db.deliveryBatches.where('date').equals(selectedDate).toArray(),
    [selectedDate],
  ) ?? []
  const tasks = useLiveQuery(() => db.deliveryTasks.toArray(), []) ?? []
  const users = useLiveQuery(() => db.users.toArray(), []) ?? []
  const logs =
    useLiveQuery(() => db.dispatchLogs.orderBy('timestamp').reverse().limit(50).toArray(), []) ?? []

  const range = useMemo(() => {
    const start = new Date(`${selectedDate}T00:00:00`).getTime()
    const end = new Date(`${selectedDate}T23:59:59`).getTime()
    return { start, end }
  }, [selectedDate])

  const dayTasks = tasks.filter(
    (task) =>
      task.promisedDeliveryWindow.start >= range.start && task.promisedDeliveryWindow.start <= range.end,
  )

  const unassigned = dayTasks.filter((task) => !task.batchId || task.status === 'Unassigned')

  const tasksByBatch = (() => {
    const map = new Map<number, typeof dayTasks>()
    for (const batch of batches) {
      if (batch.id) map.set(batch.id, [])
    }
    for (const task of dayTasks) {
      if (task.batchId && map.has(task.batchId)) {
        map.get(task.batchId)?.push(task)
      }
    }
    return map
  })()

  const conflictMapRaw = useLiveQuery(async () => {
    const map: Record<number, string[]> = {}
    for (const batch of batches) {
      if (!batch.id) continue
      const conflicts = await dispatchService.detectConflicts(batch.id)
      if (conflicts.length > 0) {
        map[batch.id] = conflicts.map((c) => c.message)
      }
    }
    return map
  }, [batches])
  const conflictMap = conflictMapRaw ?? {}

  async function handleDragEnd(event: DragEndEvent) {
    const activeTaskId = Number(String(event.active.id).replace('task-', ''))
    const overId = event.over?.id ? String(event.over.id) : null
    if (!overId || !Number.isFinite(activeTaskId)) {
      return
    }

    const task = dayTasks.find((item) => item.id === activeTaskId)
    if (!task) {
      return
    }

    if (overId === 'unassigned') {
      if (!task.batchId) return
      setPendingAction({ type: 'unassign', taskId: activeTaskId, expectedTaskVersion: task.version })
      return
    }

    if (overId.startsWith('batch-')) {
      const batchId = Number(overId.replace('batch-', ''))
      if (!Number.isFinite(batchId) || task.batchId === batchId) {
        return
      }
      const batch = batches.find((b) => b.id === batchId)
      setPendingAction({
        type: 'assign',
        taskId: activeTaskId,
        batchId,
        expectedTaskVersion: task.version,
        expectedBatchVersion: batch?.version ?? 1,
      })
    }
  }

  async function confirmReason(reason: string) {
    if (!currentUser || !pendingAction) {
      return
    }

    setError(null)
    setStatusMessage(null)
    try {
      if (pendingAction.type === 'assign') {
        await dispatchService.assignTask(pendingAction.taskId, pendingAction.batchId, reason, currentUser, {
          expectedTaskVersion: pendingAction.expectedTaskVersion,
          expectedBatchVersion: pendingAction.expectedBatchVersion,
        })
      } else if (pendingAction.type === 'unassign') {
        await dispatchService.unassignTask(pendingAction.taskId, reason, currentUser, {
          expectedTaskVersion: pendingAction.expectedTaskVersion,
        })
      } else if (pendingAction.type === 'recalculate') {
        await dispatchService.recalculate(selectedDate, currentUser, reason, {
          expectedTaskVersions: pendingAction.expectedTaskVersions,
        })
      } else if (pendingAction.type === 'autoPlan') {
        const result = await dispatchService.generatePlan(selectedDate, currentUser, reason)
        if (result.batchesCreated === 0 && result.tasksAssigned === 0) {
          setStatusMessage('No unassigned tasks found for this date.')
        } else {
          setStatusMessage(
            `Created ${result.batchesCreated} batch${result.batchesCreated !== 1 ? 'es' : ''}, assigned ${result.tasksAssigned} task${result.tasksAssigned !== 1 ? 's' : ''}.`,
          )
        }
      }
      setPendingAction(null)
    } catch (dispatchError) {
      if (dispatchError instanceof DispatchError) {
        if (dispatchError.code === 'DISPATCH_CAPACITY_EXCEEDED') {
          setError(`Conflict: capacity exceeded by ${dispatchError.meta?.overBy ?? '?'} lbs.`)
        } else if (dispatchError.code === 'DISPATCH_TIME_CONFLICT') {
          setError('Conflict: task window does not fit batch shift.')
        } else {
          setError(dispatchError.message)
        }
      } else {
        setError(dispatchError instanceof Error ? dispatchError.message : 'Dispatch update failed.')
      }
      setPendingAction(null)
    }
  }

  function autoPlan() {
    if (!currentUser) return
    setPendingAction({ type: 'autoPlan' })
  }

  async function createBatch() {
    if (!currentUser) return
    setError(null)
    try {
      await dispatchService.addBatch(
        {
          label: batchForm.label,
          vehicleId: batchForm.vehicleId,
          driverId: batchForm.driverId,
          date: selectedDate,
          shiftStart: batchForm.shiftStart,
          shiftEnd: batchForm.shiftEnd,
          vehicleCapacityLbs: batchForm.vehicleCapacityLbs,
          status: 'Planned',
        },
        currentUser,
        batchForm.reason,
      )
      setAddBatchOpen(false)
      setBatchForm((s) => ({ ...s, label: '', reason: '' }))
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create batch.')
    }
  }

  async function generateFromOrders() {
    if (!currentUser) return
    setError(null)
    try {
      const count = await dispatchService.generateTasksFromOrders(currentUser)
      if (count === 0) {
        setError('No new confirmed orders to generate delivery tasks from.')
      }
    } catch (genError) {
      setError(genError instanceof Error ? genError.message : 'Failed to generate tasks from orders.')
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Delivery Dispatch Board</h2>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            Date
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>

          <button className="btn" onClick={() => void autoPlan()}>
            Auto Plan
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              const expectedTaskVersions: Record<number, number> = {}
              for (const task of dayTasks) {
                if (task.id) expectedTaskVersions[task.id] = task.version
              }
              setPendingAction({ type: 'recalculate', expectedTaskVersions })
            }}
          >
            Recalculate
          </button>
          <button className="btn secondary" onClick={() => setAddBatchOpen(true)}>
            Add Batch
          </button>
          <button className="btn secondary" onClick={() => void generateFromOrders()}>
            Generate from Orders
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {statusMessage && <p style={{ color: 'var(--success, #1f8b45)', marginTop: '0.4rem' }}>{statusMessage}</p>}
      </section>

      <DndContext onDragEnd={(event) => void handleDragEnd(event)}>
        <section className="dispatch-board-grid" style={{ marginTop: '1rem' }}>
          <DropColumn id="unassigned" title="Unassigned Tasks">
            <SortableContext items={unassigned.map((task) => `task-${task.id}`)} strategy={verticalListSortingStrategy}>
              {unassigned.map((task) => (
                <TaskCard key={task.id} task={task} conflict={false} />
              ))}
            </SortableContext>
          </DropColumn>

          <div style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {batches.map((batch) => {
              const assigned = (batch.id ? tasksByBatch.get(batch.id) : []) ?? []
              const load = assigned.reduce((sum, task) => sum + task.weightLbs, 0)
              return (
                <DropColumn
                  key={batch.id}
                  id={`batch-${batch.id}`}
                  title={`${batch.label} (${load}/${batch.vehicleCapacityLbs} lbs)`}
                >
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    Driver: {users.find((user) => user.id === batch.driverId)?.username ?? `User ${batch.driverId}`}
                  </div>
                  {batch.id && conflictMap[batch.id] && conflictMap[batch.id].length > 0 && (
                    <div
                      style={{
                        border: '1px solid #d97876',
                        background: '#fff2f2',
                        padding: '0.45rem',
                        borderRadius: '0.4rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      {conflictMap[batch.id].map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  )}
                  <SortableContext items={assigned.map((task) => `task-${task.id}`)} strategy={verticalListSortingStrategy}>
                    {assigned.map((task) => (
                      <TaskCard key={task.id} task={task} conflict={Boolean(batch.id && conflictMap[batch.id]?.length)} />
                    ))}
                  </SortableContext>
                </DropColumn>
              )
            })}
          </div>
        </section>
      </DndContext>

      <section className="card" style={{ marginTop: '1rem' }}>
        <details>
          <summary>Dispatch Log Panel</summary>
          <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Timestamp</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actor</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Batch/Task</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>{users.find((user) => user.id === log.actorId)?.username ?? log.actorId}</td>
                    <td style={{ padding: '0.5rem' }}>{log.action}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {log.batchId ? `Batch ${log.batchId}` : '-'} / {log.taskId ? `Task ${log.taskId}` : '-'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <ReasonModal
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'recalculate'
            ? 'Recalculate Dispatch Plan'
            : pendingAction?.type === 'autoPlan'
              ? 'Auto Plan — Enter Reason'
              : 'Confirm Dispatch Change'
        }
        onCancel={() => setPendingAction(null)}
        onConfirm={(reason) => void confirmReason(reason)}
      />

      <Modal title="Add Batch" open={addBatchOpen} onClose={() => setAddBatchOpen(false)}>
        <div className="form" style={{ maxWidth: '100%' }}>
          <label>
            Label
            <input value={batchForm.label} onChange={(event) => setBatchForm((s) => ({ ...s, label: event.target.value }))} />
          </label>
          <label>
            Vehicle ID
            <input value={batchForm.vehicleId} onChange={(event) => setBatchForm((s) => ({ ...s, vehicleId: event.target.value }))} />
          </label>
          <label>
            Driver
            <select
              value={batchForm.driverId}
              onChange={(event) => setBatchForm((s) => ({ ...s, driverId: Number(event.target.value) }))}
            >
              <option value={0}>Select driver</option>
              {users
                .filter((user) => (user.role === 'Dispatcher' || user.role === 'Administrator') && user.id)
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Shift Start (minutes from midnight)
            <input
              type="number"
              value={batchForm.shiftStart}
              onChange={(event) => setBatchForm((s) => ({ ...s, shiftStart: Number(event.target.value) }))}
            />
          </label>
          <label>
            Shift End (minutes from midnight)
            <input
              type="number"
              value={batchForm.shiftEnd}
              onChange={(event) => setBatchForm((s) => ({ ...s, shiftEnd: Number(event.target.value) }))}
            />
          </label>
          <label>
            Vehicle Capacity (lbs)
            <input
              type="number"
              value={batchForm.vehicleCapacityLbs}
              onChange={(event) =>
                setBatchForm((s) => ({ ...s, vehicleCapacityLbs: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            Reason (min 10)
            <textarea
              rows={3}
              value={batchForm.reason}
              onChange={(event) => setBatchForm((s) => ({ ...s, reason: event.target.value }))}
            />
          </label>
          <button className="btn" onClick={() => void createBatch()}>
            Create Batch
          </button>
        </div>
      </Modal>
    </main>
  )
}
