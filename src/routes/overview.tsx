/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { serviceTone, useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/overview")({
	component: OverviewPage,
});

function OverviewPage() {
	const { appState, archive, handleOpenDataDirectory, isOpeningDataDir } =
		useWorkspace();

	return (
		<div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
			<div className="border border-border bg-card/80 p-6 backdrop-blur lg:p-8">
				<div className="space-y-5">
					<div className="flex flex-wrap gap-3">
						<Button
							onClick={() => {
								void handleOpenDataDirectory();
							}}
							disabled={isOpeningDataDir}
						>
							{isOpeningDataDir
								? "Opening data directory..."
								: "Open data directory"}
						</Button>
					</div>
				</div>
			</div>

			<div className="grid gap-4 text-sm">
				<section className="border border-border bg-card p-4">
					<div className="flex items-baseline justify-between gap-4">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
								Process split
							</p>
							<h2 className="mt-2 text-xl font-medium">Desktop services</h2>
						</div>
						<p className="text-xs text-muted-foreground">
							Secure preload bridge
						</p>
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

				<div className="flex items-center justify-between gap-3">
					<dt>Data directory</dt>
					<dd className="max-w-56 truncate text-right">
						{appState.dataDirectory ?? "not attached"}
					</dd>
				</div>
			</div>
		</div>
	);
}
