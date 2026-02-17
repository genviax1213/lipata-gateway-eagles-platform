<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contribution_edit_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contribution_id')->constrained('contributions')->cascadeOnDelete();
            $table->decimal('requested_amount', 12, 2);
            $table->string('reason', 255);
            $table->foreignId('requested_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('review_notes', 255)->nullable();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contribution_edit_requests');
    }
};

