import { randomUUID } from "node:crypto";
import path from "node:path";

import type { SyncRun, SyncStartOptions, SyncState } from "../src/types/desktop";
import type { ArchiveStore } from "./archive-store";
import { MediaDownloader } from "./media-downloader";
import { PlaywrightSync } from "./playwright-sync";

export class SyncService {
	private readonly archiveStore: ArchiveStore;
	private readonly playwrightSync: PlaywrightSync;
	private readonly mediaDownloader: MediaDownloader;
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
		this.mediaDownloader = new MediaDownloader(this.archiveStore.mediaDirectory);
	}

	getSyncState(): SyncState {
		const activeRun = this.activeRunId
			? this.archiveStore.getSyncRun(this.activeRunId)
			: null;

		if (!activeRun && this.activeRunId) {
			this.activeRunId = null;
		}

		const resumableRun = activeRun
			? null
			: this.archiveStore.getLatestResumableRun();

		return {
			canStart: !activeRun,
			activeRun,
			resumableRun,
			recentRuns: this.archiveStore.listSyncRuns(),
		};
	}

	startSync(options?: SyncStartOptions): SyncState {
		const currentState = this.getSyncState();

		if (currentState.activeRun) {
			return currentState;
		}

		const normalizedOptions = normalizeSyncStartOptions(options);

		const startedAt = new Date().toISOString();
		const run = this.archiveStore.createSyncRun({
			...createSyncRunRecord({
				id: randomUUID(),
				startedAt,
				phase: "launching-profile",
				message: `Preparing the Playwright capture session for up to ${normalizedOptions.maxTweets} liked tweets.`,
			}),
		});
		this.archiveStore.createSyncCheckpoint(run.id, normalizedOptions.maxTweets);

		this.activeRunId = run.id;
		console.log(`[sync] started run ${run.id}`);
		void this.runSync(run.id, normalizedOptions);

		return this.getSyncState();
	}

	resumeSync(): SyncState {
		const currentState = this.getSyncState();

		if (currentState.activeRun || !currentState.resumableRun) {
			return currentState;
		}

		const checkpoint = this.archiveStore.getSyncCheckpoint(
			currentState.resumableRun.id,
		);

		if (!checkpoint?.resumableFromPhase) {
			return currentState;
		}

		this.activeRunId = currentState.resumableRun.id;
		this.archiveStore.updateSyncRun(currentState.resumableRun.id, {
			status: "running",
			phase: checkpoint.resumableFromPhase,
			finishedAt: null,
			message: formatResumeMessage(
				checkpoint.resumableFromPhase,
				currentState.resumableRun,
			),
		});

		console.log(`[sync] resuming run ${currentState.resumableRun.id}`);
		void this.runSync(currentState.resumableRun.id, {
			maxTweets: checkpoint.maxTweets,
		});

		return this.getSyncState();
	}

	retryFailedMediaForRun(runId: string): SyncState {
		const currentState = this.getSyncState();

		if (currentState.activeRun) {
			return currentState;
		}

		const run = this.archiveStore.getSyncRun(runId);
		const checkpoint = this.archiveStore.getSyncCheckpoint(runId);

		if (!run || !checkpoint || run.failedMediaCount === 0) {
			return currentState;
		}

		this.archiveStore.updateSyncCheckpoint(runId, {
			resumableFromPhase: "downloading-media",
			downloadCompletedAt: null,
		});
		this.archiveStore.updateSyncRun(runId, {
			status: "running",
			phase: "downloading-media",
			finishedAt: null,
			message: `Retrying ${run.failedMediaCount} failed media download${run.failedMediaCount === 1 ? "" : "s"}.`,
		});

		this.activeRunId = runId;
		console.log(`[sync] retrying failed media for run ${runId}`);
		void this.runSync(runId, { maxTweets: checkpoint.maxTweets });

		return this.getSyncState();
	}

	private async runSync(
		runId: string,
		options: Required<SyncStartOptions>,
	) {
		try {
			let checkpoint = this.archiveStore.getSyncCheckpoint(runId);

			if (!checkpoint) {
				checkpoint = this.archiveStore.createSyncCheckpoint(
					runId,
					options.maxTweets,
				);
			}

			if (!checkpoint) {
				throw new Error(`Sync checkpoint for run ${runId} could not be created`);
			}
			let currentRun = this.archiveStore.getSyncRun(runId);

			if (!currentRun) {
				throw new Error(`Sync run ${runId} does not exist`);
			}

			let importResult:
				| {
						scannedCount: number;
						importedCount: number;
						mediaCount: number;
						likesResponseCount: number;
				  }
				| null = null;

			if (!checkpoint.captureCompletedAt || !checkpoint.captureArtifactPath) {
				const captureResult = await this.playwrightSync.run(options, (progress) => {
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

				if (!captureResult.artifactPath) {
					this.archiveStore.updateSyncCheckpoint(runId, {
						resumableFromPhase: null,
					});
					this.archiveStore.updateSyncRun(runId, {
						status: "completed",
						phase: captureResult.phase,
						finishedAt: new Date().toISOString(),
						scannedCount: captureResult.scannedCount,
						importedCount: captureResult.importedCount,
						message: captureResult.message,
					});
					console.log(`[sync] ${runId} completed: ${captureResult.message}`);
					return;
				}

				this.archiveStore.updateSyncCheckpoint(runId, {
					captureArtifactPath: captureResult.artifactPath,
					captureCompletedAt: new Date().toISOString(),
					resumableFromPhase: "normalizing-results",
				});
			}

			const nextCheckpoint = this.archiveStore.getSyncCheckpoint(runId);

			if (!nextCheckpoint?.captureArtifactPath) {
				throw new Error(`Sync run ${runId} is missing a capture artifact`);
			}

			if (!nextCheckpoint.importCompletedAt) {
				const message =
					"Normalizing captured Likes responses into the local archive.";

				console.log(`[sync] ${runId} normalizing-results: ${message}`);
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase: "normalizing-results",
					message,
				});

				importResult = this.archiveStore.importLikesCapture(
					nextCheckpoint.captureArtifactPath,
					options.maxTweets,
				);
				const pendingMedia = this.archiveStore.listMediaPendingDownload();
				this.archiveStore.createOrRefreshMediaDownloadJobs(runId, pendingMedia);
				this.archiveStore.updateSyncCheckpoint(runId, {
					importCompletedAt: new Date().toISOString(),
					resumableFromPhase:
						pendingMedia.length > 0 ? "downloading-media" : null,
					downloadCompletedAt:
						pendingMedia.length === 0 ? new Date().toISOString() : null,
				});
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase:
						pendingMedia.length > 0 ? "downloading-media" : "completed",
					scannedCount: importResult.scannedCount,
					importedCount: importResult.importedCount,
					message:
						pendingMedia.length > 0
							? `Downloading ${pendingMedia.length} media file${pendingMedia.length === 1 ? "" : "s"} for offline archive viewing.`
							: formatCompletionMessage(
									importResult,
									{ downloadedCount: 0, failedCount: 0 },
									options.maxTweets,
								),
					});
			}

			currentRun = this.archiveStore.getSyncRun(runId);

			if (!currentRun) {
				throw new Error(`Sync run ${runId} disappeared during execution`);
			}

			const pendingJobs = this.archiveStore.listMediaDownloadJobs(runId, [
				"pending",
				"failed",
				"downloading",
			]);

			if (pendingJobs.length > 0) {
				const message = `Downloading ${pendingJobs.length} media file${pendingJobs.length === 1 ? "" : "s"} for offline archive viewing.`;

				console.log(`[sync] ${runId} downloading-media: ${message}`);
				this.archiveStore.updateSyncRun(runId, {
					status: "running",
					phase: "downloading-media",
					message,
				});

				await this.mediaDownloader.downloadAll(
					pendingJobs.map((job) => ({
						id: job.mediaId,
						kind: job.kind,
						remoteUrl: job.remoteUrl,
					})),
					{
						onAttemptStart: (item) => {
							this.archiveStore.markMediaDownloadStarted(runId, item.id);
						},
						onAttemptFailure: (item, _attemptCount, errorMessage) => {
							this.archiveStore.markMediaDownloadFailed(
								runId,
								item.id,
								errorMessage,
							);
						},
						onDownloadSuccess: (item, download) => {
							if (download.localPath) {
								this.archiveStore.markMediaDownloaded(
									runId,
									item.id,
									download.localPath,
								);
							}
						},
					},
				);
			}

			const downloadProgress = this.archiveStore.summarizeMediaDownloadJobs(runId);
			const hasRetryableMedia = Boolean(
				downloadProgress && downloadProgress.failedCount > 0,
			);
			this.archiveStore.updateSyncCheckpoint(runId, {
				resumableFromPhase: hasRetryableMedia ? "downloading-media" : null,
				downloadCompletedAt: hasRetryableMedia ? null : new Date().toISOString(),
			});

			currentRun = this.archiveStore.getSyncRun(runId);

			if (!currentRun) {
				throw new Error(`Sync run ${runId} disappeared before completion`);
			}

			const completionMessage = importResult
				? formatCompletionMessage(
						importResult,
						{
							downloadedCount: downloadProgress?.completedCount ?? 0,
							failedCount: downloadProgress?.failedCount ?? 0,
						},
						options.maxTweets,
					)
				: formatResumedCompletionMessage(currentRun, options.maxTweets);

			this.archiveStore.updateSyncRun(runId, {
				status: "completed",
				phase: "completed",
				finishedAt: new Date().toISOString(),
				message: completionMessage,
			});
			console.log(`[sync] ${runId} completed: ${completionMessage}`);
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

