<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (!Schema::hasColumn('members', 'email')) {
                $table->string('email')->nullable()->after('last_name');
                $table->unique('email');
            }

            if (!Schema::hasColumn('members', 'user_id')) {
                $table->foreignId('user_id')->nullable()->after('email')->constrained('users')->nullOnDelete();
                $table->unique('user_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (Schema::hasColumn('members', 'user_id')) {
                $table->dropUnique(['user_id']);
                $table->dropConstrainedForeignId('user_id');
            }

            if (Schema::hasColumn('members', 'email')) {
                $table->dropUnique(['email']);
                $table->dropColumn('email');
            }
        });
    }
};

