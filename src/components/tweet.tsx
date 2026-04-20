import { ChatCircleIcon, HeartIcon } from "@phosphor-icons/react";
import { format, isThisYear, isToday, isYesterday } from "date-fns";
import type { ArchiveTweetPreview } from "@/types/desktop";
import { TweetMediaPreview } from "./tweet-media-preview";

function formatTweetDate(isoString: string | null) {
	if (!isoString) return "not available";
	const date = new Date(isoString);
	if (isToday(date)) return "today";
	if (isYesterday(date)) return "yesterday";
	if (isThisYear(date)) return format(date, "MMM d");
	return format(date, "MMM d, yyyy");
}

function formatFullDate(isoString: string | null) {
	if (!isoString) return "";
	return format(new Date(isoString), "MMM d, yyyy h:mm a");
}

export const Tweet = ({ tweet }: { tweet: ArchiveTweetPreview }) => {
	return (
		<article
			key={tweet.id}
			className="p-3 border-b border-border flex flex-col gap-2"
		>
			<div className="flex items-center gap-2 text-sm">
				{tweet.author.avatarUrl ? (
					<img
						src={tweet.author.avatarUrl}
						alt=""
						className="size-6 shrink-0 rounded-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="size-6 bg-foreground opacity-30 rounded-full " />
				)}
				<span className="font-medium truncate">{tweet.author.displayName}</span>
				<span className="opacity-50">@{tweet.author.username}</span>
				<span className="opacity-50" title={formatFullDate(tweet.createdAt)}>
					{formatTweetDate(tweet.createdAt)}
				</span>
			</div>

			<div className="flex flex-col gap-4 pl-8">
				<p className="text-sm">{tweet.text}</p>
				<TweetMediaPreview media={tweet.media} />
				{tweet.quotedTweet && (
					<div className="rounded-md border border-border p-3 flex flex-col gap-2">
						<div className="flex items-center gap-2 text-sm">
							{tweet.quotedTweet.author.avatarUrl ? (
								<img
									src={tweet.quotedTweet.author.avatarUrl}
									alt=""
									className="size-5 shrink-0 rounded-full object-cover"
									loading="lazy"
								/>
							) : (
								<div className="size-5 bg-foreground opacity-30 rounded-full" />
							)}
							<span className="font-medium truncate">
								{tweet.quotedTweet.author.displayName}
							</span>
							<span className="opacity-50">
								@{tweet.quotedTweet.author.username}
							</span>
						</div>
						<div className="pl-7 flex flex-col gap-2">
							<p className="text-sm">{tweet.quotedTweet.text}</p>
							{tweet.quotedTweet.media.length > 0 && (
								<TweetMediaPreview media={tweet.quotedTweet.media} />
							)}
						</div>
					</div>
				)}

				<dl className="text-sm">
					<div className="flex items-center gap-4">
						<dd className="flex items-center gap-1">
							<ChatCircleIcon className="opacity-50" />
							<span className="translate-y-px opacity-50">
								{tweet.metrics.replies}
							</span>
						</dd>
						<dd className="flex items-center gap-1">
							<HeartIcon weight="fill" className="fill-rose-600" />
							<span className="translate-y-px text-rose-600">
								{tweet.metrics.likes}
							</span>
						</dd>
					</div>
				</dl>
			</div>
		</article>
	);
};
