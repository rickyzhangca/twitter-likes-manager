/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	defaultSyncLimit,
	formatDate,
	maxSyncLimit,
	syncTone,
	useWorkspace,
} from "@/hooks/use-workspace";

export const Route = createFileRoute("/sync")({
	component: SyncPage,
});

function SyncPage() {
	const {
		archive,
		handleStartSync,
		isStartingSync,
		setSyncLimitInput,
		syncLimitInput,
		syncState,
	} = useWorkspace();

	return (
		<div className="grid gap-6">
			<div className="flex items-start justify-between gap-4">
				<Button
					onClick={() => {
						void handleStartSync();
					}}
					disabled={!syncState.canStart || isStartingSync}
				>
					{isStartingSync
						? "Starting sync..."
						: syncState.activeRun
							? "Sync running"
							: "Start sync"}
				</Button>
			</div>

			<div className="mt-5 border border-border bg-background/80 p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<label className="grid gap-2 text-sm text-foreground">
						<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
							Sync limit
						</span>
						<input
							type="number"
							min={1}
							max={maxSyncLimit}
							step={1}
							inputMode="numeric"
							value={syncLimitInput}
							disabled={Boolean(syncState.activeRun) || isStartingSync}
							onChange={(event) => setSyncLimitInput(event.target.value)}
							className="w-full min-w-40 border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary sm:w-44"
						/>
					</label>
					<p className="max-w-xl text-xs leading-6 text-muted-foreground">
						Allowed range: 1 to {maxSyncLimit}. Default: {defaultSyncLimit}.
					</p>
				</div>
			</div>

			<div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="border border-border bg-background/80 p-4">
					<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Active run
					</p>
					{syncState.activeRun ? (
						<div className={`mt-4 border p-4 ${syncTone(syncState.activeRun)}`}>
							<div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em]">
								<span>{syncState.activeRun.phase}</span>
								<span>{syncState.activeRun.status}</span>
							</div>
							<p className="mt-3 text-sm leading-6 text-foreground">
								{syncState.activeRun.message}
							</p>
							<dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
								<div>
									<dt>Started</dt>
									<dd className="mt-1 text-foreground">
										{formatDate(syncState.activeRun.startedAt)}
									</dd>
								</div>
								<div>
									<dt>Imported</dt>
									<dd className="mt-1 text-foreground">
										{syncState.activeRun.importedCount} rows
									</dd>
								</div>
								<div>
									<dt>Scanned</dt>
									<dd className="mt-1 text-foreground">
										{syncState.activeRun.scannedCount} likes
									</dd>
								</div>
								<div>
									<dt>Source</dt>
									<dd className="mt-1 text-foreground">
										{syncState.activeRun.source}
									</dd>
								</div>
							</dl>
						</div>
					) : (
						<p className="mt-4 text-sm leading-6 text-muted-foreground">
							No sync is running. Starting one now opens the persistent browser
							profile and waits for an authenticated X session before capture.
						</p>
					)}
				</div>

				<div className="border border-border bg-background/80 p-4">
					<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Recent runs
					</p>
					{syncState.recentRuns.length === 0 ? (
						<p className="mt-4 text-sm leading-6 text-muted-foreground">
							No runs recorded yet. The first manual run will be stored in the
							local archive database.
						</p>
					) : (
						<div className="mt-4 grid gap-3">
							{syncState.recentRuns.map((run) => (
								<article key={run.id} className={`border p-3 ${syncTone(run)}`}>
									<div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em]">
										<span>{run.phase}</span>
										<span>{run.status}</span>
									</div>
									<p className="mt-2 text-sm leading-6 text-foreground">
										{run.message}
									</p>
									<p className="mt-2 text-xs text-muted-foreground">
										{formatDate(run.startedAt)} · {run.scannedCount} scanned ·{" "}
										{run.importedCount} imported
									</p>
								</article>
							))}
						</div>
					)}
				</div>
			</div>

			<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
				Local archive
			</p>
			<div className="mt-5 grid gap-3 sm:grid-cols-3">
				<div className="border border-border bg-background/80 p-4">
					<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Tweets
					</p>
					<p className="mt-3 text-2xl text-foreground">
						{archive.stats.tweetCount}
					</p>
				</div>
				<div className="border border-border bg-background/80 p-4">
					<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Authors
					</p>
					<p className="mt-3 text-2xl text-foreground">
						{archive.stats.authorCount}
					</p>
				</div>
				<div className="border border-border bg-background/80 p-4">
					<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Media
					</p>
					<p className="mt-3 text-2xl text-foreground">
						{archive.stats.mediaCount}
					</p>
				</div>
			</div>
			<p className="mt-4 text-sm text-muted-foreground">
				Latest liked tweet saved: {formatDate(archive.stats.latestLikedAt)}
			</p>
		</div>
	);
}
