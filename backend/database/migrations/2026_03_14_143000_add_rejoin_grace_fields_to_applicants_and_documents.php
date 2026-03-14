<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            if (!Schema::hasColumn('applicants', 'withdrawn_at')) {
                $table->timestamp('withdrawn_at')->nullable()->after('reviewed_at');
            }

            if (!Schema::hasColumn('applicants', 'document_reuse_until')) {
                $table->timestamp('document_reuse_until')->nullable()->after('withdrawn_at');
            }

            if (!Schema::hasColumn('applicants', 'rejoined_from_application_id')) {
                $table->foreignId('rejoined_from_application_id')
                    ->nullable()
                    ->after('batch_id')
                    ->constrained('applicants')
                    ->nullOnDelete();
            }
        });

        Schema::table('applicant_documents', function (Blueprint $table) {
            if (!Schema::hasColumn('applicant_documents', 'reused_from_document_id')) {
                $table->foreignId('reused_from_document_id')
                    ->nullable()
                    ->after('applicant_id')
                    ->constrained('applicant_documents')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('applicant_documents', 'reused_under_grace_period')) {
                $table->boolean('reused_under_grace_period')->default(false)->after('description');
            }

            if (!Schema::hasColumn('applicant_documents', 'reused_at')) {
                $table->timestamp('reused_at')->nullable()->after('reused_under_grace_period');
            }
        });
    }

    public function down(): void
    {
        Schema::table('applicant_documents', function (Blueprint $table) {
            if (Schema::hasColumn('applicant_documents', 'reused_at')) {
                $table->dropColumn('reused_at');
            }

            if (Schema::hasColumn('applicant_documents', 'reused_under_grace_period')) {
                $table->dropColumn('reused_under_grace_period');
            }

            if (Schema::hasColumn('applicant_documents', 'reused_from_document_id')) {
                $table->dropConstrainedForeignId('reused_from_document_id');
            }
        });

        Schema::table('applicants', function (Blueprint $table) {
            if (Schema::hasColumn('applicants', 'rejoined_from_application_id')) {
                $table->dropConstrainedForeignId('rejoined_from_application_id');
            }

            if (Schema::hasColumn('applicants', 'document_reuse_until')) {
                $table->dropColumn('document_reuse_until');
            }

            if (Schema::hasColumn('applicants', 'withdrawn_at')) {
                $table->dropColumn('withdrawn_at');
            }
        });
    }
};
