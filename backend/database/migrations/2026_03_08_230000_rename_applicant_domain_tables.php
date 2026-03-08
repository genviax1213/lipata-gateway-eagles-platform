<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function renameTableIfNeeded(string $from, string $to): void
    {
        if (Schema::hasTable($from) && !Schema::hasTable($to)) {
            Schema::rename($from, $to);
        }
    }

    private function renameColumnIfNeeded(string $table, string $from, string $to): void
    {
        if (Schema::hasTable($table) && Schema::hasColumn($table, $from) && !Schema::hasColumn($table, $to)) {
            Schema::table($table, function (Blueprint $table) use ($from, $to): void {
                $table->renameColumn($from, $to);
            });
        }
    }

    public function up(): void
    {
        $this->renameTableIfNeeded('member_applications', 'applicants');
        $this->renameTableIfNeeded('application_documents', 'applicant_documents');
        $this->renameTableIfNeeded('application_notices', 'applicant_notices');
        $this->renameTableIfNeeded('application_fee_requirements', 'applicant_fee_requirements');
        $this->renameTableIfNeeded('application_fee_payments', 'applicant_fee_payments');

        $this->renameColumnIfNeeded('applicant_documents', 'member_application_id', 'applicant_id');
        $this->renameColumnIfNeeded('applicant_notices', 'member_application_id', 'applicant_id');
        $this->renameColumnIfNeeded('applicant_fee_requirements', 'member_application_id', 'applicant_id');
        $this->renameColumnIfNeeded('applicant_fee_payments', 'application_fee_requirement_id', 'applicant_fee_requirement_id');
    }

    public function down(): void
    {
        $this->renameColumnIfNeeded('applicant_fee_payments', 'applicant_fee_requirement_id', 'application_fee_requirement_id');
        $this->renameColumnIfNeeded('applicant_fee_requirements', 'applicant_id', 'member_application_id');
        $this->renameColumnIfNeeded('applicant_notices', 'applicant_id', 'member_application_id');
        $this->renameColumnIfNeeded('applicant_documents', 'applicant_id', 'member_application_id');

        $this->renameTableIfNeeded('applicant_fee_payments', 'application_fee_payments');
        $this->renameTableIfNeeded('applicant_fee_requirements', 'application_fee_requirements');
        $this->renameTableIfNeeded('applicant_notices', 'application_notices');
        $this->renameTableIfNeeded('applicant_documents', 'application_documents');
        $this->renameTableIfNeeded('applicants', 'member_applications');
    }
};
