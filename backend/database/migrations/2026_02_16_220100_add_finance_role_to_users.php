<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'finance_role')) {
                $table->enum('finance_role', ['auditor', 'treasurer'])->nullable()->after('role_id');
                $table->index('finance_role');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'finance_role')) {
                $table->dropIndex(['finance_role']);
                $table->dropColumn('finance_role');
            }
        });
    }
};
