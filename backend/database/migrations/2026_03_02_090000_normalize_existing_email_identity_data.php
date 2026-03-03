<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL");
        DB::statement("UPDATE members SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL");
        DB::statement("UPDATE member_applications SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL");
    }

    public function down(): void
    {
        // Irreversible data normalization.
    }
};
