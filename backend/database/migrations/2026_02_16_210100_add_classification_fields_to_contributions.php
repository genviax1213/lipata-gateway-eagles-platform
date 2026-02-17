<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contributions', function (Blueprint $table) {
            if (!Schema::hasColumn('contributions', 'category')) {
                $table->enum('category', [
                    'monthly_contribution',
                    'alalayang_agila_contribution',
                    'project_contribution',
                    'extra_contribution',
                ])->default('monthly_contribution')->after('member_id');
                $table->index('category');
            }

            if (!Schema::hasColumn('contributions', 'contribution_date')) {
                $table->date('contribution_date')->nullable()->after('category');
                $table->index('contribution_date');
            }

            if (!Schema::hasColumn('contributions', 'beneficiary_member_id')) {
                $table->foreignId('beneficiary_member_id')->nullable()->after('note')->constrained('members')->nullOnDelete();
            }

            if (!Schema::hasColumn('contributions', 'recipient_name')) {
                $table->string('recipient_name', 255)->nullable()->after('beneficiary_member_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contributions', function (Blueprint $table) {
            if (Schema::hasColumn('contributions', 'recipient_name')) {
                $table->dropColumn('recipient_name');
            }

            if (Schema::hasColumn('contributions', 'beneficiary_member_id')) {
                $table->dropConstrainedForeignId('beneficiary_member_id');
            }

            if (Schema::hasColumn('contributions', 'contribution_date')) {
                $table->dropIndex(['contribution_date']);
                $table->dropColumn('contribution_date');
            }

            if (Schema::hasColumn('contributions', 'category')) {
                $table->dropIndex(['category']);
                $table->dropColumn('category');
            }
        });
    }
};
