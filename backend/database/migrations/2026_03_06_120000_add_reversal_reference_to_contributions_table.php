<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contributions', function (Blueprint $table) {
            $table->foreignId('reversal_of_contribution_id')
                ->nullable()
                ->after('recipient_name')
                ->constrained('contributions')
                ->nullOnDelete();

            $table->index('reversal_of_contribution_id');
        });
    }

    public function down(): void
    {
        Schema::table('contributions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reversal_of_contribution_id');
        });
    }
};
