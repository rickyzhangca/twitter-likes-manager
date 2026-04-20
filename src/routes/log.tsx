/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";

import {
	formatDate,
	serviceTone,
	syncTone,
	useWorkspace,
} from "@/hooks/use-workspace";

export const Route = createFileRoute("/log")({
	component: LogPage,
});

function LogPage() {
	const { appState, archive, syncState } = useWorkspace();

	return (
		<div className="grid gap-6">
			<section className="border border-border bg-card p-4">
				<div className="flex items-baseline justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
							Process split
						</p>
						<h2 className="mt-2 text-xl font-medium">Desktop services</h2>
					</div>
					<p className="text-xs text-muted-foreground">Secure preload bridge</p>
				</div>

				<div className="mt-5 grid gap-3">
					{appState.services.map((service) => (
						<article
							key={service.id}
							className={`border p-4 transition-colors ${serviceTone(service)}`}
						>
							<div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em]">
								<span>{service.label}</span>
								<span>{service.status}</span>
							</div>
							<p className="mt-3 text-sm leading-6">{service.detail}</p>
						</article>
					))}
				</div>

				<div className="mt-4 border border-border bg-background/80 p-4 text-sm leading-6 text-muted-foreground">
					<p className="text-foreground">Archive database</p>
					<p className="mt-2 break-all">
						{archive.databasePath ?? "No database yet"}
					</p>
				</div>
			</section>

			<section className="border border-border bg-background/80 p-4">
				<div className="grid gap-2">
					<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-xs">
						<p className="text-sidebar-foreground/70">Archive rows</p>
						<p className="mt-1 font-medium text-sidebar-foreground">
							{archive.stats.tweetCount} tweets
						</p>
					</div>
					<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-xs">
						<p className="text-sidebar-foreground/70">Sync state</p>
						<p className="mt-1 font-medium text-sidebar-foreground">
							{syncState.activeRun
								? `${syncState.activeRun.importedCount} imported`
								: "Idle"}
						</p>
					</div>
					<div className="border border-sidebar-border bg-sidebar-accent/20 p-3 text-xs">
						<p className="text-sidebar-foreground/70">Recent runs</p>
						<p className="mt-1 font-medium text-sidebar-foreground">
							{syncState.recentRuns.length} stored
						</p>
					</div>
				</div>
			</section>

			<section className="border border-border bg-background/80 p-4">
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
			</section>
		</div>
	);
}
