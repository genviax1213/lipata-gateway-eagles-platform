<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE applicants MODIFY decision_status ENUM('pending','probation','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending'");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::table('applicants')
            ->where('decision_status', 'withdrawn')
            ->update(['decision_status' => 'pending']);

        DB::statement("ALTER TABLE applicants MODIFY decision_status ENUM('pending','probation','approved','rejected') NOT NULL DEFAULT 'pending'");
    }
};
