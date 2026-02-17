<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('section');
            $table->string('excerpt', 280)->nullable();
            $table->longText('content');
            $table->string('image_path')->nullable();
            $table->boolean('is_featured')->default(false);
            $table->enum('status', ['draft', 'published'])->default('draft');
            $table->timestamp('published_at')->nullable();
            $table->foreignId('author_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['section', 'status', 'published_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
