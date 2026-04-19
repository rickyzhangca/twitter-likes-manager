import { randomUUID } from "node:crypto";
import path from "node:path";

import type { SyncState } from "../src/types/desktop";
import type { ArchiveStore } from "./archive-store";
import { PlaywrightSync } from "./playwright-sync";

export class SyncService {
	private readonly archiveStore: ArchiveStore;
	private readonly playwrightSync: PlaywrightSync;
	private activeRunId: string | null = null;

	constructor(archiveStore: ArchiveStore) {
		this.archiveStore = archiveStore;
		this.playwrightSync = new PlaywrightSync({
			profileDirectory: path.join(
				this.archiveStore.dataDirectory,
				"playwright-profile",
			),
			captureDirectory: path.join(
				this.archiveStore.dataDirectory,
				"sync-captures",
			),
		});
	}

	getSyncState(): SyncState {
		const activeRun = this.activeRunId
			? this.archiveStore.getSyncRun(this.activeRunId)
			: null;

		if (!activeRun && this.activeRunId) {
			this.activeRunId = null;
		}

		return {
			canStart: !activeRun,
			activeRun,
			recentRuns: this.archiveStore.listSyncRuns(),
		};
	}

	startSync(): SyncState {
		const currentState = this.getSyncState();

		if (currentState.activeRun) {
			return currentState;
		}

		const startedAt = new Date().toISOString();
		const run = this.archiveStore.createSyncRun({
			id: randomUUID(),
			status: "running",
			phase: "launching-profile",
			source: "manual",
			startedAt,
			finishedAt: null,
			scannedCount: 0,
			importedCount: 0,
			message: "Preparing the Playwright capture session.",
		});

		this.activeRunId = run.id;
		console.log(`[sync] started run ${run.id}`);
		void this.runPlaywrightSync(run.id);

		return this.getSyncState();
	}

	private async runPlaywrightSync(runId: string) {
		try {
			const captureResult = await this.playwrightSync.run((progress) => {
				console.log(
					`[sync] ${runId} ${progress.phase}: ${progress.message} (${progress.scannedCount} scanned, ${progress.importedCount} imported)`,
				);
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase: progress.phase,
					scannedCount: progress.scannedCount,
					importedCount: progress.importedCount,
					message: progress.message,
				});
			});

			let result = captureResult;

			if (captureResult.artifactPath) {
				const message =
					"Normalizing captured Likes responses into the local archive.";

				console.log(`[sync] ${runId} normalizing-results: ${message}`);
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase: "normalizing-results",
					scannedCount: captureResult.scannedCount,
					importedCount: 0,
					message,
				});

				const importResult = this.archiveStore.importLikesCapture(
					captureResult.artifactPath,
				);

				result = {
					...captureResult,
					scannedCount: importResult.scannedCount,
					importedCount: importResult.importedCount,
					message: importResult.importedCount
						? `Imported ${importResult.importedCount} liked tweets from ${importResult.likesResponseCount} captured Likes response${importResult.likesResponseCount === 1 ? "" : "s"}.`
						: captureResult.message,
				};
			}

			this.archiveStore.updateSyncRun(runId, {
				status: "completed",
				phase: result.phase,
				finishedAt: new Date().toISOString(),
				scannedCount: result.scannedCount,
				importedCount: result.importedCount,
				message: result.message,
			});
			console.log(
				`[sync] ${runId} completed: ${result.message} (${result.scannedCount} scanned, ${result.importedCount} imported)`,
			);
		} catch (error) {
			await this.playwrightSync.dispose().catch(() => undefined);

			const message =
				error instanceof Error ? error.message : "Unknown sync failure";
			console.error(`[sync] ${runId} failed: ${message}`);

			this.archiveStore.updateSyncRun(runId, {
				status: "failed",
				phase: "failed",
				finishedAt: new Date().toISOString(),
				message,
			});
		} finally {
			console.log(`[sync] finished run ${runId}`);
			this.activeRunId = null;
		}
	}
}
