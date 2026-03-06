import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";
import RichTextEditor from "../components/RichTextEditor";
import { htmlToPlainText, sanitizeRichHtml } from "../utils/richText";

interface ForumAuthor {
  id: number;
  name: string;
}

interface ForumPost {
  id: number;
  body: string;
  is_hidden: boolean;
  created_at: string;
  author?: ForumAuthor | null;
}

interface ForumThread {
  id: number;
  title: string;
  body: string;
  slug: string;
  is_locked: boolean;
  is_pinned: boolean;
  created_at: string;
  last_posted_at: string | null;
  visible_posts_count?: number;
  author?: ForumAuthor | null;
  posts?: ForumPost[];
}

interface ThreadListPayload {
  data: ForumThread[];
  current_page: number;
  last_page: number;
  total: number;
}

type ForumTab = "threads" | "thread" | "new-thread";
const FORUM_PAGE_SIZE = 10;

export default function Forum() {
  const FORUM_REFRESH_MS = 1000;
  const { user } = useAuth();
  const roleName = (user?.role as { name?: unknown } | undefined)?.name;
  const isApplicant = roleName === "applicant";
  const canViewForum = !isApplicant;
  const canCreateThread = !isApplicant;
  const canReply = !isApplicant;
  const canModerate = hasPermission(user, "forum.moderate");
  const currentUserId = typeof user?.id === "number" ? user.id : null;

  const [activeTab, setActiveTab] = useState<ForumTab>("threads");
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [selectedThread, setSelectedThread] = useState<ForumThread | null>(null);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [search, setSearch] = useState("");
  const [threadsPage, setThreadsPage] = useState(1);
  const [threadsLastPage, setThreadsLastPage] = useState(1);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusedPostId, setFocusedPostId] = useState<number | null>(null);
  const latestPostRef = useRef<HTMLElement | null>(null);
  const previousThreadRef = useRef<number | null>(null);
  const previousLastPostRef = useRef<number | null>(null);
  const focusResetTimerRef = useRef<number | null>(null);
  const threadWordCount = useMemo(
    () => (htmlToPlainText(threadBody).trim().length ? htmlToPlainText(threadBody).trim().split(/\s+/).length : 0),
    [threadBody],
  );
  const replyWordCount = useMemo(
    () => (htmlToPlainText(replyBody).trim().length ? htmlToPlainText(replyBody).trim().split(/\s+/).length : 0),
    [replyBody],
  );

  const hasThreadBodyContent = useMemo(() => htmlToPlainText(threadBody).trim().length > 1, [threadBody]);
  const hasReplyBodyContent = useMemo(() => htmlToPlainText(replyBody).trim().length > 1, [replyBody]);

  const parseError = (err: unknown, fallback: string): string => {
    if (!axios.isAxiosError(err)) return fallback;

    const message = (err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)?.message;
    if (message) return message;
    const errors = (err.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors;
    if (errors) {
      const first = Object.values(errors).flat()[0];
      if (first) return first;
    }

    return fallback;
  };

  const fetchThreads = useCallback(async (silent = false, nextPage = threadsPage) => {
    if (!canViewForum) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await api.get<ThreadListPayload>("/forum/threads", {
        params: { search, page: nextPage, _t: Date.now() },
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const items = res.data.data ?? [];
      setThreads(items);
      setThreadsPage(res.data.current_page ?? nextPage);
      setThreadsLastPage(res.data.last_page ?? 1);
      setThreadsTotal(res.data.total ?? items.length);
      setThreadsLoaded(true);
      const selectedStillExists = selectedThreadId
        ? items.some((thread) => thread.id === selectedThreadId)
        : false;

      if (!selectedStillExists) {
        setSelectedThreadId(items.length > 0 ? items[0].id : null);
        setSelectedThread(null);
      }
    } catch (err) {
      if (!silent) {
        setError(parseError(err, "Unable to load forum threads."));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [canViewForum, search, selectedThreadId, threadsPage]);

  const fetchThread = useCallback(async (threadId: number, silent = false) => {
    if (!canViewForum) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await api.get<{ thread: ForumThread }>(`/forum/threads/${threadId}`, {
        params: { _t: Date.now() },
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      setSelectedThread(res.data.thread);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setSelectedThread(null);
        setSelectedThreadId(null);
        void fetchThreads(true);
        return;
      }
      if (!silent) {
        setError(parseError(err, "Unable to load selected thread."));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [canViewForum, fetchThreads]);

  useEffect(() => {
    if (!threadsLoaded || !selectedThreadId) {
      setSelectedThread(null);
      return;
    }

    setPostsPage(1);
    void fetchThread(selectedThreadId);
  }, [fetchThread, selectedThreadId, threadsLoaded]);

  useEffect(() => {
    if (!canViewForum || !threadsLoaded) return;

    const timer = window.setInterval(() => {
      void fetchThreads(true);
      if (selectedThreadId) {
        void fetchThread(selectedThreadId, true);
      }
    }, FORUM_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [canViewForum, fetchThread, fetchThreads, selectedThreadId, threadsLoaded]);

  const createThread = async () => {
    if (!canCreateThread) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const res = await api.post<ForumThread>("/forum/threads", {
        title: threadTitle,
        body: threadBody,
      });
      setThreadTitle("");
      setThreadBody("");
      setNotice("Forum thread created.");
      await fetchThreads(false, 1);
      setSelectedThreadId(res.data.id);
      setActiveTab("thread");
    } catch (err) {
      setError(parseError(err, "Unable to create forum thread."));
    } finally {
      setSaving(false);
    }
  };

  async function uploadInlineImage(file: File): Promise<string> {
    const payload = new FormData();
    payload.append("image", file);
    const response = await api.post("/forum/uploads/inline-image", payload);
    const url = response.data?.url as string | undefined;
    if (!url) {
      throw new Error("Forum inline image upload failed.");
    }
    return url;
  }

  const addReply = async () => {
    if (!canReply || !selectedThread) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.post(`/forum/threads/${selectedThread.id}/posts`, {
        body: replyBody,
      });
      setReplyBody("");
      setNotice("Reply posted.");
      await fetchThread(selectedThread.id);
      await fetchThreads();
    } catch (err) {
      setError(parseError(err, "Unable to post reply."));
    } finally {
      setSaving(false);
    }
  };

  const toggleThreadLock = async (locked: boolean) => {
    if (!canModerate || !selectedThread) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.post(`/forum/threads/${selectedThread.id}/lock`, { locked });
      setNotice(locked ? "Thread locked." : "Thread unlocked.");
      await fetchThread(selectedThread.id);
      await fetchThreads();
    } catch (err) {
      setError(parseError(err, "Unable to update thread lock state."));
    } finally {
      setSaving(false);
    }
  };

  const togglePostVisibility = async (post: ForumPost, hidden: boolean) => {
    if (!canModerate) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.post(`/forum/posts/${post.id}/visibility`, { hidden });
      if (selectedThread) {
        await fetchThread(selectedThread.id);
      }
      await fetchThreads(false, threadsPage);
      setNotice(hidden ? "Post hidden." : "Post restored.");
    } catch (err) {
      setError(parseError(err, "Unable to update post visibility."));
    } finally {
      setSaving(false);
    }
  };

  const deleteThread = async () => {
    if (!selectedThread) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.delete(`/forum/threads/${selectedThread.id}`);
      setNotice("Thread deleted.");
      setSelectedThread(null);
      setSelectedThreadId(null);
      await fetchThreads(false, threadsPage);
    } catch (err) {
      setError(parseError(err, "Unable to delete thread."));
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (post: ForumPost) => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.delete(`/forum/posts/${post.id}`);
      if (selectedThread) {
        await fetchThread(selectedThread.id);
      }
      await fetchThreads(false, threadsPage);
      setNotice("Post deleted.");
    } catch (err) {
      setError(parseError(err, "Unable to delete post."));
    } finally {
      setSaving(false);
    }
  };

  const selectedSummary = useMemo(
    () => threads.find((item) => item.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );
  const canDeleteSelectedThread = useMemo(() => {
    if (!selectedThread) return false;
    if (canModerate) return true;
    if (currentUserId === null) return false;
    return selectedThread.author?.id === currentUserId;
  }, [canModerate, currentUserId, selectedThread]);
  const lastVisiblePostId = useMemo(() => {
    const posts = selectedThread?.posts ?? [];
    if (posts.length === 0) return null;
    return posts[posts.length - 1]?.id ?? null;
  }, [selectedThread?.posts]);
  const pagedPosts = useMemo(() => {
    const posts = selectedThread?.posts ?? [];
    const start = (postsPage - 1) * FORUM_PAGE_SIZE;
    return posts.slice(start, start + FORUM_PAGE_SIZE);
  }, [postsPage, selectedThread?.posts]);
  const postsLastPage = useMemo(
    () => Math.max(1, Math.ceil((selectedThread?.posts?.length ?? 0) / FORUM_PAGE_SIZE)),
    [selectedThread?.posts?.length],
  );

  useEffect(() => {
    const currentThreadId = selectedThread?.id ?? null;
    const previousThreadId = previousThreadRef.current;
    const previousLastPostId = previousLastPostRef.current;
    const hasNewReplyInSameThread = (
      currentThreadId !== null
      && previousThreadId === currentThreadId
      && lastVisiblePostId !== null
      && previousLastPostId !== null
      && lastVisiblePostId !== previousLastPostId
    );

    if (hasNewReplyInSameThread && latestPostRef.current) {
      latestPostRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      latestPostRef.current.focus({ preventScroll: true });
      setFocusedPostId(lastVisiblePostId);

      if (focusResetTimerRef.current !== null) {
        window.clearTimeout(focusResetTimerRef.current);
      }
      focusResetTimerRef.current = window.setTimeout(() => {
        setFocusedPostId(null);
      }, 2500);
    }

    previousThreadRef.current = currentThreadId;
    previousLastPostRef.current = lastVisiblePostId;
  }, [lastVisiblePostId, selectedThread?.id]);

  useEffect(() => () => {
    if (focusResetTimerRef.current !== null) {
      window.clearTimeout(focusResetTimerRef.current);
    }
  }, []);

  if (!canViewForum) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Forum</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to access the forum.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Forum</h1>
      <p className="mb-5 text-sm text-mist/85">
        Member discussion board. Starters, moderators, and admins can delete threads; moderators and admins can delete replies.
      </p>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{notice}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("threads")}
          className={`rounded-md border px-4 py-2 text-sm ${activeTab === "threads" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
        >
          Threads
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("thread")}
          className={`rounded-md border px-4 py-2 text-sm ${activeTab === "thread" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
        >
          Thread View
        </button>
        {canCreateThread && (
          <button
            type="button"
            onClick={() => setActiveTab("new-thread")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "new-thread" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            New Thread
          </button>
        )}
      </div>

      {activeTab === "threads" && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              aria-label="Search forum threads"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search forum threads"
              className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <button
              className="btn-secondary"
              onClick={() => {
                setThreadsPage(1);
                void fetchThreads(false, 1);
              }}
            >
              Search
            </button>
          </div>

          {!threadsLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/75">
              Click Search to load threads.
            </div>
          ) : (
            <>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {!loading && threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setActiveTab("thread");
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      thread.id === selectedThreadId
                        ? "border-gold/60 bg-gold/10"
                        : "border-white/20 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <p className="text-sm font-semibold text-offwhite">{thread.title}</p>
                    <p className="mt-1 text-xs text-mist/75">
                      by {thread.author?.name ?? "Unknown"}
                    </p>
                    <p className="mt-1 text-xs text-mist/75">
                      {thread.visible_posts_count ?? 0} posts
                      {thread.is_locked ? " | Locked" : ""}
                      {thread.is_pinned ? " | Pinned" : ""}
                    </p>
                  </button>
                ))}
                {!loading && threads.length === 0 && (
                  <p className="rounded-md border border-white/20 bg-white/5 px-3 py-3 text-sm text-mist/75">
                    No threads yet.
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-mist/75">
                <span>Page {threadsPage} of {threadsLastPage} | Total {threadsTotal}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={threadsPage <= 1}
                    onClick={() => {
                      const nextPage = Math.max(1, threadsPage - 1);
                      setThreadsPage(nextPage);
                      void fetchThreads(false, nextPage);
                    }}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={threadsPage >= threadsLastPage}
                    onClick={() => {
                      const nextPage = Math.min(threadsLastPage, threadsPage + 1);
                      setThreadsPage(nextPage);
                      void fetchThreads(false, nextPage);
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "new-thread" && canCreateThread && (
        <div className="mb-6 grid gap-3 rounded-xl border border-white/20 bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">Start New Thread</p>
          <input
            aria-label="Thread title"
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            placeholder="Thread title"
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
          />
          <RichTextEditor
            value={threadBody}
            onChange={setThreadBody}
            onUploadImage={uploadInlineImage}
            disabled={saving}
          />
          <p className="-mt-1 text-right text-xs text-mist/75">
            {threadWordCount.toLocaleString()} words
          </p>
          <button
            className="btn-primary justify-self-start disabled:opacity-50"
            onClick={() => void createThread()}
            disabled={saving || !threadTitle.trim() || !hasThreadBodyContent}
          >
            {saving ? "Saving..." : "Create Thread"}
          </button>
        </div>
      )}

      {activeTab === "thread" && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-1 font-heading text-2xl text-offwhite">
            {selectedThread?.title ?? selectedSummary?.title ?? "Select a thread"}
          </h2>
          {selectedThread?.author?.name && (
            <p className="mb-3 text-xs text-mist/75">Started by {selectedThread.author.name}</p>
          )}

          {selectedThread && (canModerate || canDeleteSelectedThread) && (
            <div className="mb-3 flex gap-2">
              {canModerate && (
                <>
                  {selectedThread.is_locked ? (
                    <button className="btn-secondary" disabled={saving} onClick={() => void toggleThreadLock(false)}>
                      Unlock Thread
                    </button>
                  ) : (
                    <button className="btn-secondary" disabled={saving} onClick={() => void toggleThreadLock(true)}>
                      Lock Thread
                    </button>
                  )}
                </>
              )}
              {canDeleteSelectedThread && (
                <button
                  className="rounded-md border border-red-400/50 px-3 py-2 text-sm text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                  disabled={saving}
                  onClick={() => void deleteThread()}
                >
                  Delete Thread
                </button>
              )}
            </div>
          )}

          {!selectedThread ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/75">
              Select a thread from the Threads tab first.
            </div>
          ) : (
            <>
          <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {pagedPosts.map((post) => (
              <article
                key={post.id}
                ref={post.id === lastVisiblePostId ? (node) => { latestPostRef.current = node; } : undefined}
                tabIndex={post.id === lastVisiblePostId ? -1 : undefined}
                className={`rounded-lg border px-3 py-3 ${
                  post.is_hidden ? "border-red-400/40 bg-red-400/10" : "border-white/20 bg-white/5"
                } ${
                  focusedPostId === post.id ? "ring-2 ring-gold/60" : ""
                }`}
              >
                <div
                  className="rich-content mb-2 text-sm text-offwhite"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(post.body) }}
                />
                <p className="text-xs text-mist/70">
                  {post.author?.name ?? "Unknown"} | {new Date(post.created_at).toLocaleString()}
                  {post.is_hidden ? " | Hidden" : ""}
                </p>
                {canModerate && (
                  <div className="mt-2 flex gap-2">
                    {post.is_hidden ? (
                      <button className="rounded-md border border-green-400/40 px-2 py-1 text-xs text-green-200" onClick={() => void togglePostVisibility(post, false)}>
                        Unhide
                      </button>
                    ) : (
                      <button className="rounded-md border border-red-400/40 px-2 py-1 text-xs text-red-200" onClick={() => void togglePostVisibility(post, true)}>
                        Hide
                      </button>
                    )}
                    <button className="rounded-md border border-red-400/40 px-2 py-1 text-xs text-red-200" onClick={() => void deletePost(post)}>
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
            {selectedThread && (selectedThread.posts ?? []).length === 0 && (
              <p className="rounded-md border border-white/20 bg-white/5 px-3 py-3 text-sm text-mist/75">
                No visible posts in this thread yet.
              </p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-mist/75">
            <span>Page {postsPage} of {postsLastPage} | Total {(selectedThread.posts ?? []).length}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={postsPage <= 1}
                onClick={() => setPostsPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={postsPage >= postsLastPage}
                onClick={() => setPostsPage((current) => Math.min(postsLastPage, current + 1))}
              >
                Next
              </button>
            </div>
          </div>

          {selectedThread && canReply && (
            <div className="mt-4 grid gap-3">
              <RichTextEditor
                value={replyBody}
                onChange={setReplyBody}
                onUploadImage={uploadInlineImage}
                disabled={selectedThread.is_locked || saving}
              />
              <p className="-mt-1 text-right text-xs text-mist/75">
                {replyWordCount.toLocaleString()} words
              </p>
              <button
                className="btn-primary justify-self-start disabled:opacity-50"
                disabled={saving || selectedThread.is_locked || !hasReplyBodyContent}
                onClick={() => void addReply()}
              >
                {saving ? "Posting..." : "Post Reply"}
              </button>
            </div>
          )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
