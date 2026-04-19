import { readFileSync } from "node:fs"

import type { ArchiveMedia, ArchiveTweetPreview } from "../src/types/desktop"

type CapturedResponse = {
  url: string
  status: number
  contentType: string
  body: string
}

type LikesCaptureArtifact = {
  capturedAt: string
  responseCount: number
  responses: CapturedResponse[]
}

type RawLikesBody = {
  data?: {
    user?: {
      result?: {
        timeline?: {
          timeline?: {
            instructions?: RawInstruction[]
          }
        }
      }
    }
  }
}

type RawInstruction = {
  entries?: RawTimelineEntry[]
}

type RawTimelineEntry = {
  entryId?: string
  sortIndex?: string
  content?: {
    itemContent?: {
      tweet_results?: {
        result?: unknown
      }
    }
  }
}

type RawUser = {
  __typename?: string
  rest_id?: string
  core?: {
    screen_name?: string
    name?: string
  }
  avatar?: {
    image_url?: string
  }
  privacy?: {
    protected?: boolean
  }
  user?: unknown
  result?: unknown
}

type RawNoteTweet = {
  note_tweet_results?: {
    result?: {
      text?: string
      richtext?: {
        plain_text?: string
      }
    }
  }
}

type RawMediaVariant = {
  content_type?: string
  url?: string
  bitrate?: number
}

type RawMediaItem = {
  id_str?: string
  media_key?: string
  type?: string
  media_url_https?: string
  video_info?: {
    variants?: RawMediaVariant[]
  }
}

type RawTweetLegacy = {
  created_at?: string
  full_text?: string
  favorite_count?: number
  reply_count?: number
  entities?: {
    media?: RawMediaItem[]
  }
  extended_entities?: {
    media?: RawMediaItem[]
  }
}

type RawTweet = {
  __typename?: string
  rest_id?: string
  core?: {
    user_results?: {
      result?: unknown
    }
  }
  legacy?: RawTweetLegacy
  note_tweet?: RawNoteTweet
  tweet?: unknown
  result?: unknown
}

type ParsedMedia = {
  id: string
  kind: ArchiveMedia["kind"]
  remoteUrl: string
}

export type ParsedLikeTweet = {
  id: string
  authorId: string
  username: string
  displayName: string
  avatarUrl: string | null
  url: string
  text: string
  likedAt: string
  createdAt: string
  state: ArchiveTweetPreview["state"]
  likeCount: number
  replyCount: number
  media: ParsedMedia[]
}

export type ParsedLikesCapture = {
  capturedAt: string
  likesResponseCount: number
  tweets: ParsedLikeTweet[]
}

export function parseLikesCaptureArtifact(
  artifactPath: string,
): ParsedLikesCapture {
  const artifact = JSON.parse(
    readFileSync(artifactPath, "utf8"),
  ) as LikesCaptureArtifact
  const likesResponses = artifact.responses.filter((response) =>
    response.url.includes("/Likes?"),
  )
  const tweets: ParsedLikeTweet[] = []
  const seenTweetIds = new Set<string>()

  for (const response of likesResponses) {
    let body: RawLikesBody

    try {
      body = JSON.parse(response.body) as RawLikesBody
    } catch {
      continue
    }

    const entries = (body.data?.user?.result?.timeline?.timeline?.instructions ?? [])
      .flatMap((instruction) => instruction.entries ?? [])

    for (const entry of entries) {
      const tweet = parseTimelineEntry(entry, artifact.capturedAt)

      if (!tweet || seenTweetIds.has(tweet.id)) {
        continue
      }

      seenTweetIds.add(tweet.id)
      tweets.push(tweet)
    }
  }

  return {
    capturedAt: artifact.capturedAt,
    likesResponseCount: likesResponses.length,
    tweets,
  }
}

