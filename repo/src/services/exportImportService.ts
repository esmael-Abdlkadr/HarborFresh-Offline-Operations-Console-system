import { financeService } from './financeService.ts'

export const exportImportService = {
  exportDataset: financeService.exportDataset,
  importDataset: financeService.importDataset,
}
