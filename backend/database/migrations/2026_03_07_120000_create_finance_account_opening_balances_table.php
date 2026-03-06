<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('finance_account_opening_balances')) {
            Schema::table('finance_account_opening_balances', function (Blueprint $table) {
                if (!$this->indexExists('finance_account_opening_balances', 'faob_account_effective_idx')) {
                    $table->index(['finance_account_id', 'effective_date'], 'faob_account_effective_idx');
                }

                if (!$this->foreignKeyExists('finance_account_opening_balances', 'faob_account_fk')) {
                    $table->foreign('finance_account_id', 'faob_account_fk')
                        ->references('id')
                        ->on('finance_accounts')
                        ->cascadeOnDelete();
                }

                if (!$this->foreignKeyExists('finance_account_opening_balances', 'faob_reversal_fk')) {
                    $table->foreign('reversal_of_opening_balance_id', 'faob_reversal_fk')
                        ->references('id')
                        ->on('finance_account_opening_balances')
                        ->nullOnDelete();
                }

                if (!$this->foreignKeyExists('finance_account_opening_balances', 'faob_user_fk')) {
                    $table->foreign('encoded_by_user_id', 'faob_user_fk')
                        ->references('id')
                        ->on('users')
                        ->cascadeOnDelete();
                }
            });

            return;
        }

        Schema::create('finance_account_opening_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('finance_account_id');
            $table->date('effective_date');
            $table->decimal('amount', 12, 2);
            $table->string('note', 255);
            $table->foreignId('reversal_of_opening_balance_id')->nullable();
            $table->foreignId('encoded_by_user_id');
            $table->timestamp('encoded_at');
            $table->timestamps();

            $table->index(['finance_account_id', 'effective_date'], 'faob_account_effective_idx');

            $table->foreign('finance_account_id', 'faob_account_fk')
                ->references('id')
                ->on('finance_accounts')
                ->cascadeOnDelete();
            $table->foreign('reversal_of_opening_balance_id', 'faob_reversal_fk')
                ->references('id')
                ->on('finance_account_opening_balances')
                ->nullOnDelete();
            $table->foreign('encoded_by_user_id', 'faob_user_fk')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_account_opening_balances');
    }

    private function foreignKeyExists(string $table, string $constraintName): bool
    {
        $result = DB::selectOne(
            'select constraint_name from information_schema.table_constraints where table_schema = database() and table_name = ? and constraint_name = ? and constraint_type = ? limit 1',
            [$table, $constraintName, 'FOREIGN KEY']
        );

        return $result !== null;
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $result = DB::selectOne(
            'select index_name from information_schema.statistics where table_schema = database() and table_name = ? and index_name = ? limit 1',
            [$table, $indexName]
        );

        return $result !== null;
    }
};
