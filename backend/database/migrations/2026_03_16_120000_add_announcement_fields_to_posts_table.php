<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->boolean('show_on_announcement_bar')->default(false)->after('show_on_homepage_community');
            $table->string('announcement_text', 60)->nullable()->after('show_on_announcement_bar');
            $table->timestamp('announcement_expires_at')->nullable()->after('announcement_text');
            $table->boolean('send_push_notification')->default(false)->after('announcement_expires_at');
            $table->timestamp('push_notification_sent_at')->nullable()->after('send_push_notification');
            $table->index(
                ['show_on_announcement_bar', 'announcement_expires_at', 'section', 'status', 'published_at'],
                'posts_announcement_bar_index'
            );
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropIndex('posts_announcement_bar_index');
            $table->dropColumn([
                'show_on_announcement_bar',
                'announcement_text',
                'announcement_expires_at',
                'send_push_notification',
                'push_notification_sent_at',
            ]);
        });
    }
};