function createSyncRunRecord({
	id,
	startedAt,
	phase,
	message,
}: {
	id: string;
	startedAt: string;
	phase: SyncRun["phase"];
	message: string;
}): SyncRun {
	return {
		id,
		status: "running",
		phase,
		source: "manual",
		startedAt,
		finishedAt: null,
		scannedCount: 0,
		importedCount: 0,
		message,
		hasResumableCheckpoint: false,
		resumableFromPhase: null,
		failedMediaCount: 0,
		retryableMediaCount: 0,
		downloadProgress: null,
	};
}

function formatCompletionMessage(
	importResult: {
		importedCount: number;
		likesResponseCount: number;
		mediaCount: number;
	},
	mediaDownloadSummary: {
		downloadedCount: number;
		failedCount: number;
	},
	maxTweets: number,
) {
	const baseMessage = `Imported ${importResult.importedCount} liked tweets (limit ${maxTweets}) from ${importResult.likesResponseCount} captured Likes response${importResult.likesResponseCount === 1 ? "" : "s"}.`;

	if (importResult.mediaCount === 0) {
		return `${baseMessage} No media attachments were found in this batch.`;
	}

	if (
		mediaDownloadSummary.downloadedCount === 0 &&
		mediaDownloadSummary.failedCount === 0
	) {
		return `${baseMessage} Imported ${importResult.mediaCount} media attachment${importResult.mediaCount === 1 ? "" : "s"}.`;
	}

	if (mediaDownloadSummary.failedCount === 0) {
		return `${baseMessage} Downloaded ${mediaDownloadSummary.downloadedCount} media file${mediaDownloadSummary.downloadedCount === 1 ? "" : "s"} for offline viewing.`;
	}

	return `${baseMessage} Downloaded ${mediaDownloadSummary.downloadedCount} media file${mediaDownloadSummary.downloadedCount === 1 ? "" : "s"}; ${mediaDownloadSummary.failedCount} still need retry.`;
}