function parseTimelineEntry(
  entry: RawTimelineEntry,
  capturedAt: string,
): ParsedLikeTweet | null {
  const tweet = unwrapTweetResult(entry.content?.itemContent?.tweet_results?.result)

  if (!tweet?.rest_id || !tweet.legacy) {
    return null
  }

  const user = unwrapUserResult(tweet.core?.user_results?.result)

  if (!user?.rest_id || !user.core?.screen_name) {
    return null
  }

  const username = user.core.screen_name
  const text = getTweetText(tweet)
  const likedAt = decodeSnowflakeTimestamp(entry.sortIndex) ?? capturedAt
  const createdAt = parseTwitterDate(tweet.legacy.created_at) ?? likedAt
  const media = extractMedia(tweet.legacy)

  return {
    id: tweet.rest_id,
    authorId: user.rest_id,
    username,
    displayName: user.core.name ?? username,
    avatarUrl: user.avatar?.image_url ?? null,
    url: `https://x.com/${username}/status/${tweet.rest_id}`,
    text,
    likedAt,
    createdAt,
    state: user.privacy?.protected ? "protected" : "available",
    likeCount: toNumber(tweet.legacy.favorite_count),
    replyCount: toNumber(tweet.legacy.reply_count),
    media,
  }
}

function unwrapTweetResult(result: unknown): RawTweet | null {
  if (!result || typeof result !== "object") {
    return null
  }

  const candidate = result as RawTweet

  if (candidate.__typename === "Tweet") {
    return candidate
  }

  if (candidate.tweet && typeof candidate.tweet === "object") {
    return unwrapTweetResult(candidate.tweet)
  }

  if (candidate.result && typeof candidate.result === "object") {
    return unwrapTweetResult(candidate.result)
  }

  return null
}

function unwrapUserResult(result: unknown): RawUser | null {
  if (!result || typeof result !== "object") {
    return null
  }

  const candidate = result as RawUser

  if (candidate.__typename === "User") {
    return candidate
  }

  if (candidate.user && typeof candidate.user === "object") {
    return unwrapUserResult(candidate.user)
  }

  if (candidate.result && typeof candidate.result === "object") {
    return unwrapUserResult(candidate.result)
  }

  return null
}

function getTweetText(tweet: RawTweet) {
  const noteText =
    tweet.note_tweet?.note_tweet_results?.result?.text ??
    tweet.note_tweet?.note_tweet_results?.result?.richtext?.plain_text

  if (typeof noteText === "string" && noteText.trim().length > 0) {
    return noteText
  }

  return typeof tweet.legacy?.full_text === "string" ? tweet.legacy.full_text : ""
}

function extractMedia(legacy: RawTweetLegacy | undefined): ParsedMedia[] {
  const candidates =
    legacy?.extended_entities?.media ?? legacy?.entities?.media ?? []

  if (!Array.isArray(candidates)) {
    return []
  }

  return candidates
    .map((item, index) => {
      const remoteUrl = resolveMediaUrl(item)

      if (!remoteUrl) {
        return null
      }

      return {
        id: item.id_str ?? item.media_key ?? `media-${index}`,
        kind: normalizeMediaKind(item.type),
        remoteUrl,
      } satisfies ParsedMedia
    })
    .filter((item): item is ParsedMedia => item !== null)
}

function resolveMediaUrl(media: RawMediaItem) {
  const kind = normalizeMediaKind(media?.type)

  if (kind === "photo") {
    return typeof media?.media_url_https === "string"
      ? media.media_url_https
      : null
  }

  const variants = Array.isArray(media?.video_info?.variants)
    ? media.video_info.variants
    : []
  const bestMp4 = variants
    .filter(
      (variant) =>
        variant?.content_type === "video/mp4" && typeof variant?.url === "string",
    )
    .sort(
      (left, right) =>
        toNumber(right?.bitrate) - toNumber(left?.bitrate),
    )[0]

  if (bestMp4?.url) {
    return bestMp4.url
  }

  return typeof media?.media_url_https === "string" ? media.media_url_https : null
}

function normalizeMediaKind(type: unknown): ArchiveMedia["kind"] {
  if (type === "video") {
    return "video"
  }

  if (type === "animated_gif") {
    return "gif"
  }

  return "photo"
}

function parseTwitterDate(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const timestamp = Date.parse(value)

  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

function decodeSnowflakeTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null
  }

  try {
    return new Date(Number((BigInt(value) >> 22n) + 1288834974657n)).toISOString()
  } catch {
    return null
  }
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}