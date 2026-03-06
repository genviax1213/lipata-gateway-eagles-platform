<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('finance_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name', 100);
            $table->string('account_type', 32);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        DB::table('finance_accounts')->insert([
            [
                'code' => 'bank',
                'name' => 'Bank Account',
                'account_type' => 'bank',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'gcash',
                'name' => 'GCash',
                'account_type' => 'gcash',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'cash_on_hand',
                'name' => 'Cash On Hand',
                'account_type' => 'cash_on_hand',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_accounts');
    }
};
