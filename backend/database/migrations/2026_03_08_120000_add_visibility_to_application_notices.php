<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('application_notices', function (Blueprint $table) {
            $table->string('visibility', 20)->default('applicant')->after('notice_text');
        });

        DB::table('application_notices')
            ->whereNull('visibility')
            ->update(['visibility' => 'applicant']);
    }

    public function down(): void
    {
        Schema::table('application_notices', function (Blueprint $table) {
            $table->dropColumn('visibility');
        });
    }
};
