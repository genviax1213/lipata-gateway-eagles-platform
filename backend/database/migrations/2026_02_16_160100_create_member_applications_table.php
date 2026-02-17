<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_applications', function (Blueprint $table) {
            $table->id();
            $table->string('first_name', 120);
            $table->string('middle_name', 120)->nullable();
            $table->string('last_name', 120);
            $table->string('email')->index();
            $table->enum('membership_status', ['active', 'inactive', 'applicant'])->default('applicant');
            $table->enum('status', ['pending_verification', 'pending_approval', 'approved', 'rejected'])
                ->default('pending_verification')
                ->index();
            $table->string('verification_token', 120)->index();
            $table->timestamp('email_verified_at')->nullable();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('rejection_reason', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_applications');
    }
};
