<?php

namespace App\Http\Controllers;

use App\Models\ForumPost;
use App\Models\ForumThread;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ForumController extends Controller
{
    private function isSuperAdmin(User $user): bool
    {
        return (string) $user->email === 'admin@lipataeagles.ph';
    }

    private function canModerate(User $user): bool
    {
        return $this->isSuperAdmin($user) || $user->hasPermission('forum.moderate');
    }

    private function hasGeneralForumAccess(User $user): bool
    {
        $roleName = optional($user->role)->name;
        return $roleName !== 'applicant';
    }

    private function ensurePermission(Request $request, string $permission): void
    {
        /** @var User $user */
        $user = $request->user();

        if ($this->isSuperAdmin($user)) {
            return;
        }

        if (
            in_array($permission, ['forum.view', 'forum.create_thread', 'forum.reply'], true)
            && $this->hasGeneralForumAccess($user)
        ) {
            return;
        }

        if (!$user->hasPermission($permission)) {
            abort(403, 'Insufficient forum privileges.');
        }
    }

    private function uniqueThreadSlug(string $base): string
    {
        $slug = $base !== '' ? $base : Str::random(8);
        $candidate = $slug;
        $i = 2;

        while (ForumThread::query()->where('slug', $candidate)->exists()) {
            $candidate = $slug . '-' . $i;
            $i++;
        }

        return $candidate;
    }

    public function index(Request $request)
    {
        $this->ensurePermission($request, 'forum.view');

        $search = (string) $request->query('search', '');

        $query = ForumThread::query()
            ->with(['author:id,name'])
            ->withCount([
                'posts as visible_posts_count' => fn ($q) => $q->where('is_hidden', false),
            ])
            ->orderByDesc('is_pinned')
            ->orderByDesc('last_posted_at')
            ->orderByDesc('created_at');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%' . $search . '%')
                    ->orWhere('body', 'like', '%' . $search . '%');
            });
        }

        return response()->json($query->paginate(20));
    }

    public function show(Request $request, ForumThread $thread)
    {
        $this->ensurePermission($request, 'forum.view');

        $thread->load(['author:id,name']);
        $thread->load([
            'posts' => function ($q) use ($request) {
                /** @var User $user */
                $user = $request->user();
                if (!$this->canModerate($user)) {
                    $q->where('is_hidden', false);
                }
                $q->with('author:id,name')->orderBy('created_at');
            },
        ]);

        return response()->json([
            'thread' => $thread,
        ]);
    }

    public function storeThread(Request $request)
    {
        $this->ensurePermission($request, 'forum.create_thread');

        $validated = $request->validate([
            'title' => 'required|string|min:5|max:180',
            'body' => 'required|string|min:5|max:5000',
        ]);

        /** @var User $user */
        $user = $request->user();

        $thread = ForumThread::query()->create([
            'title' => trim($validated['title']),
            'slug' => $this->uniqueThreadSlug(Str::slug($validated['title'])),
            'body' => trim($validated['body']),
            'created_by_user_id' => $user->id,
            'last_posted_at' => now(),
        ]);

        ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => trim($validated['body']),
            'created_by_user_id' => $user->id,
            'is_hidden' => false,
        ]);

        return response()->json($thread->load('author:id,name'), 201);
    }

    public function storeReply(Request $request, ForumThread $thread)
    {
        $this->ensurePermission($request, 'forum.reply');

        if ($thread->is_locked) {
            return response()->json(['message' => 'Thread is locked by forum moderators.'], 422);
        }

        $validated = $request->validate([
            'body' => 'required|string|min:2|max:5000',
        ]);

        /** @var User $user */
        $user = $request->user();

        $post = ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => trim($validated['body']),
            'created_by_user_id' => $user->id,
            'is_hidden' => false,
        ]);

        $thread->last_posted_at = now();
        $thread->save();

        return response()->json($post->load('author:id,name'), 201);
    }

    public function setThreadLock(Request $request, ForumThread $thread)
    {
        $this->ensurePermission($request, 'forum.moderate');

        $validated = $request->validate([
            'locked' => 'required|boolean',
        ]);

        $thread->is_locked = (bool) $validated['locked'];
        $thread->save();

        return response()->json([
            'message' => $thread->is_locked ? 'Thread locked.' : 'Thread unlocked.',
            'thread' => $thread->fresh()->load('author:id,name'),
        ]);
    }

    public function setPostVisibility(Request $request, ForumPost $post)
    {
        $this->ensurePermission($request, 'forum.moderate');

        $validated = $request->validate([
            'hidden' => 'required|boolean',
        ]);

        $post->is_hidden = (bool) $validated['hidden'];
        $post->save();

        return response()->json([
            'message' => $post->is_hidden ? 'Post hidden.' : 'Post unhidden.',
            'post' => $post->fresh()->load('author:id,name'),
        ]);
    }

    public function destroyThread(Request $request, ForumThread $thread)
    {
        /** @var User $user */
        $user = $request->user();

        $isThreadStarter = (int) $thread->created_by_user_id === (int) $user->id;
        if (!$isThreadStarter && !$this->canModerate($user)) {
            abort(403, 'Only the thread starter, forum moderators, or admins can delete this thread.');
        }

        $thread->delete();

        return response()->json(['message' => 'Thread deleted.']);
    }

    public function destroyPost(Request $request, ForumPost $post)
    {
        /** @var User $user */
        $user = $request->user();
        if (!$this->canModerate($user)) {
            abort(403, 'Only forum moderators or admins can delete posts.');
        }

        $thread = $post->thread;
        $post->delete();

        if ($thread) {
            $latestPostAt = ForumPost::query()
                ->where('thread_id', $thread->id)
                ->latest('created_at')
                ->value('created_at');

            $thread->last_posted_at = $latestPostAt ?? $thread->created_at;
            $thread->save();
        }

        return response()->json(['message' => 'Post deleted.']);
    }
}
