<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicant_batch_expenses', function (Blueprint $table): void {
            if (!Schema::hasColumn('applicant_batch_expenses', 'support_reference')) {
                $table->string('support_reference', 255)->nullable()->after('note');
            }

            if (!Schema::hasColumn('applicant_batch_expenses', 'approval_reference')) {
                $table->string('approval_reference', 255)->nullable()->after('support_reference');
            }
        });
    }

    public function down(): void
    {
        Schema::table('applicant_batch_expenses', function (Blueprint $table): void {
            if (Schema::hasColumn('applicant_batch_expenses', 'approval_reference')) {
                $table->dropColumn('approval_reference');
            }

            if (Schema::hasColumn('applicant_batch_expenses', 'support_reference')) {
                $table->dropColumn('support_reference');
            }
        });
    }
};
