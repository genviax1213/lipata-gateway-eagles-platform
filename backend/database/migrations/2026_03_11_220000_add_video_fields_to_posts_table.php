<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->string('post_type', 20)->default('article')->after('section');
            $table->string('video_provider', 20)->nullable()->after('image_path');
            $table->text('video_source_url')->nullable()->after('video_provider');
            $table->text('video_embed_url')->nullable()->after('video_source_url');
            $table->text('video_thumbnail_url')->nullable()->after('video_embed_url');
            $table->string('video_thumbnail_text', 120)->nullable()->after('video_thumbnail_url');
            $table->index(['post_type', 'section', 'status', 'published_at'], 'posts_type_section_status_index');
        });

        DB::table('posts')->update([
            'post_type' => 'article',
        ]);
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropIndex('posts_type_section_status_index');
            $table->dropColumn([
                'post_type',
                'video_provider',
                'video_source_url',
                'video_embed_url',
                'video_thumbnail_url',
                'video_thumbnail_text',
            ]);
        });
    }
};
