<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'must_change_password')) {
                $table->boolean('must_change_password')->default(false)->after('forum_role');
            }

            if (!Schema::hasColumn('users', 'mobile_access_enabled')) {
                $table->boolean('mobile_access_enabled')->default(false)->after('must_change_password');
            }

            if (!Schema::hasColumn('users', 'mobile_chat_enabled')) {
                $table->boolean('mobile_chat_enabled')->default(false)->after('mobile_access_enabled');
            }

            if (!Schema::hasColumn('users', 'last_password_changed_at')) {
                $table->timestamp('last_password_changed_at')->nullable()->after('mobile_chat_enabled');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $columns = array_filter([
                Schema::hasColumn('users', 'last_password_changed_at') ? 'last_password_changed_at' : null,
                Schema::hasColumn('users', 'mobile_chat_enabled') ? 'mobile_chat_enabled' : null,
                Schema::hasColumn('users', 'mobile_access_enabled') ? 'mobile_access_enabled' : null,
                Schema::hasColumn('users', 'must_change_password') ? 'must_change_password' : null,
            ]);

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
