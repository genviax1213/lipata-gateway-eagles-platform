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
            $table->string('announcement_audience', 20)
                ->default('public')
                ->after('announcement_text');
        });

        DB::table('posts')
            ->whereNull('announcement_audience')
            ->update(['announcement_audience' => 'public']);
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn('announcement_audience');
        });
    }
};
