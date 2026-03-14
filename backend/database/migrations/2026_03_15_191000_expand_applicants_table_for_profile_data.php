<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            if (!Schema::hasColumn('applicants', 'nickname')) {
                $table->string('nickname', 120)->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('applicants', 'spouse_name')) {
                $table->string('spouse_name', 180)->nullable()->after('last_name');
            }
            if (!Schema::hasColumn('applicants', 'contact_number')) {
                $table->string('contact_number', 50)->nullable()->after('email');
            }
            if (!Schema::hasColumn('applicants', 'telephone_number')) {
                $table->string('telephone_number', 50)->nullable()->after('contact_number');
            }
            if (!Schema::hasColumn('applicants', 'emergency_contact_number')) {
                $table->string('emergency_contact_number', 50)->nullable()->after('telephone_number');
            }
            if (!Schema::hasColumn('applicants', 'address')) {
                $table->text('address')->nullable()->after('emergency_contact_number');
            }
            if (!Schema::hasColumn('applicants', 'address_line')) {
                $table->string('address_line', 255)->nullable()->after('address');
            }
            if (!Schema::hasColumn('applicants', 'street_no')) {
                $table->string('street_no', 120)->nullable()->after('address_line');
            }
            if (!Schema::hasColumn('applicants', 'barangay')) {
                $table->string('barangay', 120)->nullable()->after('street_no');
            }
            if (!Schema::hasColumn('applicants', 'city_municipality')) {
                $table->string('city_municipality', 120)->nullable()->after('barangay');
            }
            if (!Schema::hasColumn('applicants', 'province')) {
                $table->string('province', 120)->nullable()->after('city_municipality');
            }
            if (!Schema::hasColumn('applicants', 'zip_code')) {
                $table->string('zip_code', 20)->nullable()->after('province');
            }
            if (!Schema::hasColumn('applicants', 'date_of_birth')) {
                $table->date('date_of_birth')->nullable()->after('zip_code');
            }
            if (!Schema::hasColumn('applicants', 'place_of_birth')) {
                $table->string('place_of_birth', 180)->nullable()->after('date_of_birth');
            }
            if (!Schema::hasColumn('applicants', 'civil_status')) {
                $table->string('civil_status', 50)->nullable()->after('place_of_birth');
            }
            if (!Schema::hasColumn('applicants', 'height_cm')) {
                $table->decimal('height_cm', 5, 2)->nullable()->after('civil_status');
            }
            if (!Schema::hasColumn('applicants', 'weight_kg')) {
                $table->decimal('weight_kg', 5, 2)->nullable()->after('height_cm');
            }
            if (!Schema::hasColumn('applicants', 'citizenship')) {
                $table->string('citizenship', 120)->nullable()->after('weight_kg');
            }
            if (!Schema::hasColumn('applicants', 'religion')) {
                $table->string('religion', 120)->nullable()->after('citizenship');
            }
            if (!Schema::hasColumn('applicants', 'blood_type')) {
                $table->string('blood_type', 20)->nullable()->after('religion');
            }
            if (!Schema::hasColumn('applicants', 'region')) {
                $table->string('region', 120)->nullable()->after('blood_type');
            }
            if (!Schema::hasColumn('applicants', 'hobbies')) {
                $table->text('hobbies')->nullable()->after('region');
            }
            if (!Schema::hasColumn('applicants', 'special_skills')) {
                $table->text('special_skills')->nullable()->after('hobbies');
            }
        });
    }

    public function down(): void
    {
        Schema::table('applicants', function (Blueprint $table) {
            $columns = [
                'special_skills',
                'hobbies',
                'region',
                'blood_type',
                'religion',
                'citizenship',
                'weight_kg',
                'height_cm',
                'civil_status',
                'place_of_birth',
                'date_of_birth',
                'zip_code',
                'province',
                'city_municipality',
                'barangay',
                'street_no',
                'address_line',
                'address',
                'emergency_contact_number',
                'telephone_number',
                'contact_number',
                'spouse_name',
                'nickname',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('applicants', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
