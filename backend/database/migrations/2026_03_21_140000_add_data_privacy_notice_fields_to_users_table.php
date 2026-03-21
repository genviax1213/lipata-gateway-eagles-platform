<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('data_privacy_notice_acknowledged_at')->nullable()->after('last_activity_at');
            $table->string('data_privacy_notice_acknowledged_version', 40)->nullable()->after('data_privacy_notice_acknowledged_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'data_privacy_notice_acknowledged_at',
                'data_privacy_notice_acknowledged_version',
            ]);
        });
    }
};
