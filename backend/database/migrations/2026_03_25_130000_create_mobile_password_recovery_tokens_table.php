<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_password_recovery_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('email');
            $table->string('recovery_email');
            $table->string('token', 64);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['email', 'expires_at'], 'mobile_recovery_email_expires_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_password_recovery_tokens');
    }
};
