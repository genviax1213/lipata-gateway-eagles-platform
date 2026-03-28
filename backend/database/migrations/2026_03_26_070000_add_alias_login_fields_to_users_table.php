<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (!Schema::hasColumn('users', 'recovery_email')) {
                $table->string('recovery_email')->nullable()->after('email');
                $table->index('recovery_email');
            }

            if (!Schema::hasColumn('users', 'login_email_locked')) {
                $table->boolean('login_email_locked')->default(false)->after('recovery_email');
                $table->index('login_email_locked');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'login_email_locked')) {
                $table->dropIndex(['login_email_locked']);
                $table->dropColumn('login_email_locked');
            }

            if (Schema::hasColumn('users', 'recovery_email')) {
                $table->dropIndex(['recovery_email']);
                $table->dropColumn('recovery_email');
            }
        });
    }
};

