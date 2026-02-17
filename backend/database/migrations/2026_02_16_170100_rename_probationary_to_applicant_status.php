<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE members MODIFY membership_status ENUM('active','inactive','probationary','applicant') NOT NULL DEFAULT 'active'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('active','inactive','probationary','applicant') NOT NULL DEFAULT 'applicant'");
        }

        DB::table('members')
            ->where('membership_status', 'probationary')
            ->update(['membership_status' => 'applicant']);

        DB::table('member_applications')
            ->where('membership_status', 'probationary')
            ->update(['membership_status' => 'applicant']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE members MODIFY membership_status ENUM('active','inactive','applicant') NOT NULL DEFAULT 'active'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('active','inactive','applicant') NOT NULL DEFAULT 'applicant'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE members MODIFY membership_status ENUM('active','inactive','probationary','applicant') NOT NULL DEFAULT 'active'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('active','inactive','probationary','applicant') NOT NULL DEFAULT 'probationary'");
        }

        DB::table('members')
            ->where('membership_status', 'applicant')
            ->update(['membership_status' => 'probationary']);

        DB::table('member_applications')
            ->where('membership_status', 'applicant')
            ->update(['membership_status' => 'probationary']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE members MODIFY membership_status ENUM('active','inactive','probationary') NOT NULL DEFAULT 'active'");
            DB::statement("ALTER TABLE member_applications MODIFY membership_status ENUM('active','inactive','probationary') NOT NULL DEFAULT 'probationary'");
        }
    }
};
