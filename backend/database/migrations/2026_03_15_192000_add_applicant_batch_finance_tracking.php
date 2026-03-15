<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicant_fee_payments', function (Blueprint $table): void {
            if (!Schema::hasColumn('applicant_fee_payments', 'verification_status')) {
                $table->string('verification_status', 40)->default('pending')->after('note');
            }
            if (!Schema::hasColumn('applicant_fee_payments', 'verification_comment')) {
                $table->text('verification_comment')->nullable()->after('verification_status');
            }
            if (!Schema::hasColumn('applicant_fee_payments', 'verified_by_user_id')) {
                $table->foreignId('verified_by_user_id')->nullable()->after('verification_comment')->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('applicant_fee_payments', 'verified_at')) {
                $table->timestamp('verified_at')->nullable()->after('verified_by_user_id');
            }
        });

        Schema::create('applicant_batch_expenses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('applicant_batch_id')->constrained('applicant_batches')->cascadeOnDelete();
            $table->date('expense_date');
            $table->string('category', 80);
            $table->string('description', 255);
            $table->decimal('amount', 12, 2);
            $table->text('note')->nullable();
            $table->string('verification_status', 40)->default('pending');
            $table->text('verification_comment')->nullable();
            $table->foreignId('encoded_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('verified_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index(['applicant_batch_id', 'expense_date'], 'applicant_batch_expenses_batch_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('applicant_batch_expenses');

        Schema::table('applicant_fee_payments', function (Blueprint $table): void {
            if (Schema::hasColumn('applicant_fee_payments', 'verified_by_user_id')) {
                $table->dropConstrainedForeignId('verified_by_user_id');
            }
            if (Schema::hasColumn('applicant_fee_payments', 'verified_at')) {
                $table->dropColumn('verified_at');
            }
            if (Schema::hasColumn('applicant_fee_payments', 'verification_comment')) {
                $table->dropColumn('verification_comment');
            }
            if (Schema::hasColumn('applicant_fee_payments', 'verification_status')) {
                $table->dropColumn('verification_status');
            }
        });
    }
};
