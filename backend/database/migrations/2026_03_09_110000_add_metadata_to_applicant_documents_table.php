<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicant_documents', function (Blueprint $table) {
            if (!Schema::hasColumn('applicant_documents', 'document_label')) {
                $table->string('document_label', 120)->nullable()->after('original_name');
            }

            if (!Schema::hasColumn('applicant_documents', 'description')) {
                $table->string('description', 255)->nullable()->after('document_label');
            }
        });
    }

    public function down(): void
    {
        Schema::table('applicant_documents', function (Blueprint $table) {
            if (Schema::hasColumn('applicant_documents', 'description')) {
                $table->dropColumn('description');
            }

            if (Schema::hasColumn('applicant_documents', 'document_label')) {
                $table->dropColumn('document_label');
            }
        });
    }
};
