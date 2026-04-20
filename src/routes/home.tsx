/* eslint-disable react-refresh/only-export-components */

import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { Tweet } from "@/components/tweet";
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
};

export const Route = createFileRoute("/home")({
	validateSearch: (search: Record<string, unknown>): HomeSearch => ({
		page: Number(search?.page ?? 1) || 1,
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
						<PaginationItem key={`ellipsis-${index}`}>
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
	const { page: urlPage } = useSearch({ strict: false }) as HomeSearch;
	const navigate = useNavigate();
	const previousDeferredArchiveSearch = useRef("");

	const {
		archive,
		archivePage,
		archiveSearchInput,
		archiveTotalPages,
		deferredArchiveSearch,
		handleSetArchivePage,
		isLoadingArchive,
		setArchiveSearchInput,
	} = useWorkspace();

	useEffect(() => {
		if (urlPage >= 1 && urlPage !== archivePage) {
			handleSetArchivePage(urlPage);
		}
	}, [urlPage, archivePage, handleSetArchivePage]);

	useEffect(() => {
		if (previousDeferredArchiveSearch.current === deferredArchiveSearch) {
			return;
		}

		previousDeferredArchiveSearch.current = deferredArchiveSearch;

		if (urlPage !== 1) {
			void navigate({ to: "/home", search: { page: 1 } });
		}
	}, [deferredArchiveSearch, navigate, urlPage]);

	function handlePageChange(page: number) {
		if (page < 1 || page > archiveTotalPages) return;
		handleSetArchivePage(page);
		void navigate({ to: "/home", search: { page } });
	}

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
					? `Showing ${archive.tweets.length} of ${archive.stats.filteredTweetCount} match${archive.stats.filteredTweetCount === 1 ? "" : "es"} for "${deferredArchiveSearch}".`
					: `Showing the most recent ${archive.tweets.length} of ${archive.stats.filteredTweetCount} archived tweet${archive.stats.filteredTweetCount === 1 ? "" : "s"}.`}
			</p>

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
				<>
					<TweetPagination
						currentPage={archivePage}
						totalPages={archiveTotalPages}
						onPageChange={handlePageChange}
					/>
					<div className="flex flex-col border border-border">
						{archive.tweets.map((tweet) => (
							<Tweet key={tweet.id} tweet={tweet} />
						))}
					</div>
					<TweetPagination
						currentPage={archivePage}
						totalPages={archiveTotalPages}
						onPageChange={handlePageChange}
					/>
				</>
			)}
		</div>
	);
}
