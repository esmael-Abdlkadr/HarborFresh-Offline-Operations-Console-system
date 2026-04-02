import type { ReactNode } from 'react'

interface TableProps {
  headers: string[]
  rows: ReactNode[][]
}

export function Table({ headers, rows }: TableProps) {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.5rem' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`r-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`c-${rowIndex}-${cellIndex}`} style={{ padding: '0.5rem' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
