<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('member_applications', function (Blueprint $table) {
            if (!Schema::hasColumn('member_applications', 'member_id')) {
                $table->foreignId('member_id')->nullable()->after('user_id')->constrained('members')->nullOnDelete();
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE member_applications MODIFY status ENUM('pending_verification','pending_approval','under_review','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending_verification'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('active','inactive','applicant') NOT NULL DEFAULT 'applicant'");
        }

        DB::table('member_applications')
            ->where('status', 'pending_approval')
            ->update(['status' => 'under_review']);

        DB::table('member_applications')
            ->whereIn('membership_status', ['active', 'inactive'])
            ->update(['membership_status' => 'applicant']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE member_applications MODIFY status ENUM('pending_verification','under_review','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending_verification'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('applicant') NOT NULL DEFAULT 'applicant'");
        }
    }

    public function down(): void
    {
        DB::table('member_applications')
            ->where('status', 'under_review')
            ->update(['status' => 'pending_approval']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE member_applications MODIFY status ENUM('pending_verification','pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_verification'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('active','inactive','applicant') NOT NULL DEFAULT 'applicant'");
        }

        Schema::table('member_applications', function (Blueprint $table) {
            if (Schema::hasColumn('member_applications', 'member_id')) {
                $table->dropConstrainedForeignId('member_id');
            }
        });
    }
};
