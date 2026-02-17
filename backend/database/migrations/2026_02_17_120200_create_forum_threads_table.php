<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forum_threads', function (Blueprint $table) {
            $table->id();
            $table->string('title', 180);
            $table->string('slug', 200)->unique();
            $table->text('body');
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_locked')->default(false);
            $table->boolean('is_pinned')->default(false);
            $table->timestamp('last_posted_at')->nullable()->index();
            $table->timestamps();

            $table->index(['is_pinned', 'last_posted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forum_threads');
    }
};
