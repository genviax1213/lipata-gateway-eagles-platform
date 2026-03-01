<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (!Schema::hasColumn('members', 'spouse_name')) {
                $table->string('spouse_name')->nullable()->after('last_name');
            }

            if (!Schema::hasColumn('members', 'contact_number')) {
                $table->string('contact_number', 50)->nullable()->after('membership_status');
            }

            if (!Schema::hasColumn('members', 'address')) {
                $table->text('address')->nullable()->after('contact_number');
            }

            if (!Schema::hasColumn('members', 'date_of_birth')) {
                $table->date('date_of_birth')->nullable()->after('address');
            }

            if (!Schema::hasColumn('members', 'batch')) {
                $table->string('batch')->nullable()->after('date_of_birth');
            }

            if (!Schema::hasColumn('members', 'induction_date')) {
                $table->date('induction_date')->nullable()->after('batch');
            }

            if (!Schema::hasColumn('members', 'source_submitted_at')) {
                $table->timestamp('source_submitted_at')->nullable()->after('induction_date');
            }
        });
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (Schema::hasColumn('members', 'source_submitted_at')) {
                $table->dropColumn('source_submitted_at');
            }

            if (Schema::hasColumn('members', 'induction_date')) {
                $table->dropColumn('induction_date');
            }

            if (Schema::hasColumn('members', 'batch')) {
                $table->dropColumn('batch');
            }

            if (Schema::hasColumn('members', 'date_of_birth')) {
                $table->dropColumn('date_of_birth');
            }

            if (Schema::hasColumn('members', 'address')) {
                $table->dropColumn('address');
            }

            if (Schema::hasColumn('members', 'contact_number')) {
                $table->dropColumn('contact_number');
            }

            if (Schema::hasColumn('members', 'spouse_name')) {
                $table->dropColumn('spouse_name');
            }
        });
    }
};
