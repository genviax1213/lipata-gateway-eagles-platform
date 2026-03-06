<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance_audit_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('members')->cascadeOnDelete();
            $table->foreignId('contribution_id')->nullable()->constrained('contributions')->nullOnDelete();
            $table->string('target_month', 7);
            $table->string('category', 64);
            $table->string('discrepancy_type', 64);
            $table->string('status', 32);
            $table->text('note_text');
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['target_month', 'category']);
            $table->index(['member_id', 'discrepancy_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_audit_notes');
    }
};
