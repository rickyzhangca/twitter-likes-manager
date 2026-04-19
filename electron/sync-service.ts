import { randomUUID } from "node:crypto"

import type { SyncState } from "../src/types/desktop"
import { ArchiveStore } from "./archive-store"

type SyncStep = {
  phase: SyncState["activeRun"] extends infer ActiveRun
    ? ActiveRun extends { phase: infer Phase }
      ? Phase
      : never
    : never
  message: string
  scannedCount: number
  importedCount: number
  delayMs: number
}

const syncSteps: SyncStep[] = [
  {
    phase: "launching-profile",
    message: "Opening the persistent browser profile for the next capture worker.",
    scannedCount: 0,
    importedCount: 0,
    delayMs: 900,
  },
  {
    phase: "checking-session",
    message: "Checking whether the signed-in X session is already available.",
    scannedCount: 0,
    importedCount: 0,
    delayMs: 1100,
  },
  {
    phase: "capturing-likes",
    message: "Simulating a first pass over the Likes timeline through the orchestration boundary.",
    scannedCount: 18,
    importedCount: 6,
    delayMs: 1400,
  },
  {
    phase: "normalizing-results",
    message: "Normalizing captured rows into the local archive schema.",
    scannedCount: 26,
    importedCount: 9,
    delayMs: 900,
  },
]

export class SyncService {
  private readonly archiveStore: ArchiveStore
  private activeRunId: string | null = null

  constructor(archiveStore: ArchiveStore) {
    this.archiveStore = archiveStore
  }

  getSyncState(): SyncState {
    const activeRun = this.activeRunId
      ? this.archiveStore.getSyncRun(this.activeRunId)
      : null

    if (!activeRun && this.activeRunId) {
      this.activeRunId = null
    }

    return {
      canStart: !activeRun,
      activeRun,
      recentRuns: this.archiveStore.listSyncRuns(),
    }
  }

  startSync(): SyncState {
    const currentState = this.getSyncState()

    if (currentState.activeRun) {
      return currentState
    }

    const startedAt = new Date().toISOString()
    const run = this.archiveStore.createSyncRun({
      id: randomUUID(),
      status: "running",
      phase: "launching-profile",
      source: "manual",
      startedAt,
      finishedAt: null,
      scannedCount: 0,
      importedCount: 0,
      message: "Preparing the sync orchestration loop.",
    })

    this.activeRunId = run.id
    this.advanceSync(run.id, 0)

    return this.getSyncState()
  }

  private advanceSync(runId: string, stepIndex: number) {
    const step = syncSteps[stepIndex]

    if (!step) {
      this.archiveStore.updateSyncRun(runId, {
        status: "completed",
        phase: "completed",
        finishedAt: new Date().toISOString(),
        scannedCount: 26,
        importedCount: 9,
        message:
          "Sync orchestration finished. The next slice will swap this simulated flow for a Playwright-backed capture worker.",
      })
      this.activeRunId = null
      return
    }

    this.archiveStore.updateSyncRun(runId, {
      status: "running",
      phase: step.phase,
      scannedCount: step.scannedCount,
      importedCount: step.importedCount,
      message: step.message,
    })

    setTimeout(() => {
      this.advanceSync(runId, stepIndex + 1)
    }, step.delayMs)
  }
}