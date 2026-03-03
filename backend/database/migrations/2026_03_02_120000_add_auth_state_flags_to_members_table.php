<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (!Schema::hasColumn('members', 'email_verified')) {
                $table->boolean('email_verified')->default(false)->after('email');
                $table->index('email_verified');
            }

            if (!Schema::hasColumn('members', 'password_set')) {
                $table->boolean('password_set')->default(false)->after('email_verified');
                $table->index('password_set');
            }
        });

        DB::statement(
            "UPDATE members
            SET email_verified = CASE
                    WHEN user_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM users
                        WHERE users.id = members.user_id
                          AND users.email_verified_at IS NOT NULL
                    ) THEN 1
                    ELSE 0
                END,
                password_set = CASE
                    WHEN user_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM users
                        WHERE users.id = members.user_id
                          AND users.password IS NOT NULL
                          AND TRIM(users.password) <> ''
                    ) THEN 1
                    ELSE 0
                END"
        );
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (Schema::hasColumn('members', 'password_set')) {
                $table->dropIndex(['password_set']);
                $table->dropColumn('password_set');
            }

            if (Schema::hasColumn('members', 'email_verified')) {
                $table->dropIndex(['email_verified']);
                $table->dropColumn('email_verified');
            }
        });
    }
};
