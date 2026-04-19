import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type {
  ArchiveSnapshot,
  ArchiveTweetPreview,
  DesktopAppState,
  DesktopService,
} from "@/types/desktop"

const browserPreviewState: DesktopAppState = {
  runtime: "browser",
  appName: "Twitter Likes Manager",
  appVersion: "0.0.1",
  isPackaged: false,
  platform: navigator.platform,
  dataDirectory: null,
  versions: {
    node: null,
    chrome: null,
    electron: null,
  },
  services: [
    {
      id: "electron-shell",
      label: "Electron shell",
      status: "planned",
      detail: "Start the app with `pnpm dev` to boot the desktop shell.",
    },
    {
      id: "storage-layer",
      label: "Local storage",
      status: "planned",
      detail: "SQLite and media storage will land in the next slice.",
    },
    {
      id: "capture-worker",
      label: "Capture worker",
      status: "planned",
      detail: "Playwright-based like sync has not been wired yet.",
    },
  ],
}

const nextMilestones = [
  "Add the SQLite schema and app data directories managed by Electron.",
  "Wire a Playwright worker that signs in and captures the Likes timeline.",
  "Persist normalized tweets, authors, and local media paths for offline viewing.",
]

const plannedScreens = [
  {
    name: "Onboarding",
    summary: "Explain the sync model, data location, and login requirements.",
  },
  {
    name: "Sync control",
    summary: "Start, resume, and inspect capture runs with progress updates.",
  },
  {
    name: "Archive viewer",
    summary: "Browse tweets, inspect media, and search the local archive offline.",
  },
]

const browserPreviewArchive: ArchiveSnapshot = {
  databasePath: null,
  dataDirectory: null,
  stats: {
    tweetCount: 0,
    authorCount: 0,
    mediaCount: 0,
    latestLikedAt: null,
  },
  tweets: [],
}

function formatDate(isoString: string | null) {
  if (!isoString) {
    return "not available"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoString))
}

function stateTone(tweet: ArchiveTweetPreview) {
  if (tweet.state === "available") {
    return "border-primary/30 bg-primary/8 text-foreground"
  }

  if (tweet.state === "planned") {
    return "border-border bg-background/80 text-muted-foreground"
  }

  return "border-destructive/30 bg-destructive/10 text-foreground"
}

function serviceTone(service: DesktopService) {
  if (service.status === "ready") {
    return "border-primary/40 bg-primary/8 text-foreground"
  }

  if (service.status === "blocked") {
    return "border-destructive/30 bg-destructive/10 text-foreground"
  }

  return "border-border bg-card text-muted-foreground"
}

