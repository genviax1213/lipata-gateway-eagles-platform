<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Support\ImageUploadOptimizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PostController extends Controller
{
    private function ensurePermission(Request $request, string $permission): void
    {
        $user = $request->user();
        $email = (string) $user->email;

        if ($email === 'admin@lipataeagles.ph') {
            return;
        }

        if (!$user->hasPermission($permission)) {
            abort(403, 'Insufficient privileges for this action.');
        }
    }

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
        $this->ensurePermission($request, 'posts.view');

        $query = Post::query()->with('author:id,name');

        if ($request->filled('section')) {
            $query->where('section', $request->string('section'));
        }

        $posts = $query->latest('id')->paginate(20);

        $posts->getCollection()->transform(fn (Post $post) => $this->transform($post, true));

        return response()->json($posts);
    }

    public function store(Request $request)
    {
        $this->ensurePermission($request, 'posts.create');

        $validated = $request->validate([
            'title' => 'required|string|max:160',
            'section' => 'required|string|max:80',
            'excerpt' => 'nullable|string|max:300',
            'content' => 'required|string|max:30000',
            'is_featured' => 'sometimes|boolean',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'image' => 'nullable|image|max:5120',
        ]);

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
                true
            );
        }

        $post = Post::create($validated);

        return response()->json($this->transform($post), 201);
    }

    public function update(Request $request, Post $post)
    {
        $this->ensurePermission($request, 'posts.update');

        $validated = $request->validate([
            'title' => 'required|string|max:160',
            'section' => 'required|string|max:80',
            'excerpt' => 'nullable|string|max:300',
            'content' => 'required|string|max:30000',
            'is_featured' => 'sometimes|boolean',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'image' => 'nullable|image|max:5120',
        ]);

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
                true
            );
        }

        $post->fill($validated);
        $post->save();

        return response()->json($this->transform($post));
    }

    public function destroy(Request $request, Post $post)
    {
        $this->ensurePermission($request, 'posts.delete');

        if ($post->image_path) {
            Storage::disk('public')->delete($post->image_path);
        }

        $post->delete();

        return response()->json(['message' => 'Post deleted']);
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
            'image_url' => $post->image_path ? asset('storage/' . $post->image_path) : null,
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
}
