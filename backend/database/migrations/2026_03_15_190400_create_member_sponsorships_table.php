<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('member_sponsorships')) {
            return;
        }

        Schema::create('member_sponsorships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sponsor_member_id')->nullable()->constrained('members')->nullOnDelete();
            $table->string('sponsor_name', 180)->nullable();
            $table->date('sponsor_date')->nullable();
            $table->string('sponsor_signature_name', 180)->nullable();
            $table->string('applicant_signature_name', 180)->nullable();
            $table->date('applicant_signed_at')->nullable();
            $table->timestamps();

            $table->unique('member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_sponsorships');
    }
};
