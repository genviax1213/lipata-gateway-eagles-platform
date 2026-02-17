<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_notices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_application_id')->constrained('member_applications')->cascadeOnDelete();
            $table->text('notice_text');
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_notices');
    }
};
