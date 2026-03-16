<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Services\WebPushAnnouncementService;
use App\Support\EmbeddedVideo;
use App\Support\ImageUploadOptimizer;
use App\Support\RoleHierarchy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;
use App\Models\User;
use App\Models\Member;

class PostController extends Controller
{
    private const DEFAULT_CMS_IMAGE_MAX_KB = 12288; // 12 MB
    private const DEFAULT_CMS_IMAGE_TARGET_KB = 1536; // 1.5 MB best-effort output target
    private const MAX_RICH_CONTENT_CHARS = 120000;
    private const MEMBER_ONLY_SECTION = 'resolutions';

    public function __construct(private readonly WebPushAnnouncementService $webPushAnnouncementService)
    {
    }

    public function publicBySection(Request $request, string $section)
    {
        if ($this->isMemberOnlySection($section)) {
            abort(404);
        }

        $query = Post::query()
            ->where('section', $section)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('announcement_audience')->orWhere('announcement_audience', 'public');
            })
            ->latest('published_at')
            ->latest('id');

        if ($request->filled('post_type')) {
            $query->where('post_type', $request->string('post_type'));
        }

        if ($request->filled('q')) {
            $term = trim((string) $request->string('q'));
            $query->where(function ($q) use ($term) {
                $q->where('title', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%")
                    ->orWhere('excerpt', 'like', "%{$term}%")
                    ->orWhere('content', 'like', "%{$term}%")
                    ->orWhere('video_thumbnail_text', 'like', "%{$term}%");
            });
        }

        if (filter_var($request->query('featured_only', false), FILTER_VALIDATE_BOOLEAN)) {
            $query->where('is_featured', true);
        }

        $paginate = filter_var($request->query('paginate', false), FILTER_VALIDATE_BOOLEAN);

        if ($paginate) {
            $perPage = max(1, min(24, (int) $request->query('per_page', 6)));
            $posts = $query->paginate($perPage);
            $posts->getCollection()->transform(fn (Post $post) => $this->transform($post));
            return response()->json($posts);
        }

        $posts = $query->get();
        return response()->json($posts->map(fn (Post $post) => $this->transform($post)));
    }

    public function showPublicImage(string $path)
    {
        $normalized = $this->normalizeStorageImagePath($path);
        if (!$normalized || !Storage::disk('public')->exists($normalized)) {
            abort(404);
        }

        $headers = [
            'Cache-Control' => 'public, max-age=3600',
        ];

        $mime = Storage::disk('public')->mimeType($normalized);
        if (is_string($mime) && $mime !== '') {
            $headers['Content-Type'] = $mime;
        }

        return response()->file(Storage::disk('public')->path($normalized), $headers);
    }

    public function publicHomepageCommunity()
    {
        $posts = Post::query()
            ->where('section', 'activities')
            ->where('show_on_homepage_community', true)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('announcement_audience')->orWhere('announcement_audience', 'public');
            })
            ->latest('published_at')
            ->latest('id')
            ->get();

        return response()->json($posts->map(fn (Post $post) => $this->transform($post)));
    }

    public function publicAnnouncements()
    {
        $posts = $this->announcementQuery(['public'])->get();

        return response()->json($posts->map(fn (Post $post) => $this->transform($post)));
    }

    public function memberAnnouncements()
    {
        $this->ensureAnnouncementMemberAccess(request());
        $posts = $this->announcementQuery(['public', 'members'])->get();

        return response()->json($posts->map(fn (Post $post) => $this->transform($post)));
    }

    public function publicBySlug(string $slug)
    {
        $post = Post::query()
            ->where('slug', $slug)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('announcement_audience')->orWhere('announcement_audience', 'public');
            })
            ->firstOrFail();

        if ($this->isMemberOnlySection($post->section)) {
            abort(404);
        }

        return response()->json($this->transform($post));
    }

    public function memberBySlug(string $slug)
    {
        $this->ensureAnnouncementMemberAccess(request());
        $post = Post::query()
            ->where('slug', $slug)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('announcement_audience')
                    ->orWhereIn('announcement_audience', ['public', 'members']);
            })
            ->firstOrFail();

        if ($this->isMemberOnlySection($post->section)) {
            abort(404);
        }

        return response()->json($this->transform($post));
    }

    public function memberResolutions(Request $request)
    {
        $query = Post::query()
            ->where('section', self::MEMBER_ONLY_SECTION)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->latest('published_at')
            ->latest('id');

        if ($request->filled('q')) {
            $term = trim((string) $request->string('q'));
            $query->where(function ($q) use ($term) {
                $q->where('title', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%")
                    ->orWhere('excerpt', 'like', "%{$term}%")
                    ->orWhere('content', 'like', "%{$term}%");
            });
        }

        $perPage = max(1, min(12, (int) $request->query('per_page', 6)));
        $posts = $query->paginate($perPage);
        $posts->getCollection()->transform(fn (Post $post) => $this->transform($post));

        return response()->json($posts);
    }

    public function index(Request $request)
    {
        $this->authorize('viewCmsIndex', Post::class);

        $query = Post::query()->with('author:id,name');
        if (!$request->user()->can('manageGlobal', Post::class)) {
            $query->where('author_id', $request->user()->id);
        }

        if ($request->filled('section')) {
            $query->where('section', $request->string('section'));
        }

        if ($request->filled('post_type')) {
            $query->where('post_type', $request->string('post_type'));
        }

        if ($request->filled('q')) {
            $term = trim((string) $request->string('q'));
            $query->where(function ($q) use ($term) {
                $q->where('title', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%")
                    ->orWhere('excerpt', 'like', "%{$term}%")
                    ->orWhere('video_thumbnail_text', 'like', "%{$term}%");
            });
        }

        $perPage = max(1, min(50, (int) $request->query('per_page', 12)));
        $posts = $query->latest('id')->paginate($perPage);

        $posts->getCollection()->transform(fn (Post $post) => $this->transform($post, true));

        return response()->json($posts);
    }

    public function availableImages(Request $request)
    {
        $this->authorize('manageGlobal', Post::class);

        return response()->json($this->unlinkedPostImages());
    }

    public function imageLibrary(Request $request)
    {
        $this->authorize('manageGlobal', Post::class);

        $library = collect($this->postImageLibrary());

        $query = trim((string) $request->query('q', ''));
        if ($query !== '') {
            $library = $library->filter(function (array $image) use ($query): bool {
                if (str_contains(strtolower($image['name']), strtolower($query))) {
                    return true;
                }

                foreach ($image['links'] as $link) {
                    if (str_contains(strtolower((string) $link['title']), strtolower($query))) {
                        return true;
                    }
                }

                return false;
            })->values();
        }

        $linkState = (string) $request->query('link_state', 'all');
        if ($linkState === 'linked') {
            $library = $library->where('is_linked', true)->values();
        } elseif ($linkState === 'unlinked') {
            $library = $library->where('is_linked', false)->values();
        }

        $perPage = max(1, min(50, (int) $request->query('per_page', 8)));
        $page = max(1, (int) $request->query('page', 1));
        $total = $library->count();
        $items = $library->slice(($page - 1) * $perPage, $perPage)->values();

        return response()->json([
            'data' => $items,
            'current_page' => $page,
            'last_page' => max(1, (int) ceil($total / $perPage)),
            'per_page' => $perPage,
            'total' => $total,
        ]);
    }

    public function deleteLibraryImage(Request $request)
    {
        $this->authorize('manageGlobal', Post::class);

        if (!$request->user()->hasPermission('posts.delete')) {
            return response()->json([
                'message' => 'You do not have permission to delete CMS images.',
            ], 403);
        }

        $validated = $request->validate([
            'path' => 'required|string|max:255',
        ]);

        $path = $this->normalizeStorageImagePath($validated['path']);
        if (!$path || !Storage::disk('public')->exists($path)) {
            return response()->json([
                'message' => 'Selected image was not found in the library.',
            ], 404);
        }

        $usageIndex = $this->collectPostImageUsageIndex();
        if (!empty($usageIndex[$path] ?? [])) {
            return response()->json([
                'message' => 'Linked images cannot be deleted. Remove the image from linked posts first.',
            ], 422);
        }

        Storage::disk('public')->delete($path);
        $this->deleteMirroredCmsImagePath($path);

        return response()->json([
            'message' => 'Image deleted from library.',
        ]);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Post::class);

        if ($response = $this->rejectIfPayloadTooLarge($request)) {
            return $response;
        }

        $validated = $request->validate([
            'title' => 'required|string|max:160',
            'section' => 'required|string|max:80',
            'post_type' => 'sometimes|in:article,video',
            'excerpt' => 'nullable|string|max:300',
            'content' => [
                Rule::requiredIf(fn () => $request->input('post_type', 'article') !== 'video'),
                'nullable',
                'string',
                'max:' . self::MAX_RICH_CONTENT_CHARS,
            ],
            'is_featured' => 'sometimes|boolean',
            'show_on_homepage_community' => 'sometimes|boolean',
            'show_on_announcement_bar' => 'sometimes|boolean',
            'announcement_text' => 'nullable|string|max:60',
            'announcement_audience' => 'sometimes|in:public,members',
            'send_push_notification' => 'sometimes|boolean',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'image' => 'nullable|image|max:' . $this->maxCmsImageKb(),
            'selected_image_path' => 'nullable|string|max:255',
            'video_url' => 'nullable|string|max:2048',
            'video_thumbnail_url' => 'nullable|url|max:2048',
            'video_thumbnail_text' => 'nullable|string|max:120',
        ], $this->cmsImageValidationMessages());

        $this->ensureSectionWriteAccess($request, (string) $validated['section']);

        $validated['post_type'] = $validated['post_type'] ?? 'article';
        $validated['content'] = $this->sanitizeRichContent((string) ($validated['content'] ?? ''));
        $this->applyVideoPayload($validated);
        $this->applyAnnouncementPayload($validated);

        $slug = Str::slug($validated['title']);
        $validated['slug'] = $this->uniqueSlug($slug);
        $validated['author_id'] = $request->user()->id;

        if ($validated['post_type'] !== 'video' && $request->hasFile('image')) {
            $validated['image_path'] = ImageUploadOptimizer::storeOptimizedOrOriginal(
                $request->file('image'),
                'posts',
                'public',
                1920,
                1920,
                80,
                true,
                $this->targetCmsImageBytes()
            );
            $this->mirrorCmsImagePath($validated['image_path']);
        } elseif ($validated['post_type'] !== 'video' && array_key_exists('selected_image_path', $validated)) {
            $selectedImagePath = $this->normalizeStorageImagePath($validated['selected_image_path']);
            if ($selectedImagePath && $this->isSelectableLibraryImage($selectedImagePath)) {
                $validated['image_path'] = $selectedImagePath;
                $this->mirrorCmsImagePath($validated['image_path']);
            } elseif ($selectedImagePath) {
                return response()->json([
                    'message' => 'Selected image is not available. Please pick one from the image library list.',
                ], 422);
            }
        }

        if ($validated['post_type'] === 'video') {
            $validated['image_path'] = null;
        }

        $post = Post::create($validated);
        $this->dispatchAnnouncementPushIfNeeded($post);

        return response()->json($this->transform($post), 201);
    }

    public function update(Request $request, Post $post)
    {
        if (!$this->canUpdatePost($request, $post)) {
            $this->authorize('update', $post);
        }

        if ($response = $this->rejectIfPayloadTooLarge($request)) {
            return $response;
        }

        $validated = $request->validate([
            'title' => 'required|string|max:160',
            'section' => 'required|string|max:80',
            'post_type' => 'sometimes|in:article,video',
            'excerpt' => 'nullable|string|max:300',
            'content' => [
                Rule::requiredIf(fn () => $request->input('post_type', $post->post_type ?? 'article') !== 'video'),
                'nullable',
                'string',
                'max:' . self::MAX_RICH_CONTENT_CHARS,
            ],
            'is_featured' => 'sometimes|boolean',
            'show_on_homepage_community' => 'sometimes|boolean',
            'show_on_announcement_bar' => 'sometimes|boolean',
            'announcement_text' => 'nullable|string|max:60',
            'announcement_audience' => 'sometimes|in:public,members',
            'send_push_notification' => 'sometimes|boolean',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'image' => 'nullable|image|max:' . $this->maxCmsImageKb(),
            'selected_image_path' => 'nullable|string|max:255',
            'video_url' => 'nullable|string|max:2048',
            'video_thumbnail_url' => 'nullable|url|max:2048',
            'video_thumbnail_text' => 'nullable|string|max:120',
        ], $this->cmsImageValidationMessages());

        $this->ensureSectionWriteAccess($request, (string) $validated['section']);

        $validated['post_type'] = $validated['post_type'] ?? ($post->post_type ?: 'article');
        $validated['content'] = $this->sanitizeRichContent((string) ($validated['content'] ?? ''));
        $this->applyVideoPayload($validated);
        if (!$this->canManageAnnouncementSettings($request)) {
            $this->preserveExistingAnnouncementPayload($validated, $post);
        }
        $this->applyAnnouncementPayload($validated);

        if ($validated['title'] !== $post->title) {
            $post->slug = $this->uniqueSlug(Str::slug($validated['title']), $post->id);
        }

        if ($validated['post_type'] !== 'video' && $request->hasFile('image')) {
            $validated['image_path'] = ImageUploadOptimizer::storeOptimizedOrOriginal(
                $request->file('image'),
                'posts',
                'public',
                1920,
                1920,
                80,
                true,
                $this->targetCmsImageBytes()
            );
            $this->mirrorCmsImagePath($validated['image_path']);
        } elseif ($validated['post_type'] !== 'video' && array_key_exists('selected_image_path', $validated)) {
            $selectedImagePath = $this->normalizeStorageImagePath($validated['selected_image_path']);
            if ($selectedImagePath && $this->isSelectableLibraryImage($selectedImagePath)) {
                $validated['image_path'] = $selectedImagePath;
                $this->mirrorCmsImagePath($validated['image_path']);
            } elseif ($selectedImagePath) {
                return response()->json([
                    'message' => 'Selected image is not available. Please pick one from the image library list.',
                ], 422);
            }
        }

        if ($validated['post_type'] === 'video') {
            $validated['image_path'] = null;
        }

        $post->fill($validated);
        $post->save();
        $this->dispatchAnnouncementPushIfNeeded($post);

        return response()->json($this->transform($post));
    }

    public function destroy(Request $request, Post $post)
    {
        $this->authorize('delete', $post);

        $post->delete();

        return response()->json(['message' => 'Post deleted']);
    }

    public function uploadInlineImage(Request $request)
    {
        $this->authorize('uploadInlineAsset', Post::class);

        if ($response = $this->rejectIfPayloadTooLarge($request)) {
            return $response;
        }

        $validated = $request->validate([
            'image' => 'required|image|max:' . $this->maxCmsImageKb(),
        ], $this->cmsImageValidationMessages());

        $path = ImageUploadOptimizer::storeOptimizedOrOriginal(
            $validated['image'],
            'posts',
            'public',
            1920,
            1920,
            82,
            true,
            $this->targetCmsImageBytes()
        );
        $this->mirrorCmsImagePath($path);

        return response()->json([
            'url' => $this->cmsImageUrl($path),
            'path' => $path,
        ], 201);
    }

    private function mirrorCmsImagePath(?string $imagePath): void
    {
        $path = $this->normalizeStorageImagePath($imagePath);
        $mirrorRoot = rtrim((string) config('app.cms_public_image_mirror_root', ''), '/');

        if (!$path || $mirrorRoot === '' || !Storage::disk('public')->exists($path)) {
            return;
        }

        $target = $mirrorRoot . '/' . $path;
        File::ensureDirectoryExists(dirname($target));
        File::copy(Storage::disk('public')->path($path), $target);
    }

    private function deleteMirroredCmsImagePath(?string $imagePath): void
    {
        $path = $this->normalizeStorageImagePath($imagePath);
        $mirrorRoot = rtrim((string) config('app.cms_public_image_mirror_root', ''), '/');

        if (!$path || $mirrorRoot === '') {
            return;
        }

        File::delete($mirrorRoot . '/' . $path);
    }

    private function uniqueSlug(string $base, ?int $ignoreId = null): string
    {
        $slug = $base !== '' ? $base : Str::random(8);
        $candidate = $slug;
        $i = 2;

        while (Post::query()
            ->where('slug', $candidate)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists()) {
            $candidate = $slug . '-' . $i;
            $i++;
        }

        return $candidate;
    }

    private function transform(Post $post, bool $withAuthor = false): array
    {
        $viewer = request()->user();
        $isOwned = $viewer ? (int) $post->author_id === (int) $viewer->id : false;
        $canEdit = $viewer ? $this->canUpdatePost(request(), $post) || $viewer->can('update', $post) : false;
        $canDelete = $viewer ? $viewer->can('delete', $post) : false;

        $data = [
            'id' => $post->id,
            'title' => $post->title,
            'slug' => $post->slug,
            'section' => $post->section,
            'post_type' => $post->post_type ?: 'article',
            'excerpt' => $post->excerpt,
            'content' => $this->rewriteCmsImageUrls((string) $post->content),
            'image_url' => $this->cmsImageUrl($post->image_path),
            'video_provider' => $post->video_provider,
            'video_url' => $post->video_source_url,
            'video_embed_url' => $post->video_embed_url,
            'video_thumbnail_url' => $this->publicVideoThumbnailUrl($post),
            'video_thumbnail_text' => $post->video_thumbnail_text,
            'is_featured' => (bool) $post->is_featured,
            'show_on_homepage_community' => (bool) $post->show_on_homepage_community,
            'show_on_announcement_bar' => (bool) $post->show_on_announcement_bar,
            'announcement_text' => $post->announcement_text,
            'announcement_audience' => $post->announcement_audience ?: 'public',
            'announcement_expires_at' => optional($post->announcement_expires_at)?->toISOString(),
            'send_push_notification' => (bool) $post->send_push_notification,
            'push_notification_sent_at' => optional($post->push_notification_sent_at)?->toISOString(),
            'status' => $post->status,
            'published_at' => optional($post->published_at)?->toISOString(),
            'created_at' => optional($post->created_at)?->toISOString(),
            'updated_at' => optional($post->updated_at)?->toISOString(),
            'is_owned' => $isOwned,
            'can_edit' => $canEdit,
            'can_delete' => $canDelete,
        ];

        if ($withAuthor) {
            $data['author'] = $post->author ? [
                'id' => $post->author->id,
                'name' => $post->author->name,
            ] : null;
        }

        return $data;
    }

    private function publicVideoThumbnailUrl(Post $post): ?string
    {
        $configured = trim((string) ($post->video_thumbnail_url ?? ''));
        $sourceUrl = trim((string) ($post->video_source_url ?? ''));
        $embedUrl = trim((string) ($post->video_embed_url ?? ''));

        if (($post->video_provider ?? null) === 'youtube') {
            return EmbeddedVideo::youtubeThumbnailUrl($sourceUrl, $embedUrl)
                ?? ($configured !== '' ? $configured : null);
        }

        return $configured !== '' ? $configured : null;
    }

    private function applyVideoPayload(array &$validated): void
    {
        if (($validated['post_type'] ?? 'article') !== 'video') {
            $validated['video_provider'] = null;
            $validated['video_source_url'] = null;
            $validated['video_embed_url'] = null;
            $validated['video_thumbnail_url'] = null;
            $validated['video_thumbnail_text'] = null;
            return;
        }

        $embed = EmbeddedVideo::fromInputUrl($validated['video_url'] ?? null);
        if (!$embed) {
            throw ValidationException::withMessages([
                'video_url' => 'Video posts require a valid YouTube or Facebook URL.',
            ]);
        }

        $validated['video_provider'] = $embed['provider'];
        $validated['video_source_url'] = $embed['source_url'];
        $validated['video_embed_url'] = $embed['embed_url'];
        $validated['video_thumbnail_url'] = trim((string) ($validated['video_thumbnail_url'] ?? '')) ?: null;
        if ($validated['video_thumbnail_url'] === null && $embed['provider'] === 'facebook') {
            $validated['video_thumbnail_url'] = EmbeddedVideo::facebookThumbnailUrl($embed['source_url']);
        }
        $validated['video_thumbnail_text'] = trim((string) ($validated['video_thumbnail_text'] ?? '')) ?: null;
        $validated['content'] = '';
    }

    private function applyAnnouncementPayload(array &$validated): void
    {
        $showOnAnnouncementBar = filter_var($validated['show_on_announcement_bar'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $validated['show_on_announcement_bar'] = $showOnAnnouncementBar;
        $validated['announcement_text'] = trim((string) ($validated['announcement_text'] ?? '')) ?: null;
        $validated['announcement_audience'] = ($validated['announcement_audience'] ?? 'public') === 'members'
            ? 'members'
            : 'public';
        $validated['send_push_notification'] = filter_var($validated['send_push_notification'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (!$showOnAnnouncementBar) {
            $validated['announcement_text'] = null;
            $validated['announcement_audience'] = 'public';
            $validated['announcement_expires_at'] = null;
            $validated['send_push_notification'] = false;
            $validated['push_notification_sent_at'] = null;
            return;
        }

        if (($validated['section'] ?? '') !== 'activities') {
            throw ValidationException::withMessages([
                'show_on_announcement_bar' => 'Only activities articles can appear in the announcement bar.',
            ]);
        }

        if ($validated['announcement_text'] === null) {
            throw ValidationException::withMessages([
                'announcement_text' => 'Announcement text is required when showing an article in the announcement bar.',
            ]);
        }

        $effectiveAt = isset($validated['published_at']) && $validated['published_at']
            ? Carbon::parse((string) $validated['published_at'])
            : now();

        $validated['announcement_expires_at'] = $effectiveAt->copy()->addMonth();
    }

    private function preserveExistingAnnouncementPayload(array &$validated, Post $post): void
    {
        $validated['show_on_announcement_bar'] = (bool) $post->show_on_announcement_bar;
        $validated['announcement_text'] = $post->announcement_text;
        $validated['announcement_audience'] = $post->announcement_audience ?: 'public';
        $validated['announcement_expires_at'] = $post->announcement_expires_at;
        $validated['send_push_notification'] = (bool) $post->send_push_notification;
        $validated['push_notification_sent_at'] = $post->push_notification_sent_at;
    }

    private function dispatchAnnouncementPushIfNeeded(Post $post): void
    {
        if (!$post->show_on_announcement_bar
            || !$post->send_push_notification
            || $post->status !== 'published'
            || ($post->published_at && $post->published_at->isFuture())
            || ($post->announcement_expires_at && $post->announcement_expires_at->isPast())
            || $post->push_notification_sent_at) {
            return;
        }

        try {
            $sent = $this->webPushAnnouncementService->sendAnnouncement($post);
            if ($sent > 0) {
                $post->forceFill([
                    'push_notification_sent_at' => now(),
                ])->save();
            }
        } catch (Throwable $exception) {
            Log::warning('Announcement push dispatch failed.', [
                'post_id' => $post->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function cmsImageUrl(?string $imagePath): ?string
    {
        $path = $this->normalizeStorageImagePath($imagePath);
        if (!$path) {
            return null;
        }

        if (!Storage::disk('public')->exists($path)) {
            return null;
        }

        $root = rtrim((string) config('app.url'), '/');
        return rtrim($root, '/') . '/api/v1/content/images/' . $path;
    }

    private function rewriteCmsImageUrls(string $content): string
    {
        if ($content === '') {
            return $content;
        }

        return (string) preg_replace_callback(
            '/((?:https?:\/\/[^"\'\s>]+)?\/?(?:api\/v1\/content\/images\/|api\/storage\/|storage\/)(posts\/[^"\'\s<>?#]+))/i',
            function (array $matches): string {
                $path = $this->normalizeStorageImagePath($matches[1] ?? null);
                return $path ? ($this->cmsImageUrl($path) ?? $matches[0]) : $matches[0];
            },
            $content
        );
    }

    private function unlinkedPostImages(): array
    {
        return array_values(array_filter($this->postImageLibrary(), fn (array $image): bool => !$image['is_linked']));
    }

    private function postImageLibrary(): array
    {
        $files = Storage::disk('public')->allFiles('posts');
        if ($files === []) {
            return [];
        }

        $usageIndex = $this->collectPostImageUsageIndex();
        $library = [];

        foreach ($files as $file) {
            $path = $this->normalizeStorageImagePath($file);
            if (!$path) {
                continue;
            }

            $links = array_values($usageIndex[$path] ?? []);
            usort($links, fn (array $a, array $b): int => ($a['post_id'] <=> $b['post_id']));

            $library[] = [
                'path' => $path,
                'name' => basename($path),
                'url' => $this->cmsImageUrl($path),
                'is_linked' => count($links) > 0,
                'links' => $links,
            ];
        }

        usort($library, fn (array $a, array $b): int => strcmp($a['name'], $b['name']));

        return $library;
    }

    private function collectPostImageUsageIndex(): array
    {
        $usage = [];
        $posts = Post::query()->select(['id', 'title', 'slug', 'section', 'image_path', 'content'])->get();

        foreach ($posts as $post) {
            $imagePath = $this->normalizeStorageImagePath($post->image_path);
            if ($imagePath) {
                $usage[$imagePath] = $usage[$imagePath] ?? [];
                $existing = $usage[$imagePath][$post->id] ?? $this->newImageUsageEntry($post);
                $existing['usage'][] = 'featured_image';
                $existing['usage'] = array_values(array_unique($existing['usage']));
                $usage[$imagePath][$post->id] = $existing;
            }

            foreach ($this->extractPostImagePathsFromContent((string) $post->content) as $contentImagePath) {
                $usage[$contentImagePath] = $usage[$contentImagePath] ?? [];
                $existing = $usage[$contentImagePath][$post->id] ?? $this->newImageUsageEntry($post);
                $existing['usage'][] = 'content_inline';
                $existing['usage'] = array_values(array_unique($existing['usage']));
                $usage[$contentImagePath][$post->id] = $existing;
            }
        }

        return $usage;
    }

    private function newImageUsageEntry(Post $post): array
    {
        return [
            'post_id' => $post->id,
            'title' => $post->title,
            'slug' => $post->slug,
            'section' => $post->section,
            'usage' => [],
        ];
    }

    private function extractPostImagePathsFromContent(string $content): array
    {
        if ($content === '') {
            return [];
        }

        preg_match_all('/(?:https?:\/\/[^"\'\s>]+)?\/?(?:api\/)?storage\/(posts\/[^"\'\s<>?#]+)/i', $content, $matches);
        if (!isset($matches[1]) || !is_array($matches[1])) {
            return [];
        }

        $paths = [];
        foreach ($matches[1] as $rawPath) {
            $normalized = $this->normalizeStorageImagePath($rawPath);
            if ($normalized) {
                $paths[$normalized] = true;
            }
        }

        return array_keys($paths);
    }

    private function normalizeStorageImagePath(?string $path): ?string
    {
        $value = trim((string) $path);
        if ($value === '') {
            return null;
        }

        $parsedPath = parse_url($value, PHP_URL_PATH);
        if (is_string($parsedPath) && $parsedPath !== '') {
            $value = $parsedPath;
        }

        $value = ltrim($value, '/');

        if (str_starts_with($value, 'api/storage/')) {
            $value = substr($value, strlen('api/storage/'));
        } elseif (str_starts_with($value, 'storage/')) {
            $value = substr($value, strlen('storage/'));
        }

        $value = ltrim($value, '/');
        if ($value === '' || !str_starts_with($value, 'posts/')) {
            return null;
        }

        return $value;
    }

    private function isSelectableLibraryImage(string $path): bool
    {
        $normalized = $this->normalizeStorageImagePath($path);
        return $normalized !== null && Storage::disk('public')->exists($normalized);
    }

    private function maxCmsImageKb(): int
    {
        $value = (int) env('CMS_IMAGE_MAX_KB', self::DEFAULT_CMS_IMAGE_MAX_KB);
        return max(1024, $value);
    }

    private function targetCmsImageBytes(): int
    {
        $valueKb = (int) env('CMS_IMAGE_TARGET_KB', self::DEFAULT_CMS_IMAGE_TARGET_KB);
        $valueKb = max(256, $valueKb);

        return $valueKb * 1024;
    }

    private function cmsImageValidationMessages(): array
    {
        $maxMb = (int) floor($this->maxCmsImageKb() / 1024);

        return [
            'image.image' => 'The selected file must be a valid image.',
            'image.max' => "Image file is too large. Maximum allowed size is {$maxMb}MB.",
            'content.max' => 'Article content is too large. Reduce embedded markup or media.',
        ];
    }

    private function rejectIfPayloadTooLarge(Request $request)
    {
        $contentLength = (int) $request->server('CONTENT_LENGTH', 0);
        $postMax = $this->iniBytes((string) ini_get('post_max_size'));

        if ($contentLength > 0 && $postMax > 0 && $contentLength > $postMax) {
            return response()->json([
                'message' => 'Upload failed: request payload exceeds server post_max_size. Reduce file size or increase server limits.',
            ], 413);
        }

        return null;
    }

    private function iniBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '') {
            return 0;
        }

        $unit = strtolower(substr($value, -1));
        $number = (int) $value;

        return match ($unit) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => (int) $value,
        };
    }

    private function sanitizeRichContent(string $content): string
    {
        $content = trim(str_replace("\r\n", "\n", $content));
        if ($content === '') {
            return '';
        }

        if (!$this->looksLikeHtml($content)) {
            $paragraphs = preg_split("/\n{2,}/", $content) ?: [];
            $safe = array_map(function (string $paragraph): string {
                $escaped = e(trim($paragraph));
                return '<p>' . nl2br($escaped) . '</p>';
            }, array_filter($paragraphs, fn (string $p) => trim($p) !== ''));
            $content = implode('', $safe);
        }

        $wrapped = '<!DOCTYPE html><html><body>' . $content . '</body></html>';
        $dom = new \DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $dom->loadHTML(
            '<?xml encoding="UTF-8">' . $wrapped,
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );
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
            'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'code', 'pre', 'iframe',
        ];

        $allowedAttrs = [
            'a' => ['href', 'target', 'rel'],
            'p' => ['class'],
            'img' => ['src', 'alt', 'title', 'width', 'align'],
            'iframe' => ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy', 'class'],
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

                $allowedForTag = $allowedAttrs[$tag] ?? $allowedAttrs['*'];
                $attrsToRemove = [];
                foreach ($child->attributes as $attr) {
                    $name = strtolower($attr->name);
                    if (!in_array($name, $allowedForTag, true)) {
                        $attrsToRemove[] = $name;
                    }
                }
                foreach ($attrsToRemove as $name) {
                    $child->removeAttribute($name);
                }

                if ($tag === 'a') {
                    $href = trim((string) $child->getAttribute('href'));
                    if (!$this->isSafeUrl($href, true)) {
                        $child->removeAttribute('href');
                    }
                    $target = trim((string) $child->getAttribute('target'));
                    if ($target !== '' && !in_array($target, ['_blank', '_self'], true)) {
                        $child->removeAttribute('target');
                    }
                    if ($child->getAttribute('target') === '_blank') {
                        $child->setAttribute('rel', 'noopener noreferrer');
                    }
                }

                if ($tag === 'p') {
                    $class = trim((string) $child->getAttribute('class'));
                    $tokens = preg_split('/\s+/', $class) ?: [];
                    $tokens = array_values(array_filter($tokens, fn (string $token): bool => $token === 'image-label'));
                    if ($tokens === []) {
                        $child->removeAttribute('class');
                    } else {
                        $child->setAttribute('class', implode(' ', $tokens));
                    }
                }

                if ($tag === 'img') {
                    $src = trim((string) $child->getAttribute('src'));
                    if (!$this->isSafeUrl($src, true)) {
                        $node->removeChild($child);
                        continue;
                    }
                    $align = strtolower(trim((string) $child->getAttribute('align')));
                    if (!in_array($align, ['left', 'right', 'center'], true)) {
                        $child->removeAttribute('align');
                    }
                    $child->removeAttribute('srcset');
                }

                if ($tag === 'iframe') {
                    $src = trim((string) $child->getAttribute('src'));
                    $video = EmbeddedVideo::fromEmbedUrl($src);
                    if (!$video) {
                        $node->removeChild($child);
                        continue;
                    }

                    $child->setAttribute('src', $video['embed_url']);
                    $child->setAttribute('loading', 'lazy');
                    $child->setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                    $child->setAttribute('allowfullscreen', 'allowfullscreen');
                    $child->setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

                    $title = trim((string) $child->getAttribute('title'));
                    if ($title === '') {
                        $child->setAttribute('title', ucfirst($video['provider']) . ' video player');
                    }
                }

                $this->sanitizeNodeChildren($child, $dom);
            }
        }
    }

    private function innerHtml(\DOMElement $element): string
    {
        $html = '';
        foreach ($element->childNodes as $child) {
            $html .= $element->ownerDocument->saveHTML($child);
        }
        return $html;
    }

    private function isSafeUrl(string $url, bool $allowRelative): bool
    {
        if ($url === '') {
            return false;
        }

        $lower = strtolower($url);
        if (str_starts_with($lower, 'javascript:') || str_starts_with($lower, 'data:')) {
            return false;
        }

        if ($allowRelative && (str_starts_with($url, '/') || str_starts_with($url, '#'))) {
            return true;
        }

        $parts = parse_url($url);
        if (!$parts || !isset($parts['scheme'])) {
            return $allowRelative;
        }

        return in_array(strtolower($parts['scheme']), ['http', 'https', 'mailto', 'tel'], true);
    }

    private function looksLikeHtml(string $value): bool
    {
        return preg_match('/<\s*\/?\s*[a-z][^>]*>/i', $value) === 1;
    }

    private function ensureSectionWriteAccess(Request $request, string $section): void
    {
        if (!$this->isMemberOnlySection($section)) {
            return;
        }

        if (!$this->canManageMemberOnlySection($request)) {
            throw ValidationException::withMessages([
                'section' => ['Only superadmin, admin, and secretary can manage resolutions posts.'],
            ]);
        }
    }

    private function isMemberOnlySection(?string $section): bool
    {
        return $section === self::MEMBER_ONLY_SECTION;
    }

    private function canManageMemberOnlySection(Request $request): bool
    {
        $roleName = $request->user()?->role?->name;

        return in_array($roleName, [
            RoleHierarchy::SUPERADMIN,
            RoleHierarchy::ADMIN,
            RoleHierarchy::SECRETARY,
        ], true);
    }

    private function canManageAnnouncementSettings(Request $request): bool
    {
        return (bool) $request->user()?->can('create', Post::class);
    }

    private function ensureAnnouncementMemberAccess(Request $request): void
    {
        if ($this->resolveMemberViewer($request->user()) !== null) {
            return;
        }

        abort(403);
    }

    private function resolveMemberViewer(?User $user): ?Member
    {
        if (!$user) {
            return null;
        }

        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()->where('email', $user->email)->first();
    }

    private function announcementQuery(array $audiences)
    {
        $limit = max(1, min(6, (int) request()->query('limit', 4)));

        return Post::query()
            ->where('section', 'activities')
            ->where('show_on_announcement_bar', true)
            ->whereIn('announcement_audience', $audiences)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('announcement_expires_at')->orWhere('announcement_expires_at', '>', now());
            })
            ->latest('published_at')
            ->latest('id')
            ->limit($limit);
    }

    private function canUpdatePost(Request $request, Post $post): bool
    {
        if ($this->isMemberOnlySection($post->section)) {
            return $this->canManageMemberOnlySection($request);
        }

        return $post->status === 'draft' && $request->user()->can('create', Post::class);
    }
}
