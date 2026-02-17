<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $toTitle = function (?string $value): ?string {
            if ($value === null) {
                return null;
            }

            $trimmed = Str::of($value)->trim()->squish()->value();
            if ($trimmed === '') {
                return '';
            }

            return Str::of($trimmed)->lower()->title()->value();
        };

        $toUpper = function (?string $value): ?string {
            if ($value === null) {
                return null;
            }

            $trimmed = Str::of($value)->trim()->squish()->value();
            if ($trimmed === '') {
                return '';
            }

            return Str::upper($trimmed);
        };

        if (Schema::hasTable('members')) {
            DB::table('members')
                ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name'])
                ->orderBy('id')
                ->chunkById(200, function ($rows) use ($toTitle, $toUpper) {
                    foreach ($rows as $row) {
                        DB::table('members')->where('id', $row->id)->update([
                            'member_number' => $toUpper($row->member_number),
                            'first_name' => $toTitle($row->first_name),
                            'middle_name' => $toTitle($row->middle_name),
                            'last_name' => $toTitle($row->last_name),
                        ]);
                    }
                });
        }

        if (Schema::hasTable('member_applications')) {
            DB::table('member_applications')
                ->select(['id', 'first_name', 'middle_name', 'last_name'])
                ->orderBy('id')
                ->chunkById(200, function ($rows) use ($toTitle) {
                    foreach ($rows as $row) {
                        DB::table('member_applications')->where('id', $row->id)->update([
                            'first_name' => $toTitle($row->first_name),
                            'middle_name' => $toTitle($row->middle_name),
                            'last_name' => $toTitle($row->last_name),
                        ]);
                    }
                });
        }

        if (Schema::hasTable('users')) {
            DB::table('users')
                ->select(['id', 'name'])
                ->orderBy('id')
                ->chunkById(200, function ($rows) use ($toTitle) {
                    foreach ($rows as $row) {
                        DB::table('users')->where('id', $row->id)->update([
                            'name' => $toTitle($row->name),
                        ]);
                    }
                });
        }

        if (Schema::hasTable('contributions')) {
            DB::table('contributions')
                ->select(['id', 'recipient_name', 'note'])
                ->orderBy('id')
                ->chunkById(200, function ($rows) use ($toTitle) {
                    foreach ($rows as $row) {
                        DB::table('contributions')->where('id', $row->id)->update([
                            'recipient_name' => $toTitle($row->recipient_name),
                            'note' => $toTitle($row->note),
                        ]);
                    }
                });
        }
    }

    public function down(): void
    {
        // Irreversible normalization.
    }
};
