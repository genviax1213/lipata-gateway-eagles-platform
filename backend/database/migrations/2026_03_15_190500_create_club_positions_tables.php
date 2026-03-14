<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('club_positions')) {
            Schema::create('club_positions', function (Blueprint $table) {
                $table->id();
                $table->string('name', 180);
                $table->string('code', 80)->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();

                $table->unique('name');
                $table->unique('code');
            });
        }

        if (!Schema::hasTable('member_club_positions')) {
            Schema::create('member_club_positions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('member_id')->constrained()->cascadeOnDelete();
                $table->foreignId('club_position_id')->constrained('club_positions')->cascadeOnDelete();
                $table->string('eagle_year', 50)->nullable();
                $table->date('started_at')->nullable();
                $table->date('ended_at')->nullable();
                $table->boolean('is_current')->default(true);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('member_club_positions');
        Schema::dropIfExists('club_positions');
    }
};
