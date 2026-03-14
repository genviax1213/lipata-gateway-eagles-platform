<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            if (!Schema::hasColumn('members', 'nickname')) {
                $table->string('nickname', 120)->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('members', 'place_of_birth')) {
                $table->string('place_of_birth', 180)->nullable()->after('date_of_birth');
            }
            if (!Schema::hasColumn('members', 'civil_status')) {
                $table->string('civil_status', 50)->nullable()->after('place_of_birth');
            }
            if (!Schema::hasColumn('members', 'height_cm')) {
                $table->decimal('height_cm', 5, 2)->nullable()->after('civil_status');
            }
            if (!Schema::hasColumn('members', 'weight_kg')) {
                $table->decimal('weight_kg', 5, 2)->nullable()->after('height_cm');
            }
            if (!Schema::hasColumn('members', 'citizenship')) {
                $table->string('citizenship', 120)->nullable()->after('weight_kg');
            }
            if (!Schema::hasColumn('members', 'religion')) {
                $table->string('religion', 120)->nullable()->after('citizenship');
            }
            if (!Schema::hasColumn('members', 'blood_type')) {
                $table->string('blood_type', 20)->nullable()->after('religion');
            }
            if (!Schema::hasColumn('members', 'telephone_number')) {
                $table->string('telephone_number', 50)->nullable()->after('contact_number');
            }
            if (!Schema::hasColumn('members', 'emergency_contact_number')) {
                $table->string('emergency_contact_number', 50)->nullable()->after('telephone_number');
            }
            if (!Schema::hasColumn('members', 'region')) {
                $table->string('region', 120)->nullable()->after('emergency_contact_number');
            }
            if (!Schema::hasColumn('members', 'address_line')) {
                $table->string('address_line', 255)->nullable()->after('address');
            }
            if (!Schema::hasColumn('members', 'street_no')) {
                $table->string('street_no', 120)->nullable()->after('address_line');
            }
            if (!Schema::hasColumn('members', 'barangay')) {
                $table->string('barangay', 120)->nullable()->after('street_no');
            }
            if (!Schema::hasColumn('members', 'city_municipality')) {
                $table->string('city_municipality', 120)->nullable()->after('barangay');
            }
            if (!Schema::hasColumn('members', 'province')) {
                $table->string('province', 120)->nullable()->after('city_municipality');
            }
            if (!Schema::hasColumn('members', 'zip_code')) {
                $table->string('zip_code', 20)->nullable()->after('province');
            }
            if (!Schema::hasColumn('members', 'hobbies')) {
                $table->text('hobbies')->nullable()->after('zip_code');
            }
            if (!Schema::hasColumn('members', 'special_skills')) {
                $table->text('special_skills')->nullable()->after('hobbies');
            }
        });
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $columns = [
                'special_skills',
                'hobbies',
                'zip_code',
                'province',
                'city_municipality',
                'barangay',
                'street_no',
                'address_line',
                'region',
                'emergency_contact_number',
                'telephone_number',
                'blood_type',
                'religion',
                'citizenship',
                'weight_kg',
                'height_cm',
                'civil_status',
                'place_of_birth',
                'nickname',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('members', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
