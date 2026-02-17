<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('members', function (Blueprint $table) {
            $table->id();
            $table->string('member_number')->unique();
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->enum('membership_status', ['active', 'inactive', 'applicant'])->default('active');
            $table->timestamps();

            $table->index(['last_name', 'first_name']);
            $table->index('membership_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('members');
    }
};
