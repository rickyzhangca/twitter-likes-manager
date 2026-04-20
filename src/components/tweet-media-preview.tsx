import { createDesktopMediaUrl } from "@/types/desktop";
import type { ArchiveMedia } from "@/types/desktop";

function resolveMediaSource(media: ArchiveMedia) {
	if (media.localPath && window.twitterLikesDesktop) {
		return createDesktopMediaUrl(media.localPath);
	}

	return media.remoteUrl;
}

export function TweetMediaPreview({ media }: { media: ArchiveMedia[] }) {
	if (media.length === 0) {
		return null;
	}

	return (
		<div className="mt-4 grid gap-3 sm:grid-cols-2">
			{media.map((item) => {
				const source = resolveMediaSource(item);

				return (
					<a
						key={item.id}
						href={source}
						target="_blank"
						rel="noreferrer"
						className="group block overflow-hidden border border-border bg-background/80"
					>
						{item.kind === "photo" ? (
							<img
								src={source}
								alt="Tweet media"
								loading="lazy"
								className="aspect-4/3 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
							/>
						) : (
							<div className="aspect-4/3 flex h-full w-full items-center justify-center bg-black/90 p-4 text-center text-sm text-white">
								<span>
									{item.kind === "gif" ? "Animated GIF" : "Video"} preview
								</span>
							</div>
						)}
						<div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							<span>{item.kind}</span>
							<span>{item.localPath ? "Saved offline" : "Open remote"}</span>
						</div>
					</a>
				);
			})}
		</div>
	);
}
