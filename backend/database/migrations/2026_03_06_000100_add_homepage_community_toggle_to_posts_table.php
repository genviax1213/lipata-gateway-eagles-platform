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
            $table->boolean('show_on_homepage_community')->default(false)->after('is_featured');
            $table->index(['show_on_homepage_community', 'status', 'published_at'], 'posts_homepage_community_index');
        });

        DB::table('posts')
            ->where('section', 'homepage_community')
            ->update([
                'section' => 'activities',
                'show_on_homepage_community' => true,
            ]);
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropIndex('posts_homepage_community_index');
            $table->dropColumn('show_on_homepage_community');
        });
    }
};
