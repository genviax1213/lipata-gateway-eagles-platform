<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('applicant_batches', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->text('description')->nullable();
            $table->date('start_date')->nullable();
            $table->date('target_completion_date')->nullable();
            $table->foreignId('batch_treasurer_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('applicant_batch_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('applicant_batch_id')->constrained('applicant_batches')->cascadeOnDelete();
            $table->string('file_path', 255);
            $table->string('original_name', 255);
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('applicants', function (Blueprint $table) {
            if (!Schema::hasColumn('applicants', 'batch_id')) {
                $table->foreignId('batch_id')->nullable()->after('member_id')->constrained('applicant_batches')->nullOnDelete();
            }
            if (!Schema::hasColumn('applicants', 'activated_at')) {
                $table->timestamp('activated_at')->nullable()->after('reviewed_at');
            }
            if (!Schema::hasColumn('applicants', 'activated_by_user_id')) {
                $table->foreignId('activated_by_user_id')->nullable()->after('activated_at')->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            if (Schema::hasColumn('applicants', 'activated_by_user_id')) {
                $table->dropConstrainedForeignId('activated_by_user_id');
            }
            if (Schema::hasColumn('applicants', 'activated_at')) {
                $table->dropColumn('activated_at');
            }
            if (Schema::hasColumn('applicants', 'batch_id')) {
                $table->dropConstrainedForeignId('batch_id');
            }
        });

        Schema::dropIfExists('applicant_batch_documents');
        Schema::dropIfExists('applicant_batches');
    }
};
