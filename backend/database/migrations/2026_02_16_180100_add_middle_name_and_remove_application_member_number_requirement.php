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
            if (!Schema::hasColumn('members', 'middle_name')) {
                $table->string('middle_name', 120)->nullable()->after('first_name');
            }
        });

        Schema::table('member_applications', function (Blueprint $table) {
            if (!Schema::hasColumn('member_applications', 'middle_name')) {
                $table->string('middle_name', 120)->nullable()->after('first_name');
            }
        });

        if (Schema::hasColumn('member_applications', 'member_number') && DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE member_applications MODIFY member_number VARCHAR(255) NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('member_applications', 'member_number') && DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE member_applications MODIFY member_number VARCHAR(255) NOT NULL');
        }

        Schema::table('member_applications', function (Blueprint $table) {
            if (Schema::hasColumn('member_applications', 'middle_name')) {
                $table->dropColumn('middle_name');
            }
        });

        Schema::table('members', function (Blueprint $table) {
            if (Schema::hasColumn('members', 'middle_name')) {
                $table->dropColumn('middle_name');
            }
        });
    }
};

