import {
	ChatCircleIcon,
	HeartIcon,
	PlusIcon,
	TagIcon,
} from "@phosphor-icons/react";
import { format, isThisYear, isToday, isYesterday } from "date-fns";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import type { ArchiveTweetPreview } from "@/types/desktop";
import { TweetMediaPreview } from "./tweet-media-preview";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

function formatTweetDate(isoString: string | null) {
	if (!isoString) return "not available";
	const date = new Date(isoString);
	if (isToday(date)) return "Today";
	if (isYesterday(date)) return "Yesterday";
	if (isThisYear(date)) return format(date, "MMM d");
	return format(date, "MMM d, yyyy");
}

function formatFullDate(isoString: string | null) {
	if (!isoString) return "";
	return format(new Date(isoString), "MMM d, yyyy h:mm a");
}

function normalizeTweetTags(tags: string[]) {
	return [
		...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
	];
}

function TweetTagEditor({ tweet }: { tweet: ArchiveTweetPreview }) {
	const { archive, handleSaveTweetTags } = useWorkspace();
	const [draftTags, setDraftTags] = useState(() => tweet.tags);
	const [isOpen, setIsOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [newTagInput, setNewTagInput] = useState("");
	const availableTags = useMemo(
		() =>
			Array.from(
				new Set([...archive.tags.map((tag) => tag.name), ...tweet.tags]),
			).sort((left, right) => left.localeCompare(right)),
		[archive.tags, tweet.tags],
	);
	const normalizedDraftTags = normalizeTweetTags(draftTags);
	const normalizedNewTag = newTagInput.trim().toLowerCase();
	const canAddNewTag =
		!isSaving &&
		normalizedNewTag.length > 0 &&
		!normalizedDraftTags.includes(normalizedNewTag);

	function handleOpenChange(open: boolean) {
		setIsOpen(open);

		if (!open) {
			setDraftTags(tweet.tags);
			setNewTagInput("");
		}
	}

	async function persistTags(nextTags: string[]) {
		const normalizedTags = normalizeTweetTags(nextTags);

		setDraftTags(normalizedTags);
		setIsSaving(true);

		try {
			await handleSaveTweetTags(tweet.id, normalizedTags);
		} catch {
			setDraftTags(tweet.tags);
		} finally {
			setIsSaving(false);
		}
	}

	function toggleDraftTag(tagName: string) {
		if (isSaving) {
			return;
		}

		const nextTags = normalizedDraftTags.includes(tagName)
			? normalizedDraftTags.filter((tag) => tag !== tagName)
			: [...normalizedDraftTags, tagName];

		void persistTags(nextTags);
	}

	function handleAddNewTag() {
		if (!canAddNewTag) {
			return;
		}

		void persistTags([...normalizedDraftTags, normalizedNewTag]);
		setNewTagInput("");
	}

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				render={
					<Badge variant="outline" onClick={handleAddNewTag}>
						<PlusIcon />
					</Badge>
				}
			>
				<TagIcon />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap gap-1">
						{availableTags.length > 0 ? (
							availableTags.map((tagName) => {
								const isSelected = normalizedDraftTags.includes(tagName);

								return (
									<button
										key={tagName}
										type="button"
										onClick={() => toggleDraftTag(tagName)}
										className="cursor-pointer disabled:cursor-wait"
										disabled={isSaving}
									>
										<Badge variant={isSelected ? "default" : "outline"}>
											{tagName}
										</Badge>
									</button>
								);
							})
						) : (
							<p className="text-xs text-muted-foreground">
								No tags yet. Create the first one below.
							</p>
						)}
					</div>

					<div className="flex gap-2 items-center">
						<Input
							value={newTagInput}
							onChange={(event) => setNewTagInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									handleAddNewTag();
								}
							}}
							placeholder="Add a tag"
							autoComplete="off"
							disabled={isSaving}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={handleAddNewTag}
							disabled={!canAddNewTag}
						>
							Add
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export const Tweet = ({ tweet }: { tweet: ArchiveTweetPreview }) => {
	const canEditTags = Boolean(window.twitterLikesDesktop);

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
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger className="opacity-50 cursor-default">
							{formatTweetDate(tweet.createdAt)}
						</TooltipTrigger>
						<TooltipContent>{formatFullDate(tweet.createdAt)}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<div className="flex flex-col gap-3 pl-8">
				<p className="text-sm">{tweet.text}</p>
				{(tweet.tags.length > 0 || canEditTags) && (
					<div className="flex flex-wrap items-center gap-1 pb-1">
						{tweet.tags.map((tag) => (
							<Badge key={tag} variant="outline">
								{tag}
							</Badge>
						))}
						{canEditTags ? <TweetTagEditor tweet={tweet} /> : null}
					</div>
				)}
				<TweetMediaPreview media={tweet.media} />
				{tweet.quotedTweet && (
					<div className="rounded-2xl border border-border p-3 flex flex-col gap-2">
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
