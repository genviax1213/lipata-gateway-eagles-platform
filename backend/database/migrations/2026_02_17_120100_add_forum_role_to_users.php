<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'forum_role')) {
                $table->enum('forum_role', ['forum_moderator'])->nullable()->after('finance_role');
                $table->index('forum_role');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'forum_role')) {
                $table->dropIndex(['forum_role']);
                $table->dropColumn('forum_role');
            }
        });
    }
};
