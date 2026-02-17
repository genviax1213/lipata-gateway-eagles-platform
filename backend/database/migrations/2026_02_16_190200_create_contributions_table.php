<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('members')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('note', 255)->nullable();
            $table->foreignId('encoded_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('encoded_at');
            $table->timestamps();

            $table->index(['member_id', 'encoded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contributions');
    }
};

