<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Support\ImageUploadOptimizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PostController extends Controller
{
    private const DEFAULT_CMS_IMAGE_MAX_KB = 12288; // 12 MB
    private const DEFAULT_CMS_IMAGE_TARGET_KB = 1536; // 1.5 MB best-effort output target
    private const MAX_RICH_CONTENT_CHARS = 120000;

    public function publicBySection(Request $request, string $section)
    {
        $query = Post::query()
            ->where('section', $section)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->latest('published_at')
            ->latest('id');

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

    public function publicBySlug(string $slug)
    {
        $post = Post::query()
            ->where('slug', $slug)
            ->where('status', 'published')
            ->where(function ($q) {
                $q->whereNull('published_at')->orWhere('published_at', '<=', now());
            })
            ->firstOrFail();

        return response()->json($this->transform($post));
    }

    public function index(Request $request)
    {
        $this->authorize('viewCmsIndex', Post::class);

        $query = Post::query()->with('author:id,name');

        if ($request->filled('section')) {
            $query->where('section', $request->string('section'));
        }

        $posts = $query->latest('id')->paginate(20);

        $posts->getCollection()->transform(fn (Post $post) => $this->transform($post, true));

        return response()->json($posts);
    }

    public function availableImages(Request $request)
    {
        $this->authorize('viewCmsIndex', Post::class);

        return response()->json($this->unlinkedPostImages());
    }

    public function imageLibrary(Request $request)
    {
        $this->authorize('viewCmsIndex', Post::class);

        return response()->json($this->postImageLibrary());
    }

    public function store(Request $request)
    {
        if ($response = $this->rejectIfPayloadTooLarge($request)) {
            return $response;
        }

        $validated = $request->validate([
            'title' => 'required|string|max:160',
            'section' => 'required|string|max:80',
            'excerpt' => 'nullable|string|max:300',
            'content' => 'required|string|max:' . self::MAX_RICH_CONTENT_CHARS,
            'is_featured' => 'sometimes|boolean',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'image' => 'nullable|image|max:' . $this->maxCmsImageKb(),
            'selected_image_path' => 'nullable|string|max:255',
        ], $this->cmsImageValidationMessages());

        $validated['content'] = $this->sanitizeRichContent($validated['content']);

        $slug = Str::slug($validated['title']);
        $validated['slug'] = $this->uniqueSlug($slug);
        $validated['author_id'] = $request->user()->id;

        if ($request->hasFile('image')) {
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
        } elseif (array_key_exists('selected_image_path', $validated)) {
            $selectedImagePath = $this->normalizeStorageImagePath($validated['selected_image_path']);
            if ($selectedImagePath && $this->isSelectableLibraryImage($selectedImagePath)) {
                $validated['image_path'] = $selectedImagePath;
            } elseif ($selectedImagePath) {
                return response()->json([
                    'message' => 'Selected image is not available. Please pick one from the image library list.',
                ], 422);
            }
        }

        $post = Post::create($validated);

        return response()->json($this->transform($post), 201);
    }

    public function update(Request $request, Post $post)
    {
        if ($response = $this->rejectIfPayloadTooLarge($request)) {
            return $response;
        }

        $validated = $request->validate([
            'title' => 'required|string|max:160',
            'section' => 'required|string|max:80',
            'excerpt' => 'nullable|string|max:300',
            'content' => 'required|string|max:' . self::MAX_RICH_CONTENT_CHARS,
            'is_featured' => 'sometimes|boolean',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'image' => 'nullable|image|max:' . $this->maxCmsImageKb(),
            'selected_image_path' => 'nullable|string|max:255',
        ], $this->cmsImageValidationMessages());

        $validated['content'] = $this->sanitizeRichContent($validated['content']);

        if ($validated['title'] !== $post->title) {
            $post->slug = $this->uniqueSlug(Str::slug($validated['title']), $post->id);
        }

        if ($request->hasFile('image')) {
            if ($post->image_path) {
                Storage::disk('public')->delete($post->image_path);
            }
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
        } elseif (array_key_exists('selected_image_path', $validated)) {
            $selectedImagePath = $this->normalizeStorageImagePath($validated['selected_image_path']);
            if ($selectedImagePath && $this->isSelectableLibraryImage($selectedImagePath)) {
                $validated['image_path'] = $selectedImagePath;
            } elseif ($selectedImagePath) {
                return response()->json([
                    'message' => 'Selected image is not available. Please pick one from the image library list.',
                ], 422);
            }
        }

        $post->fill($validated);
        $post->save();

        return response()->json($this->transform($post));
    }

    public function destroy(Request $request, Post $post)
    {
        if ($post->image_path) {
            Storage::disk('public')->delete($post->image_path);
        }

        $post->delete();

        return response()->json(['message' => 'Post deleted']);
    }

    public function uploadInlineImage(Request $request)
    {
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

        return response()->json([
            'url' => asset('storage/' . $path),
            'path' => $path,
        ], 201);
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
        $data = [
            'id' => $post->id,
            'title' => $post->title,
            'slug' => $post->slug,
            'section' => $post->section,
            'excerpt' => $post->excerpt,
            'content' => $post->content,
            'image_url' => $this->resolveImageUrl($post->image_path),
            'is_featured' => (bool) $post->is_featured,
            'status' => $post->status,
            'published_at' => optional($post->published_at)?->toISOString(),
            'created_at' => optional($post->created_at)?->toISOString(),
        ];

        if ($withAuthor) {
            $data['author'] = $post->author ? [
                'id' => $post->author->id,
                'name' => $post->author->name,
            ] : null;
        }

        return $data;
    }

    private function resolveImageUrl(?string $imagePath): ?string
    {
        $path = trim((string) $imagePath);
        if ($path === '') {
            return null;
        }

        if (!Storage::disk('public')->exists($path)) {
            return null;
        }

        return asset('storage/' . $path);
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
                'url' => asset('storage/' . $path),
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
            'p' => ['class'],
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
}
