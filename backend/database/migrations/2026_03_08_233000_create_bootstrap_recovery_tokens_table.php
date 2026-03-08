<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bootstrap_recovery_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('email')->index();
            $table->string('recovery_email');
            $table->string('token');
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bootstrap_recovery_tokens');
    }
};
