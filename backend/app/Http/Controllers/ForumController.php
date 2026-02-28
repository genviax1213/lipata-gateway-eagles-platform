<?php

namespace App\Http\Controllers;

use App\Support\ImageUploadOptimizer;
use App\Models\ForumPost;
use App\Models\ForumThread;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ForumController extends Controller
{
    private const FORUM_BODY_MAX_CHARS = 60000;

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
            'body' => 'required|string|max:' . self::FORUM_BODY_MAX_CHARS,
        ]);
        $body = $this->sanitizeRichContent($validated['body']);
        if (mb_strlen(trim(strip_tags($body))) < 2) {
            return response()->json(['message' => 'Thread body must contain meaningful content.'], 422);
        }

        /** @var User $user */
        $user = $request->user();

        $thread = ForumThread::query()->create([
            'title' => trim($validated['title']),
            'slug' => $this->uniqueThreadSlug(Str::slug($validated['title'])),
            'body' => $body,
            'created_by_user_id' => $user->id,
            'last_posted_at' => now(),
        ]);

        ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => $body,
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
            'body' => 'required|string|max:' . self::FORUM_BODY_MAX_CHARS,
        ]);
        $body = $this->sanitizeRichContent($validated['body']);
        if (mb_strlen(trim(strip_tags($body))) < 2) {
            return response()->json(['message' => 'Reply must contain meaningful content.'], 422);
        }

        /** @var User $user */
        $user = $request->user();

        $post = ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => $body,
            'created_by_user_id' => $user->id,
            'is_hidden' => false,
        ]);

        $thread->last_posted_at = now();
        $thread->save();

        return response()->json($post->load('author:id,name'), 201);
    }

    public function uploadInlineImage(Request $request)
    {
        $this->ensurePermission($request, 'forum.reply');

        $validated = $request->validate([
            'image' => 'required|image|max:12288',
        ], [
            'image.image' => 'The selected file must be a valid image.',
            'image.max' => 'Image file is too large. Maximum allowed size is 12MB.',
        ]);

        $path = ImageUploadOptimizer::storeOptimizedOrOriginal(
            $validated['image'],
            'forum',
            'public',
            1920,
            1920,
            82,
            true,
            1536 * 1024
        );

        return response()->json([
            'url' => asset('storage/' . $path),
            'path' => $path,
        ], 201);
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

    private function sanitizeRichContent(string $content): string
    {
        $content = trim(str_replace("\r\n", "\n", $content));
        if ($content === '') {
            return '';
        }

        $wrapped = '<!DOCTYPE html><html><body>' . $content . '</body></html>';
        $dom = new \DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $body = $dom->getElementsByTagName('body')->item(0);
        if (!$body instanceof \DOMElement) {
            return '';
        }

        $this->sanitizeNodeChildren($body, $dom);
        return trim($this->innerHtml($body));
    }

    private function sanitizeNodeChildren(\DOMNode $node, \DOMDocument $dom): void
    {
        $allowedTags = [
            'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'code', 'pre',
        ];

        $allowedAttrs = [
            'a' => ['href', 'target', 'rel'],
            'img' => ['src', 'alt', 'title', 'width', 'align'],
            '*' => [],
        ];

        $children = [];
        foreach ($node->childNodes as $child) {
            $children[] = $child;
        }

        foreach ($children as $child) {
            if ($child instanceof \DOMElement) {
                $tag = strtolower($child->tagName);
                if (!in_array($tag, $allowedTags, true)) {
                    while ($child->firstChild) {
                        $node->insertBefore($child->firstChild, $child);
                    }
                    $node->removeChild($child);
                    continue;
                }

                $allowed = array_merge($allowedAttrs['*'], $allowedAttrs[$tag] ?? []);
                $toRemove = [];
                foreach ($child->attributes as $attr) {
                    $name = strtolower($attr->name);
                    if (!in_array($name, $allowed, true)) {
                        $toRemove[] = $name;
                    }
                }
                foreach ($toRemove as $name) {
                    $child->removeAttribute($name);
                }

                if ($tag === 'a') {
                    $href = trim((string) $child->getAttribute('href'));
                    if (!$this->isSafeUrl($href)) {
                        $child->removeAttribute('href');
                    } else {
                        $child->setAttribute('target', '_blank');
                        $child->setAttribute('rel', 'noopener noreferrer nofollow');
                    }
                }

                if ($tag === 'img') {
                    $src = trim((string) $child->getAttribute('src'));
                    if (!$this->isSafeUrl($src)) {
                        $node->removeChild($child);
                        continue;
                    }
                    $align = strtolower(trim((string) $child->getAttribute('align')));
                    if (!in_array($align, ['left', 'right', 'center'], true)) {
                        $child->removeAttribute('align');
                    }
                }

                $this->sanitizeNodeChildren($child, $dom);
            }
        }
    }

    private function isSafeUrl(string $url): bool
    {
        if ($url === '') {
            return false;
        }

        if (str_starts_with($url, '/')) {
            return true;
        }

        return (bool) preg_match('#^https?://#i', $url);
    }

    private function innerHtml(\DOMNode $node): string
    {
        $html = '';
        foreach ($node->childNodes as $child) {
            $html .= $node->ownerDocument?->saveHTML($child) ?? '';
        }
        return $html;
    }
}
