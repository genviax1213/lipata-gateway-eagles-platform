import { useCallback, useEffect, useMemo, useState } from "react";
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
}

export default function Forum() {
  const { user } = useAuth();
  const roleName = (user?.role as { name?: unknown } | undefined)?.name;
  const isApplicant = roleName === "applicant";
  const canViewForum = !isApplicant;
  const canCreateThread = !isApplicant;
  const canReply = !isApplicant;
  const canModerate = hasPermission(user, "forum.moderate");
  const currentUserId = typeof user?.id === "number" ? user.id : null;

  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [selectedThread, setSelectedThread] = useState<ForumThread | null>(null);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  const fetchThreads = useCallback(async (silent = false) => {
    if (!canViewForum) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await api.get<ThreadListPayload>("/forum/threads", { params: { search } });
      const items = res.data.data ?? [];
      setThreads(items);
      if (!selectedThreadId && items.length > 0) {
        setSelectedThreadId(items[0].id);
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
  }, [canViewForum, search, selectedThreadId]);

  const fetchThread = useCallback(async (threadId: number, silent = false) => {
    if (!canViewForum) return;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await api.get<{ thread: ForumThread }>(`/forum/threads/${threadId}`);
      setSelectedThread(res.data.thread);
    } catch (err) {
      if (!silent) {
        setError(parseError(err, "Unable to load selected thread."));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [canViewForum]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      return;
    }

    void fetchThread(selectedThreadId);
  }, [fetchThread, selectedThreadId]);

  useEffect(() => {
    if (!canViewForum) return;

    const timer = window.setInterval(() => {
      void fetchThreads(true);
      if (selectedThreadId) {
        void fetchThread(selectedThreadId, true);
      }
    }, FORUM_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [canViewForum, fetchThread, fetchThreads, selectedThreadId]);

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
      await fetchThreads();
      setSelectedThreadId(res.data.id);
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
      await fetchThreads();
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
      await fetchThreads();
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
      await fetchThreads();
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

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          aria-label="Search forum threads"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search forum threads"
          className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
        />
        <button className="btn-secondary" onClick={() => void fetchThreads()}>Search</button>
      </div>

      {canCreateThread && (
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

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 font-heading text-2xl text-offwhite">Threads</h2>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {!loading && threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
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
        </div>

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

          <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {(selectedThread?.posts ?? []).map((post) => (
              <article key={post.id} className={`rounded-lg border px-3 py-3 ${post.is_hidden ? "border-red-400/40 bg-red-400/10" : "border-white/20 bg-white/5"}`}>
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
        </div>
      </div>
    </section>
  );
}
  const FORUM_REFRESH_MS = 3000;
