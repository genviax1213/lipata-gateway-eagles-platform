<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forum_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained('forum_threads')->cascadeOnDelete();
            $table->text('body');
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_hidden')->default(false)->index();
            $table->timestamps();

            $table->index(['thread_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('forum_posts');
    }
};
