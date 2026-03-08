<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_registrations', function (Blueprint $table) {
            $table->id();
            $table->string('first_name', 120);
            $table->string('middle_name', 120);
            $table->string('last_name', 120);
            $table->string('email')->index();
            $table->string('password');
            $table->enum('status', ['pending_verification', 'completed'])->default('pending_verification')->index();
            $table->string('verification_token', 64)->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('member_id')->nullable()->constrained('members')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_registrations');
    }
};
