<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('applicant_fee_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('applicant_fee_requirement_id')->constrained('applicant_fee_requirements')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->date('payment_date');
            $table->string('note', 255)->nullable();
            $table->foreignId('encoded_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('applicant_fee_payments');
    }
};
