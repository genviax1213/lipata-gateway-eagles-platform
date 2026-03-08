<?php

use App\Models\Applicant;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('applicants')
            ->where('status', 'pending_approval')
            ->update(['status' => Applicant::STATUS_UNDER_REVIEW]);

        DB::table('applicants')
            ->where('status', 'approved')
            ->update(['status' => Applicant::STATUS_OFFICIAL_APPLICANT]);

        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement(
            "ALTER TABLE applicants MODIFY status ENUM(
                'pending_verification',
                'under_review',
                'official_applicant',
                'eligible_for_activation',
                'activated',
                'rejected',
                'withdrawn'
            ) NOT NULL DEFAULT 'pending_verification'"
        );
    }

    public function down(): void
    {
        DB::table('applicants')
            ->where('status', Applicant::STATUS_OFFICIAL_APPLICANT)
            ->update(['status' => 'approved']);

        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement(
            "ALTER TABLE applicants MODIFY status ENUM(
                'pending_verification',
                'under_review',
                'approved',
                'rejected',
                'withdrawn'
            ) NOT NULL DEFAULT 'pending_verification'"
        );
    }
};
