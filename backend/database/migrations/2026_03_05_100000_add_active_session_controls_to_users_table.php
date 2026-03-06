<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('active_session_id', 191)->nullable()->after('remember_token');
            $table->unsignedBigInteger('active_token_id')->nullable()->after('active_session_id');
            $table->timestamp('last_activity_at')->nullable()->after('active_token_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['active_session_id', 'active_token_id', 'last_activity_at']);
        });
    }
};

