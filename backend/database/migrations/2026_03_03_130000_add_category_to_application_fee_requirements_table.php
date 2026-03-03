<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('application_fee_requirements', function (Blueprint $table) {
            if (!Schema::hasColumn('application_fee_requirements', 'category')) {
                $table->enum('category', [
                    'project',
                    'community_service',
                    'fellowship',
                    'five_i_activities',
                ])->default('project')->after('member_application_id');
                $table->index(['member_application_id', 'category'], 'app_fee_req_application_category_idx');
            }
        });

        DB::table('application_fee_requirements')
            ->whereNull('category')
            ->update(['category' => 'project']);
    }

    public function down(): void
    {
        Schema::table('application_fee_requirements', function (Blueprint $table) {
            if (Schema::hasColumn('application_fee_requirements', 'category')) {
                $table->dropIndex('app_fee_req_application_category_idx');
                $table->dropColumn('category');
            }
        });
    }
};
