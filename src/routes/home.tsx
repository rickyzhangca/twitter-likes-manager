/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";
import { Tweet } from "@/components/tweet";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/home")({
	component: Home,
});

function Home() {
	const archiveSearchInputId = useId().replace(/:/g, "");
	const {
		archive,
		archiveSearchInput,
		deferredArchiveSearch,
		isLoadingArchive,
		setArchiveSearchInput,
	} = useWorkspace();

	return (
		<div className="flex flex-col max-w-150 mx-auto">
			<div className="flex flex-col">
				<label
					htmlFor={archiveSearchInputId}
					className="grid gap-2 text-sm text-foreground lg:w-80"
				>
					<span className="text-sm">Search local archive</span>
					<Input
						id={archiveSearchInputId}
						value={archiveSearchInput}
						onChange={(event) => setArchiveSearchInput(event.target.value)}
						placeholder="@username, display name, or tweet text"
						autoComplete="off"
					/>
				</label>
			</div>

			<p className="text-sm">
				{deferredArchiveSearch
					? `Showing ${archive.tweets.length} match${archive.tweets.length === 1 ? "" : "es"} for "${deferredArchiveSearch}".`
					: `Showing the most recent ${archive.tweets.length} archived tweet${archive.tweets.length === 1 ? "" : "s"}.`}
			</p>

			{isLoadingArchive && archive.tweets.length > 0 ? (
				<p className="mt-3 text-sm text-muted-foreground">
					Refreshing archive results...
				</p>
			) : null}

			{isLoadingArchive && archive.tweets.length === 0 ? (
				<p className="mt-5 text-sm text-muted-foreground">
					{deferredArchiveSearch
						? "Searching archive..."
						: "Loading archive..."}
				</p>
			) : archive.tweets.length === 0 ? (
				<div className="mt-5 border border-border bg-background/80 p-4">
					<p className="text-sm text-muted-foreground">
						{deferredArchiveSearch
							? `No archived tweets matched "${deferredArchiveSearch}".`
							: "No archive rows yet. Start a sync to capture Likes from X into the local archive."}
					</p>
				</div>
			) : (
				<div className="flex flex-col border border-border">
					{archive.tweets.map((tweet) => (
						<Tweet key={tweet.id} tweet={tweet} />
					))}
				</div>
			)}
		</div>
	);
}
