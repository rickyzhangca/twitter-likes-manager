/* eslint-disable react-refresh/only-export-components */

import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Tweet } from "@/components/tweet";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { useWorkspace } from "@/hooks/use-workspace";

type HomeSearch = {
	page: number;
	tags?: string;
};

export const Route = createFileRoute("/home")({
	validateSearch: (search: Record<string, unknown>): HomeSearch => ({
		page: Number(search?.page ?? 1) || 1,
		tags: serializeHomeTags(parseHomeTags(search?.tags)),
	}),
	component: Home,
});

function TweetPagination({
	currentPage,
	totalPages,
	onPageChange,
}: {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}) {
	if (totalPages <= 1) return null;

	const pages: Array<number | "ellipsis"> = [];
	for (let i = 1; i <= totalPages; i++) {
		if (
			i === 1 ||
			i === totalPages ||
			(i >= currentPage - 1 && i <= currentPage + 1)
		) {
			pages.push(i);
		} else if (pages[pages.length - 1] !== "ellipsis") {
			pages.push("ellipsis");
		}
	}

	return (
		<Pagination className="py-2">
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						onClick={() => onPageChange(currentPage - 1)}
						aria-disabled={currentPage <= 1}
						className={
							currentPage <= 1
								? "pointer-events-none opacity-50"
								: "cursor-pointer"
						}
					/>
				</PaginationItem>
				{pages.map((page, index) =>
					page === "ellipsis" ? (
						<PaginationItem
							key={`ellipsis-${pages[index - 1] ?? "start"}-${pages[index + 1] ?? "end"}`}
						>
							<PaginationEllipsis />
						</PaginationItem>
					) : (
						<PaginationItem key={page}>
							<PaginationLink
								onClick={() => onPageChange(page)}
								isActive={page === currentPage}
								className="cursor-pointer"
							>
								{page}
							</PaginationLink>
						</PaginationItem>
					),
				)}
				<PaginationItem>
					<PaginationNext
						onClick={() => onPageChange(currentPage + 1)}
						aria-disabled={currentPage >= totalPages}
						className={
							currentPage >= totalPages
								? "pointer-events-none opacity-50"
								: "cursor-pointer"
						}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

function Home() {
	const archiveSearchInputId = useId().replace(/:/g, "");
	const { page: urlPage, tags: urlTagsParam } = useSearch({
		strict: false,
	}) as HomeSearch;
	const navigate = useNavigate();
	const previousDeferredArchiveSearch = useRef("");
	const urlTags = parseHomeTags(urlTagsParam);

	const {
		archive,
		archivePage,
		archiveSearchInput,
		archiveTagFilters,
		archiveTotalPages,
		deferredArchiveSearch,
		handleDeleteTag,
		handleSetArchivePage,
		isLoadingArchive,
		setArchiveSearchInput,
		setArchiveTagFilters,
	} = useWorkspace();

	const [tagToDelete, setTagToDelete] = useState<string | null>(null);

	useEffect(() => {
		if (urlPage >= 1 && urlPage !== archivePage) {
			handleSetArchivePage(urlPage);
		}
	}, [urlPage, archivePage, handleSetArchivePage]);

	useEffect(() => {
		if (!areHomeTagsEqual(urlTags, archiveTagFilters)) {
			setArchiveTagFilters(urlTags);
		}
	}, [archiveTagFilters, setArchiveTagFilters, urlTags]);

	useEffect(() => {
		if (previousDeferredArchiveSearch.current === deferredArchiveSearch) {
			return;
		}

		previousDeferredArchiveSearch.current = deferredArchiveSearch;

		if (urlPage !== 1) {
			void navigate({
				to: "/home",
				search: {
					page: 1,
					tags: serializeHomeTags(archiveTagFilters),
				},
			});
		}
	}, [archiveTagFilters, deferredArchiveSearch, navigate, urlPage]);

	function handlePageChange(page: number) {
		if (page < 1 || page > archiveTotalPages) return;
		handleSetArchivePage(page);
		void navigate({
			to: "/home",
			search: {
				page,
				tags: serializeHomeTags(archiveTagFilters),
			},
		});
	}

	function handleToggleTagFilter(tagName: string) {
		const nextTags = archiveTagFilters.includes(tagName)
			? archiveTagFilters.filter((tag) => tag !== tagName)
			: [...archiveTagFilters, tagName];

		setArchiveTagFilters(nextTags);
		void navigate({
			to: "/home",
			search: {
				page: 1,
				tags: serializeHomeTags(nextTags),
			},
		});
	}

	return (
		<div className="flex flex-col gap-8 max-w-150 mx-auto">
			<p className="text-xl">
				{deferredArchiveSearch
					? `Showing ${archive.tweets.length} of ${archive.stats.filteredTweetCount} match${archive.stats.filteredTweetCount === 1 ? "" : "es"} for "${deferredArchiveSearch}"${archiveTagFilters.length > 0 ? ` with ${archiveTagFilters.join(" + ")}.` : "."}`
					: `Showing the most recent ${archive.tweets.length} of ${archive.stats.filteredTweetCount} archived tweet${archive.stats.filteredTweetCount === 1 ? "" : "s"}.`}
			</p>

			<div className="flex flex-col gap-3">
				<label
					htmlFor={archiveSearchInputId}
					className="grid gap-2 text-sm text-foreground lg:w-80"
				>
					<Input
						id={archiveSearchInputId}
						value={archiveSearchInput}
						onChange={(event) => setArchiveSearchInput(event.target.value)}
						placeholder="@username, display name, or tweet text"
						autoComplete="off"
					/>
				</label>

				{archive.tags.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{archive.tags.map((tag) => {
							const isSelected = archiveTagFilters.includes(tag.name);

							return (
								<ContextMenu key={tag.name}>
									<ContextMenuTrigger
										className="cursor-pointer"
										onClick={() => handleToggleTagFilter(tag.name)}
									>
										<Badge
											variant={isSelected ? "default" : "outline"}
											className="gap-2"
										>
											<span>{tag.name}</span>
											<span className="opacity-60">{tag.tweetCount}</span>
										</Badge>
									</ContextMenuTrigger>
									<ContextMenuContent>
										<ContextMenuGroup>
											<ContextMenuItem
												variant="destructive"
												onClick={() => setTagToDelete(tag.name)}
											>
												Delete tag
											</ContextMenuItem>
										</ContextMenuGroup>
									</ContextMenuContent>
								</ContextMenu>
							);
						})}
					</div>
				)}

				<AlertDialog
					open={tagToDelete !== null}
					onOpenChange={(open) => {
						if (!open) setTagToDelete(null);
					}}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete tag</AlertDialogTitle>
							<AlertDialogDescription>
								Remove &quot;{tagToDelete}&quot; from all tweets and delete it. This
								cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => {
									if (tagToDelete) {
										handleDeleteTag(tagToDelete);
										setTagToDelete(null);
									}
								}}
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>

			{isLoadingArchive && archive.tweets.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{deferredArchiveSearch
						? "Searching archive..."
						: "Loading archive..."}
				</p>
			) : archive.tweets.length === 0 ? (
				<div className="border border-border bg-background/80 p-4">
					<p className="text-sm text-muted-foreground">
						{deferredArchiveSearch
							? `No archived tweets matched "${deferredArchiveSearch}"`
							: "No archive rows yet"}
					</p>
				</div>
			) : (
				<div className="flex flex-col border border-border">
					<TweetPagination
						currentPage={archivePage}
						totalPages={archiveTotalPages}
						onPageChange={handlePageChange}
					/>
					<div className="flex flex-col border-t border-border">
						{archive.tweets.map((tweet) => (
							<Tweet key={tweet.id} tweet={tweet} />
						))}
					</div>
					<TweetPagination
						currentPage={archivePage}
						totalPages={archiveTotalPages}
						onPageChange={handlePageChange}
					/>
				</div>
			)}
		</div>
	);
}

function parseHomeTags(value: unknown) {
	const rawValue = Array.isArray(value) ? value.join(",") : value;

	if (typeof rawValue !== "string") {
		return [];
	}

	return [
		...new Set(
			rawValue
				.split(",")
				.map((tag) => tag.trim().toLowerCase())
				.filter(Boolean),
		),
	];
}

function serializeHomeTags(tags: string[]) {
	return tags.length > 0 ? parseHomeTags(tags.join(",")).join(",") : undefined;
}

function areHomeTagsEqual(currentTags: string[], nextTags: string[]) {
	if (currentTags.length !== nextTags.length) {
		return false;
	}

	return currentTags.every((tag, index) => tag === nextTags[index]);
}
