<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('category', 64);
            $table->date('expense_date');
            $table->decimal('amount', 12, 2);
            $table->string('note', 255);
            $table->string('payee_name', 255);
            $table->foreignId('finance_account_id')->constrained('finance_accounts')->cascadeOnDelete();
            $table->string('support_reference', 255)->nullable();
            $table->string('approval_reference', 255)->nullable();
            $table->foreignId('beneficiary_member_id')->nullable()->constrained('members')->nullOnDelete();
            $table->foreignId('reversal_of_expense_id')->nullable()->constrained('expenses')->nullOnDelete();
            $table->foreignId('encoded_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('encoded_at');
            $table->timestamps();

            $table->index(['finance_account_id', 'expense_date']);
            $table->index(['category', 'expense_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