export function App() {
  const [appState, setAppState] = useState<DesktopAppState>(browserPreviewState)
  const [archive, setArchive] = useState<ArchiveSnapshot>(browserPreviewArchive)
  const [bridgeStatus, setBridgeStatus] = useState(
    "Browser preview mode. Desktop services are idle until Electron boots."
  )
  const [isOpeningDataDir, setIsOpeningDataDir] = useState(false)
  const [isLoadingArchive, setIsLoadingArchive] = useState(false)

  useEffect(() => {
    let isDisposed = false

    async function loadDesktopState() {
      if (!window.twitterLikesDesktop) {
        return
      }

      setIsLoadingArchive(true)

      const [nextState, nextArchive, pong] = await Promise.all([
        window.twitterLikesDesktop.getAppState(),
        window.twitterLikesDesktop.getArchiveSnapshot(),
        window.twitterLikesDesktop.ping(),
      ])

      if (isDisposed) {
        return
      }

      setAppState(nextState)
      setArchive(nextArchive)
      setBridgeStatus(`Desktop bridge online: ${pong}`)
      setIsLoadingArchive(false)
    }

    void loadDesktopState().catch((error: unknown) => {
      if (isDisposed) {
        return
      }

      const message =
        error instanceof Error ? error.message : "Unknown preload bridge error"
      setBridgeStatus(`Desktop bridge failed: ${message}`)
      setIsLoadingArchive(false)
    })

    return () => {
      isDisposed = true
    }
  }, [])

  async function handleOpenDataDirectory() {
    if (!window.twitterLikesDesktop) {
      setBridgeStatus("Data directory is only available in the Electron shell.")
      return
    }

    setIsOpeningDataDir(true)

    try {
      await window.twitterLikesDesktop.openDataDirectory()
      setBridgeStatus("Opened the app data directory in Finder.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not open data directory"
      setBridgeStatus(`Open data directory failed: ${message}`)
    } finally {
      setIsOpeningDataDir(false)
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,_var(--color-primary)_14%,_transparent),_transparent_32%),linear-gradient(180deg,color-mix(in_oklab,_var(--color-background)_88%,_black_12%),var(--color-background))]">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
        <header className="grid gap-8 border border-border bg-card/80 p-6 backdrop-blur lg:grid-cols-[1.6fr_0.9fr] lg:p-8">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                MVP foundation
              </p>
              <h1 className="max-w-3xl text-3xl leading-tight font-medium text-balance sm:text-4xl lg:text-5xl">
                Local-first archive for your liked tweets, built as a desktop app.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                This first slice wires the existing React renderer into Electron,
                exposes a secure desktop bridge, and turns the placeholder page
                into a concrete archive dashboard scaffold.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleOpenDataDirectory} disabled={isOpeningDataDir}>
                {isOpeningDataDir ? "Opening data directory..." : "Open data directory"}
              </Button>
              <Button variant="outline" onClick={() => setBridgeStatus("Next implementation target: SQLite schema and sync jobs.") }>
                Next implementation target
              </Button>
            </div>
          </div>

          <div className="grid gap-4 text-sm">
            <div className="border border-border bg-background/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Runtime</span>
                <span className="text-foreground">{appState.runtime}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Bridge status</span>
                <span className="max-w-[16rem] text-right text-foreground">
                  {bridgeStatus}
                </span>
              </div>
            </div>

            <div className="border border-border bg-background/80 p-4">
              <p className="text-muted-foreground">App info</p>
              <dl className="mt-3 grid gap-2 text-foreground">
                <div className="flex items-center justify-between gap-3">
                  <dt>Version</dt>
                  <dd>{appState.appVersion}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Packaged</dt>
                  <dd>{appState.isPackaged ? "yes" : "no"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Platform</dt>
                  <dd>{appState.platform}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>Data directory</dt>
                  <dd className="max-w-[14rem] truncate text-right">
                    {appState.dataDirectory ?? "not attached"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="border border-border bg-card p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Process split
                </p>
                <h2 className="mt-2 text-xl font-medium">Desktop services</h2>
              </div>
              <p className="text-xs text-muted-foreground">Secure preload bridge</p>
            </div>

            <div className="mt-5 grid gap-3">
              {appState.services.map((service) => (
                <article
                  key={service.id}
                  className={`border p-4 transition-colors ${serviceTone(service)}`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em]">
                    <span>{service.label}</span>
                    <span>{service.status}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6">{service.detail}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 border border-border bg-background/80 p-4 text-sm leading-6 text-muted-foreground">
              <p className="text-foreground">Archive database</p>
              <p className="mt-2 break-all">{archive.databasePath ?? "No database yet"}</p>
            </div>
          </section>

          <section className="grid gap-6">
            <div className="border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Local archive
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="border border-border bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Tweets
                  </p>
                  <p className="mt-3 text-2xl text-foreground">{archive.stats.tweetCount}</p>
                </div>
                <div className="border border-border bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Authors
                  </p>
                  <p className="mt-3 text-2xl text-foreground">{archive.stats.authorCount}</p>
                </div>
                <div className="border border-border bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Media
                  </p>
                  <p className="mt-3 text-2xl text-foreground">{archive.stats.mediaCount}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Latest liked tweet saved: {formatDate(archive.stats.latestLikedAt)}
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Recent archive rows
              </p>
              {isLoadingArchive ? (
                <p className="mt-5 text-sm text-muted-foreground">Loading archive...</p>
              ) : archive.tweets.length === 0 ? (
                <div className="mt-5 border border-border bg-background/80 p-4">
                  <p className="text-sm text-muted-foreground">
                    No archive rows yet. The next slice will replace the seeded store
                    with captured likes from X.
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

            <div className="border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Planned screens
              </p>
              <div className="mt-5 grid gap-4">
                {plannedScreens.map((screen) => (
                  <div key={screen.name} className="border border-border bg-background/80 p-4">
                    <h3 className="text-sm font-medium text-foreground">{screen.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {screen.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Next milestones
              </p>
              <ol className="mt-5 grid gap-3 text-sm leading-6 text-foreground">
                {nextMilestones.map((milestone, index) => (
                  <li key={milestone} className="border border-border bg-background/80 p-4">
                    <span className="text-muted-foreground">0{index + 1}</span>
                    <p className="mt-2">{milestone}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </main>

        <footer className="border border-border bg-card/80 p-4 text-xs leading-6 text-muted-foreground backdrop-blur">
          Desktop mode exposes Electron, Chrome, and Node versions through the preload bridge. Press <kbd className="border border-border px-1.5 py-0.5 text-[10px]">d</kbd> to toggle theme.
        </footer>
      </div>
    </div>
  )
}

export default App
