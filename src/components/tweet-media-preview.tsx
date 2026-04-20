import MuxVideo from "@mux/mux-video-react";
import Zoom from "react-medium-image-zoom";
import { toast } from "sonner";
import type { ArchiveMedia } from "@/types/desktop";
import { createDesktopMediaUrl } from "@/types/desktop";
import "react-medium-image-zoom/dist/styles.css";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

function resolveMediaSource(media: ArchiveMedia) {
	if (media.localPath && window.twitterLikesDesktop) {
		return createDesktopMediaUrl(media.localPath);
	}

	return media.remoteUrl;
}

async function handleCopyImage(media: ArchiveMedia) {
	if (!media.localPath || !window.twitterLikesDesktop) return;
	try {
		await window.twitterLikesDesktop.copyImageToClipboard(media.localPath);
		toast.success("Image copied to clipboard");
	} catch {
		toast.error("Failed to copy image");
	}
}

async function handleRevealInFolder(media: ArchiveMedia) {
	if (!media.localPath || !window.twitterLikesDesktop) return;
	try {
		await window.twitterLikesDesktop.showItemInFolder(media.localPath);
		toast.success("Revealed in Finder");
	} catch {
		toast.error("Failed to reveal in Finder");
	}
}

export function TweetMediaPreview({ media }: { media: ArchiveMedia[] }) {
	if (media.length === 0) {
		return null;
	}

	const multi = media.length > 1;

	return (
		<div className={multi ? "grid grid-cols-2 gap-2" : "flex flex-col gap-3"}>
			{media.map((item) => {
				const source = resolveMediaSource(item);

				if (item.kind === "video") {
					return (
						<div
							key={item.id}
							className={cn(
								"group overflow-hidden border rounded-sm border-border bg-black",
								multi ? "w-full" : "w-fit max-w-135",
							)}
						>
							<MuxVideo
								src={source}
								controls
								playsInline
								className={cn(
									"h-auto w-full",
									multi ? "max-h-80" : "max-h-135 w-auto max-w-full",
								)}
							/>
						</div>
					);
				}

				if (item.kind === "gif") {
					return (
						<div
							key={item.id}
							className={cn(
								"group overflow-hidden border rounded-sm border-border bg-black/30",
								multi ? "w-full" : "w-fit max-w-135",
							)}
						>
							<MuxVideo
								src={source}
								autoPlay
								muted
								loop
								playsInline
								className={cn(
									"h-auto w-full",
									multi ? "max-h-80" : "max-h-135 w-auto max-w-full",
								)}
							/>
						</div>
					);
				}

				return (
					<ContextMenu key={item.id}>
						<ContextMenuTrigger>
							<div
								className={cn(
									"group overflow-hidden rounded-sm border border-border bg-black/30",
									multi ? "w-full" : "w-fit max-w-135",
								)}
							>
								<Zoom>
									<img
										src={source}
										alt="Tweet media"
										loading="lazy"
										className={cn(
											"h-auto w-full object-contain",
											multi ? "max-h-80" : "max-h-135 w-auto max-w-full",
										)}
									/>
								</Zoom>
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuGroup>
								<ContextMenuItem
									disabled={!item.localPath || !window.twitterLikesDesktop}
									onClick={() => handleCopyImage(item)}
								>
									Copy Image
								</ContextMenuItem>
								<ContextMenuItem
									disabled={!item.localPath || !window.twitterLikesDesktop}
									onClick={() => handleRevealInFolder(item)}
								>
									Reveal in Finder
								</ContextMenuItem>
							</ContextMenuGroup>
						</ContextMenuContent>
					</ContextMenu>
				);
			})}
		</div>
	);
}
