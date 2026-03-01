<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('member_applications')
            ->select(['id', 'verification_token'])
            ->orderBy('id')
            ->chunkById(200, function ($rows) {
                foreach ($rows as $row) {
                    $token = (string) ($row->verification_token ?? '');
                    if ($token === '') {
                        continue;
                    }

                    // Already hashed token (sha256 hex).
                    if (preg_match('/^[a-f0-9]{64}$/', $token) === 1) {
                        continue;
                    }

                    DB::table('member_applications')
                        ->where('id', $row->id)
                        ->update([
                            'verification_token' => hash('sha256', $token),
                        ]);
                }
            });
    }

    public function down(): void
    {
        // One-way hash migration; no safe rollback to plaintext token.
    }
};
