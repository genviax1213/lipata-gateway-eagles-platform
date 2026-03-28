<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('portal_password_recovery_tokens', function (Blueprint $table): void {
            $table->id();
            $table->string('email');
            $table->string('recovery_email');
            $table->string('token', 64);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['email', 'expires_at'], 'portal_recovery_email_expires_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('portal_password_recovery_tokens');
    }
};