function formatResumeMessage(phase: SyncRun["phase"], run: SyncRun) {
	if (phase === "normalizing-results") {
		return "Resuming the import step from the saved Likes capture artifact.";
	}

	if (phase === "downloading-media") {
		return run.failedMediaCount > 0
			? `Resuming ${run.failedMediaCount} failed media download${run.failedMediaCount === 1 ? "" : "s"}.`
			: "Resuming offline media downloads from the saved checkpoint.";
	}

	return "Resuming the saved sync checkpoint.";
}

function formatResumedCompletionMessage(run: SyncRun, maxTweets: number) {
	const baseMessage = `Imported ${run.importedCount} liked tweets (limit ${maxTweets}).`;

	if (!run.downloadProgress) {
		return baseMessage;
	}

	if (run.downloadProgress.failedCount === 0) {
		return `${baseMessage} Downloaded ${run.downloadProgress.completedCount} media file${run.downloadProgress.completedCount === 1 ? "" : "s"} for offline viewing.`;
	}

	return `${baseMessage} Downloaded ${run.downloadProgress.completedCount} media file${run.downloadProgress.completedCount === 1 ? "" : "s"}; ${run.downloadProgress.failedCount} still need retry.`;
}

function normalizeSyncStartOptions(options?: SyncStartOptions) {
	const requestedLimit = options?.maxTweets;
	const maxTweets =
		typeof requestedLimit === "number" && Number.isFinite(requestedLimit)
			? Math.min(1000, Math.max(1, Math.trunc(requestedLimit)))
			: 200;

	return { maxTweets };
}
