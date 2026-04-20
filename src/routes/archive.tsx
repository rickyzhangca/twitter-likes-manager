/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";

import { TweetMediaPreview } from "@/components/tweet-media-preview";
import { Input } from "@/components/ui/input";
import { formatDate, useWorkspace } from "@/hooks/use-workspace";

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
		<>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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

			<p className="mt-4 text-sm">
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
						<article key={tweet.id} className="border-b border-border">
							<div className="flex items-center gap-2 text-sm">
								{tweet.author.avatarUrl ? (
									<img
										src={tweet.author.avatarUrl}
										alt=""
										className="h-6 w-6 shrink-0 rounded-full object-cover"
										loading="lazy"
									/>
								) : (
									<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
										{tweet.author.displayName.charAt(0).toUpperCase()}
									</span>
								)}
								<span className="font-medium truncate">{tweet.author.displayName}</span>
								<span className="text-blue-600 truncate">@{tweet.author.username}</span>
							</div>
							<div className="mt-1 text-sm">
								<span>{tweet.state}</span>
							</div>
							<p className="mt-3 text-sm leading-6 text-foreground">
								{tweet.text}
							</p>
							<TweetMediaPreview media={tweet.media} />
							{tweet.quotedTweet && (
								<a
									href={tweet.quotedTweet.url}
									target="_blank"
									rel="noreferrer"
									className="mt-3 block rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors no-underline text-inherit"
								>
									<div className="flex items-center gap-2 text-sm mb-1">
										{tweet.quotedTweet.author.avatarUrl ? (
											<img
												src={tweet.quotedTweet.author.avatarUrl}
												alt=""
												className="h-5 w-5 shrink-0 rounded-full object-cover"
												loading="lazy"
											/>
										) : (
											<span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
												{tweet.quotedTweet.author.displayName.charAt(0).toUpperCase()}
											</span>
										)}
										<span className="font-medium truncate">{tweet.quotedTweet.author.displayName}</span>
										<span className="text-blue-600 truncate">@{tweet.quotedTweet.author.username}</span>
									</div>
									<p className="text-sm">{tweet.quotedTweet.text}</p>
									{tweet.quotedTweet.media.length > 0 && (
										<div className="mt-2">
											<TweetMediaPreview media={tweet.quotedTweet.media} />
										</div>
									)}
								</a>
							)}
							<dl className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
								<div>
									<dt>Imported</dt>
									<dd className="mt-1 text-foreground">
										{formatDate(tweet.importedAt)}
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
		</>
	);
}
