<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_fee_requirements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_application_id')->constrained('member_applications')->cascadeOnDelete();
            $table->decimal('required_amount', 12, 2);
            $table->string('note', 255)->nullable();
            $table->foreignId('set_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_fee_requirements');
    }
};
