/* eslint-disable react-refresh/only-export-components */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, useWorkspace } from "@/hooks/use-workspace";

export const Route = createFileRoute("/tweets")({
	component: TweetsPage,
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

function TweetsPage() {
	const {
		archive,
		archivePage,
		archiveSearchInput,
		archiveTotalPages,
		deferredArchiveSearch,
		handleDeleteTweets,
		handleSetArchivePage,
		isLoadingArchive,
		setArchiveSearchInput,
	} = useWorkspace();
	const [selectedTweetIds, setSelectedTweetIds] = useState<string[]>([]);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const visibleTweetIds = useMemo(
		() => archive.tweets.map((tweet) => tweet.id),
		[archive.tweets],
	);

	useEffect(() => {
		setSelectedTweetIds((currentSelection) =>
			currentSelection.filter((tweetId) => visibleTweetIds.includes(tweetId)),
		);
	}, [visibleTweetIds]);

	const selectedCount = selectedTweetIds.length;
	const allVisibleSelected =
		visibleTweetIds.length > 0 && selectedCount === visibleTweetIds.length;
	const isSelectAllIndeterminate = !allVisibleSelected && selectedCount > 0;

	function handleToggleTweetSelection(tweetId: string, checked: boolean) {
		setSelectedTweetIds((currentSelection) => {
			if (checked) {
				return currentSelection.includes(tweetId)
					? currentSelection
					: [...currentSelection, tweetId];
			}

			return currentSelection.filter(
				(currentTweetId) => currentTweetId !== tweetId,
			);
		});
	}

	function handleToggleSelectAll(checked: boolean) {
		setSelectedTweetIds(checked ? visibleTweetIds : []);
	}

	function handlePageChange(page: number) {
		if (page < 1 || page > archiveTotalPages) return;
		handleSetArchivePage(page);
	}

	async function handleConfirmDelete() {
		const tweetIdsToDelete = [...selectedTweetIds];

		if (tweetIdsToDelete.length === 0) {
			return;
		}

		await handleDeleteTweets(tweetIdsToDelete);
		setSelectedTweetIds([]);
		setIsDeleteDialogOpen(false);
	}

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-2">
					<p className="text-xl">
						{deferredArchiveSearch
							? `Showing ${archive.tweets.length} archived tweet${archive.tweets.length === 1 ? "" : "s"} matching "${deferredArchiveSearch}" on this page.`
							: `Showing ${archive.tweets.length} archived tweet${archive.tweets.length === 1 ? "" : "s"} on page ${archivePage}.`}
					</p>
					<p className="text-sm text-muted-foreground">
						Select one, many, or all visible tweets to unlock archive actions.
					</p>
				</div>

				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="lg:w-96">
						<Input
							value={archiveSearchInput}
							onChange={(event) => setArchiveSearchInput(event.target.value)}
							placeholder="Search by author or tweet text"
							autoComplete="off"
						/>
					</div>

					{selectedCount > 0 ? (
						<div className="flex gap-2 items-center">
							<p className="text-sm">{selectedCount} selected</p>
							<ButtonGroup aria-label="Selected tweet actions">
								<Button
									variant="destructive"
									size="sm"
									onClick={() => setIsDeleteDialogOpen(true)}
									disabled={isLoadingArchive}
								>
									{isLoadingArchive ? "Deleting..." : "Delete"}
								</Button>
							</ButtonGroup>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							Select tweets to show available actions.
						</p>
					)}
				</div>

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-12">
								<Checkbox
									checked={allVisibleSelected}
									indeterminate={isSelectAllIndeterminate}
									onCheckedChange={handleToggleSelectAll}
									aria-label="Select all visible tweets"
									disabled={visibleTweetIds.length === 0}
								/>
							</TableHead>
							<TableHead>Author</TableHead>
							<TableHead>Tweet</TableHead>
							<TableHead>Imported</TableHead>
							<TableHead>State</TableHead>
							<TableHead className="text-right">Media</TableHead>
							<TableHead>Tags</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{archive.tweets.map((tweet) => {
							const isSelected = selectedTweetIds.includes(tweet.id);

							return (
								<TableRow
									key={tweet.id}
									data-state={isSelected ? "selected" : undefined}
								>
									<TableCell className="align-top">
										<Checkbox
											checked={isSelected}
											onCheckedChange={(checked) =>
												handleToggleTweetSelection(tweet.id, checked)
											}
											aria-label={`Select tweet ${tweet.id}`}
										/>
									</TableCell>
									<TableCell className="min-w-52 align-top">
										<div className="flex flex-col gap-1 whitespace-normal">
											<p className="font-medium">{tweet.author.displayName}</p>
											<p className="text-sm text-muted-foreground">
												@{tweet.author.username}
											</p>
										</div>
									</TableCell>
									<TableCell className="max-w-160 align-top whitespace-normal">
										<div className="flex flex-col gap-2">
											<a
												href={tweet.url}
												target="_blank"
												rel="noreferrer"
												className="leading-6 hover:underline"
											>
												{tweet.text}
											</a>
											{tweet.quotedTweet ? (
												<p className="text-xs text-muted-foreground">
													Includes a quoted tweet by @
													{tweet.quotedTweet.author.username}.
												</p>
											) : null}
										</div>
									</TableCell>
									<TableCell className="align-top text-sm">
										{formatDate(tweet.importedAt)}
									</TableCell>
									<TableCell className="align-top">
										<Badge
											variant={
												tweet.state === "available" ? "secondary" : "outline"
											}
										>
											{tweet.state}
										</Badge>
									</TableCell>
									<TableCell className="align-top text-right">
										{tweet.metrics.mediaCount}
									</TableCell>
									<TableCell className="min-w-48 align-top whitespace-normal">
										{tweet.tags.length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{tweet.tags.map((tag) => (
													<Badge key={tag} variant="outline">
														{tag}
													</Badge>
												))}
											</div>
										) : (
											<span className="text-sm text-muted-foreground">
												No tags
											</span>
										)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>

				{archive.tweets.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No archived tweets match the current filters.
					</p>
				) : null}

				<TweetPagination
					currentPage={archivePage}
					totalPages={archiveTotalPages}
					onPageChange={handlePageChange}
				/>
			</div>

			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete selected tweets?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes {selectedCount} archived tweet
							{selectedCount === 1 ? "" : "s"} and any downloaded media files
							attached to them.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isLoadingArchive}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								void handleConfirmDelete();
							}}
							disabled={isLoadingArchive}
						>
							{isLoadingArchive ? "Deleting..." : "Delete tweets"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
