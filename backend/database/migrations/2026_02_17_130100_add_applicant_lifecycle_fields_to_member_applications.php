<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            if (!Schema::hasColumn('applicants', 'user_id')) {
                $table->foreignId('user_id')->nullable()->after('id')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('applicants', 'decision_status')) {
                $table->enum('decision_status', ['pending', 'probation', 'approved', 'rejected'])
                    ->default('pending')
                    ->after('status')
                    ->index();
            }

            if (!Schema::hasColumn('applicants', 'current_stage')) {
                $table->enum('current_stage', [
                    'interview',
                    'introduction',
                    'indoctrination_initiation',
                    'incubation',
                    'induction',
                ])->nullable()->after('decision_status');
            }

            if (!Schema::hasColumn('applicants', 'is_login_blocked')) {
                $table->boolean('is_login_blocked')->default(false)->after('current_stage');
            }
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            if (Schema::hasColumn('applicants', 'is_login_blocked')) {
                $table->dropColumn('is_login_blocked');
            }

            if (Schema::hasColumn('applicants', 'current_stage')) {
                $table->dropColumn('current_stage');
            }

            if (Schema::hasColumn('applicants', 'decision_status')) {
                $table->dropIndex(['decision_status']);
                $table->dropColumn('decision_status');
            }

            if (Schema::hasColumn('applicants', 'user_id')) {
                $table->dropConstrainedForeignId('user_id');
            }
        });
    }
};
