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

        Schema::table('applicants', function (Blueprint $table) {
            if (!Schema::hasColumn('applicants', 'middle_name')) {
                $table->string('middle_name', 120)->nullable()->after('first_name');
            }
        });

        if (Schema::hasColumn('applicants', 'member_number') && DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE applicants MODIFY member_number VARCHAR(255) NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('applicants', 'member_number') && DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE applicants MODIFY member_number VARCHAR(255) NOT NULL');
        }

        Schema::table('applicants', function (Blueprint $table) {
            if (Schema::hasColumn('applicants', 'middle_name')) {
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

