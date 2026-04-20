/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";

import { TweetMediaPreview } from "@/components/tweet-media-preview";
import { Input } from "@/components/ui/input";
import { formatDate, stateTone, useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/archive")({
	component: ArchivePage,
});

function ArchivePage() {
	const archiveSearchInputId = useId().replace(/:/g, "");
	const {
		archive,
		archiveSearchInput,
		deferredArchiveSearch,
		isLoadingArchive,
		setArchiveSearchInput,
	} = useWorkspace();

	return (
		<div className="border border-border bg-card p-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
						Archive viewer
					</p>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						Search the local archive by tweet text, username, or display name.
					</p>
				</div>
				<label
					htmlFor={archiveSearchInputId}
					className="grid gap-2 text-sm text-foreground lg:w-80"
				>
					<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
						Search local archive
					</span>
					<Input
						id={archiveSearchInputId}
						value={archiveSearchInput}
						onChange={(event) => setArchiveSearchInput(event.target.value)}
						placeholder="@username, display name, or tweet text"
						autoComplete="off"
					/>
				</label>
			</div>

			<p className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
				<div className="mt-5 grid gap-4">
					{archive.tweets.map((tweet) => (
						<article
							key={tweet.id}
							className={`border p-4 ${stateTone(tweet)}`}
						>
							<div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.2em]">
								<span>@{tweet.author.username}</span>
								<span>{tweet.state}</span>
							</div>
							<p className="mt-3 text-sm leading-6 text-foreground">
								{tweet.text}
							</p>
							<TweetMediaPreview media={tweet.media} />
							<dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
								<div>
									<dt>Liked</dt>
									<dd className="mt-1 text-foreground">
										{formatDate(tweet.likedAt)}
									</dd>
								</div>
								<div>
									<dt>Created</dt>
									<dd className="mt-1 text-foreground">
										{formatDate(tweet.createdAt)}
									</dd>
								</div>
								<div>
									<dt>Metrics</dt>
									<dd className="mt-1 text-foreground">
										{tweet.metrics.likes} likes, {tweet.metrics.replies} replies
									</dd>
								</div>
								<div>
									<dt>Media</dt>
									<dd className="mt-1 text-foreground">
										{tweet.metrics.mediaCount} attached item(s)
									</dd>
								</div>
							</dl>
						</article>
					))}
				</div>
			)}
		</div>
	);
}
